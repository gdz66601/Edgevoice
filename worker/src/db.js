import { pickAttachment, publicFileUrl } from './utils.js';
import { validateMessage } from './validation.js';

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

export async function getUserById(db, userId) {
  const { results } = await db
    .prepare(
      `SELECT *
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(Number(userId))
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
         cm.muted_until,
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
    mutedUntil: row.muted_until || null,
    joinedAt: row.joined_at
  }));
}

export async function getChannelMemberModeration(db, channelId, userId) {
  const { results } = await db
    .prepare(
      `SELECT role, muted_until
       FROM channel_members
       WHERE channel_id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(Number(channelId), Number(userId))
    .all();

  return results[0] || null;
}

export async function setChannelMemberMute(db, channelId, userId, mutedUntil) {
  await db
    .prepare(
      `UPDATE channel_members
       SET muted_until = ?
       WHERE channel_id = ?
         AND user_id = ?
         AND role != 'owner'`
    )
    .bind(mutedUntil || null, Number(channelId), Number(userId))
    .run();
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

export async function insertMessage(db, { channelId, senderId, content, attachment }) {
  const cleanAttachment = pickAttachment(attachment);

  // 验证和清理消息内容（防止 XSS）
  const validation = validateMessage(content || '');
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanContent = validation.sanitized;

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
  const ensureMembers = async (channelId) => {
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
         VALUES (?, ?, 'member', ?)`
      ).bind(channelId, Number(actorId), Number(actorId)),
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, invited_by)
         VALUES (?, ?, 'member', ?)`
      ).bind(channelId, Number(targetUserId), Number(actorId))
    ]);
  };

  try {
    // 使用 INSERT OR IGNORE + SELECT 的原子操作处理并发
    // 首先尝试插入，如果 dm_key 已存在则忽略
    const insertResult = await db.prepare(
      `INSERT OR IGNORE INTO channels (name, description, kind, dm_key, created_by)
       VALUES (?, '', 'dm', ?, ?)
       RETURNING id, name, dm_key`
    )
      .bind(dmKey, dmKey, Number(actorId))
      .first();

    // 获取频道 ID（可能是新插入的，也可能是已存在的）
    let channelId;
    if (insertResult) {
      channelId = insertResult.id;
    } else {
      // 插入被忽略（因为 dm_key 已存在），查询现有频道
      const existing = await db.prepare(
        `SELECT id, name, dm_key
         FROM channels
         WHERE kind = 'dm'
           AND dm_key = ?
           AND deleted_at IS NULL
         LIMIT 1`
      )
        .bind(dmKey)
        .first();

      if (!existing) {
        throw new Error('Failed to ensure DM channel');
      }

      channelId = existing.id;
      await ensureMembers(channelId);
      return existing;
    }

    // 添加成员（使用 INSERT OR IGNORE 处理并发）
    await ensureMembers(channelId);

    return {
      id: channelId,
      name: dmKey,
      dm_key: dmKey
    };
  } catch (error) {
    // 如果插入失败（例如 UNIQUE 约束冲突），尝试查询现有频道
    const existing = await db.prepare(
      `SELECT id, name, dm_key
       FROM channels
       WHERE kind = 'dm'
         AND dm_key = ?
         AND deleted_at IS NULL
       LIMIT 1`
    )
      .bind(dmKey)
      .first();

    if (existing) {
      await ensureMembers(existing.id);
      return existing;
    }

    throw error;
  }
}
