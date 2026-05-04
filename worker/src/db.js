import { pickAttachment, publicFileUrl } from './utils.js';

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function getUserByUsername(db, username) {
  const { results } = await db
    .prepare(
      `SELECT *
       FROM users
       WHERE username = ?
         AND deleted_at IS NULL
       LIMIT 1`
    )
    .bind(username)
    .all();

  return results[0] || null;
}

export async function isUserActiveById(db, userId) {
  const { results } = await db
    .prepare(
      `SELECT id
       FROM users
       WHERE id = ?
         AND deleted_at IS NULL
         AND is_disabled = 0
       LIMIT 1`
    )
    .bind(Number(userId))
    .all();

  return Boolean(results[0]);
}

export async function getSiteSettings(db) {
  const { results } = await db
    .prepare(
      `SELECT setting_key, setting_value
       FROM site_settings`
    )
    .all();

  const map = Object.fromEntries(results.map((row) => [row.setting_key, row.setting_value]));
  return {
    siteName: String(map.site_name || 'Edgechat'),
    siteIconUrl: String(map.site_icon_url || '')
  };
}

export async function updateSiteSettings(db, { siteName, siteIconUrl }) {
  const statements = [];

  if (siteName !== undefined) {
    statements.push(
      db
        .prepare(
          `INSERT INTO site_settings (setting_key, setting_value, updated_at)
           VALUES ('site_name', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(setting_key) DO UPDATE
           SET setting_value = excluded.setting_value,
               updated_at = CURRENT_TIMESTAMP`
        )
        .bind(String(siteName || 'Edgechat').trim() || 'Edgechat')
    );
  }

  if (siteIconUrl !== undefined) {
    statements.push(
      db
        .prepare(
          `INSERT INTO site_settings (setting_key, setting_value, updated_at)
           VALUES ('site_icon_url', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(setting_key) DO UPDATE
           SET setting_value = excluded.setting_value,
               updated_at = CURRENT_TIMESTAMP`
        )
        .bind(String(siteIconUrl || '').trim())
    );
  }

  if (statements.length) {
    await db.batch(statements);
  }

  return getSiteSettings(db);
}

export async function getChannelById(db, channelId) {
  const { results } = await db
    .prepare(
      `SELECT id, name, description, avatar_key, kind, dm_key, created_by
       FROM channels
       WHERE id = ?
         AND deleted_at IS NULL
       LIMIT 1`
    )
    .bind(Number(channelId))
    .all();

  return results[0] || null;
}

export async function getChannelMembership(db, channelId, userId) {
  const { results } = await db
    .prepare(
      `SELECT channel_id, user_id, role, joined_at
       FROM channel_members
       WHERE channel_id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(Number(channelId), Number(userId))
    .all();

  return results[0] || null;
}

export async function requireAccessibleRoom(db, userId, kind, roomId, isAdmin = false) {
  const numericRoomId = Number(roomId);
  if (!Number.isFinite(numericRoomId)) {
    return null;
  }

  const membershipCondition = isAdmin
    ? '1 = 1'
    : 'EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?)';

  const statement = db.prepare(
    `SELECT c.id, c.name, c.description, c.avatar_key, c.kind, c.dm_key
     FROM channels c
     WHERE c.id = ?
       AND c.kind = ?
       AND c.deleted_at IS NULL
       AND ${membershipCondition}
     LIMIT 1`
  );

  const bound = isAdmin
    ? statement.bind(numericRoomId, kind)
    : statement.bind(numericRoomId, kind, Number(userId));
  const { results } = await bound.all();
  return results[0] || null;
}

export async function canManageChannel(db, channelId, userId, isAdmin = false) {
  const channel = await getChannelById(db, channelId);
  if (!channel || channel.kind === 'dm') {
    return null;
  }

  if (isAdmin) {
    return {
      channel,
      membership: { role: 'owner' }
    };
  }

  const membership = await getChannelMembership(db, channelId, userId);
  if (!membership || membership.role !== 'owner') {
    return null;
  }

  return { channel, membership };
}

export async function listChannelMembers(db, channelId) {
  const { results } = await db
    .prepare(
      `SELECT
         cm.user_id,
         cm.role,
         cm.joined_at,
         u.username,
         u.display_name,
         u.avatar_key
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?
         AND u.deleted_at IS NULL
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 ELSE 1 END, u.display_name ASC`
    )
    .bind(Number(channelId))
    .all();

  return results.map((row) => ({
    id: Number(row.user_id),
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_key ? publicFileUrl(row.avatar_key) : '',
    role: row.role,
    joinedAt: row.joined_at
  }));
}

export async function listMessages(db, roomId, before = null, limit = 30) {
  const filters = ['m.channel_id = ?', 'm.deleted_at IS NULL'];
  const binds = [Number(roomId)];
  if (before) {
    filters.push('m.id < ?');
    binds.push(Number(before));
  }

  const { results } = await db
    .prepare(
      `SELECT
         m.id,
         m.content,
         m.attachment_key,
         m.attachment_name,
         m.attachment_type,
         m.attachment_size,
         m.created_at,
         u.id AS sender_id,
         u.username AS sender_username,
         u.display_name AS sender_display_name,
         u.avatar_key AS sender_avatar_key
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ${filters.join(' AND ')}
       ORDER BY m.id DESC
       LIMIT ?`
    )
    .bind(...binds, Number(limit))
    .all();

  return results
    .map((row) => mapMessage(row))
    .reverse();
}

export async function ensureChannelReadsSchema(db) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS channel_reads (
         channel_id INTEGER NOT NULL,
         user_id INTEGER NOT NULL,
         last_read_message_id INTEGER NOT NULL DEFAULT 0,
         last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (channel_id, user_id),
         FOREIGN KEY (channel_id) REFERENCES channels(id),
         FOREIGN KEY (user_id) REFERENCES users(id),
         FOREIGN KEY (last_read_message_id) REFERENCES messages(id)
       )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_channel_reads_user
       ON channel_reads(user_id, channel_id)`
    )
  ]);
}

export async function markChannelRead(db, channelId, userId, messageId = null) {
  await ensureChannelReadsSchema(db);

  const latestMessageId =
    messageId === null || messageId === undefined
      ? null
      : Math.max(0, Number(messageId) || 0);

  await db
    .prepare(
      `INSERT INTO channel_reads (
         channel_id,
         user_id,
         last_read_message_id,
         last_read_at
       )
       VALUES (
         ?,
         ?,
         COALESCE(
           ?,
           (
             SELECT COALESCE(MAX(m.id), 0)
             FROM messages m
             WHERE m.channel_id = ?
               AND m.deleted_at IS NULL
           )
         ),
         CURRENT_TIMESTAMP
       )
       ON CONFLICT(channel_id, user_id) DO UPDATE
       SET last_read_message_id = CASE
             WHEN excluded.last_read_message_id > channel_reads.last_read_message_id
               THEN excluded.last_read_message_id
             ELSE channel_reads.last_read_message_id
           END,
           last_read_at = CASE
             WHEN excluded.last_read_message_id > channel_reads.last_read_message_id
               THEN CURRENT_TIMESTAMP
             ELSE channel_reads.last_read_at
           END`
    )
    .bind(Number(channelId), Number(userId), latestMessageId, Number(channelId))
    .run();

  const { results } = await db
    .prepare(
      `SELECT last_read_message_id, last_read_at
       FROM channel_reads
       WHERE channel_id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(Number(channelId), Number(userId))
    .all();

  return {
    lastReadMessageId: Number(results[0]?.last_read_message_id || 0),
    lastReadAt: results[0]?.last_read_at || null
  };
}

export async function insertMessage(db, { channelId, senderId, content, attachment }) {
  const cleanAttachment = pickAttachment(attachment);
  const cleanContent = String(content || '').trim();

  if (!cleanContent && !cleanAttachment) {
    throw new Error('Message content cannot be empty');
  }

  const result = await db
    .prepare(
      `INSERT INTO messages (
         channel_id,
         sender_id,
         content,
         attachment_key,
         attachment_name,
         attachment_type,
         attachment_size
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      Number(channelId),
      Number(senderId),
      cleanContent,
      cleanAttachment?.key || null,
      cleanAttachment?.name || null,
      cleanAttachment?.type || null,
      cleanAttachment?.size || null
    )
    .run();

  return getMessageById(db, result.meta.last_row_id);
}

export async function getMessageById(db, messageId) {
  const { results } = await db
    .prepare(
      `SELECT
         m.id,
         m.content,
         m.attachment_key,
         m.attachment_name,
         m.attachment_type,
         m.attachment_size,
         m.created_at,
         u.id AS sender_id,
         u.username AS sender_username,
         u.display_name AS sender_display_name,
         u.avatar_key AS sender_avatar_key
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?
       LIMIT 1`
    )
    .bind(Number(messageId))
    .all();

  return results[0] ? mapMessage(results[0]) : null;
}

export function mapMessage(row) {
  return {
    id: Number(row.id),
    content: row.content,
    createdAt: row.created_at,
    sender: {
      id: Number(row.sender_id),
      username: row.sender_username,
      displayName: row.sender_display_name,
      avatarUrl: row.sender_avatar_key ? publicFileUrl(row.sender_avatar_key) : ''
    },
    attachment: row.attachment_key
      ? {
          key: row.attachment_key,
          name: row.attachment_name,
          type: row.attachment_type,
          size: toNullableNumber(row.attachment_size) || 0,
          url: publicFileUrl(row.attachment_key)
        }
      : null
  };
}

export async function ensureDmChannel(db, actorId, targetUserId) {
  const dmKey = [Number(actorId), Number(targetUserId)].sort((a, b) => a - b).join(':');
  const existing = await db
    .prepare(
      `SELECT id, name, dm_key
       FROM channels
       WHERE kind = 'dm'
         AND dm_key = ?
         AND deleted_at IS NULL
       LIMIT 1`
    )
    .bind(dmKey)
    .all();

  if (existing.results[0]) {
    return existing.results[0];
  }

  const created = await db
    .prepare(
      `INSERT INTO channels (name, description, kind, dm_key, created_by)
       VALUES (?, '', 'dm', ?, ?)`
    )
    .bind(dmKey, dmKey, Number(actorId))
    .run();

  const channelId = created.meta.last_row_id;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
         VALUES (?, ?, 'member', ?)`
      )
      .bind(channelId, Number(actorId), Number(actorId)),
    db
      .prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
         VALUES (?, ?, 'member', ?)`
      )
      .bind(channelId, Number(targetUserId), Number(actorId))
  ]);

  return {
    id: channelId,
    name: dmKey,
    dm_key: dmKey
  };
}
