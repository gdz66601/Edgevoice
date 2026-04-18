import { hashPassword } from '../auth.js';
import { getSiteSettings, listMessages, requireAccessibleRoom, updateSiteSettings } from '../db.js';
import { ApiError } from '../errors.js';
import { errorResponse, parseJsonRequest, randomToken, sanitizeLimit } from '../utils.js';

export function registerAdminRoutes(app) {
  app.get('/api/admin/overview', async (c) => {
    const [usersResult, channelsResult, dmsResult, site] = await Promise.all([
      c.env.DB.prepare(
        `SELECT
           id,
           username,
           display_name,
           avatar_key,
           is_disabled,
           created_at
         FROM users
         WHERE deleted_at IS NULL
         ORDER BY created_at DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT
           c.id,
           c.name,
           c.description,
           c.kind,
           c.created_at,
           owner.display_name AS owner_display_name,
           (
             SELECT COUNT(*)
             FROM channel_members cm
             WHERE cm.channel_id = c.id
           ) AS member_count,
           (
             SELECT COUNT(*)
             FROM messages m
             WHERE m.channel_id = c.id AND m.deleted_at IS NULL
           ) AS message_count
         FROM channels c
         LEFT JOIN users owner ON owner.id = c.created_by
         WHERE c.deleted_at IS NULL
           AND c.kind IN ('public', 'private')
         ORDER BY c.created_at DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT
           c.id,
           c.dm_key,
           c.created_at,
           (
             SELECT GROUP_CONCAT(display_name, ' / ')
             FROM (
               SELECT u.display_name AS display_name
               FROM channel_members cm
               JOIN users u ON u.id = cm.user_id
               WHERE cm.channel_id = c.id
                 AND u.deleted_at IS NULL
               ORDER BY u.id ASC
             )
           ) AS participants,
           (
             SELECT COUNT(*)
             FROM messages m
             WHERE m.channel_id = c.id
               AND m.deleted_at IS NULL
           ) AS message_count
         FROM channels c
         WHERE c.kind = 'dm'
           AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC`
      ).all()
      ,
      getSiteSettings(c.env.DB)
    ]);

    return c.json({
      site,
      users: usersResult.results.map((row) => ({
        id: Number(row.id),
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_key ? `/files/${encodeURIComponent(row.avatar_key)}` : '',
        isDisabled: Boolean(Number(row.is_disabled)),
        createdAt: row.created_at
      })),
      channels: channelsResult.results.map((row) => ({
        id: Number(row.id),
        name: row.name,
        description: row.description,
        kind: row.kind,
        createdAt: row.created_at,
        ownerDisplayName: row.owner_display_name || '未知',
        memberCount: Number(row.member_count),
        messageCount: Number(row.message_count)
      })),
      dms: dmsResult.results.map((row) => ({
        id: Number(row.id),
        name: row.dm_key,
        participants: row.participants,
        createdAt: row.created_at,
        messageCount: Number(row.message_count)
      }))
    });
  });

  app.get('/api/admin/site-settings', async (c) => {
    const site = await getSiteSettings(c.env.DB);
    return c.json({ site });
  });

  app.patch('/api/admin/site-settings', async (c) => {
    const payload = await parseJsonRequest(c.req.raw);
    const siteName = String(payload.siteName || '').trim();
    const siteIconUrl = String(payload.siteIconUrl || '').trim();

    if (!siteName) {
      return errorResponse('站点名称不能为空');
    }

    const site = await updateSiteSettings(c.env.DB, { siteName, siteIconUrl });
    return c.json({ site });
  });

  app.get('/api/admin/register-links', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT
         ri.id,
         ri.token,
         ri.note,
         ri.created_at,
         ri.consumed_at,
         ri.deleted_at,
         creator.display_name AS creator_display_name,
         consumer.display_name AS consumer_display_name
       FROM registration_invites ri
       LEFT JOIN users creator ON creator.id = ri.created_by
       LEFT JOIN users consumer ON consumer.id = ri.consumed_by_user_id
       ORDER BY ri.created_at DESC`
    ).all();

    return c.json({
      invites: results.map((row) => ({
        id: Number(row.id),
        token: row.token,
        note: row.note || '',
        createdAt: row.created_at,
        consumedAt: row.consumed_at || null,
        deletedAt: row.deleted_at || null,
        creatorDisplayName: row.creator_display_name || '管理员',
        consumerDisplayName: row.consumer_display_name || '',
        isAvailable: !row.deleted_at && !row.consumed_at
      }))
    });
  });

  app.post('/api/admin/register-links', async (c) => {
    const session = c.get('session');
    const payload = await parseJsonRequest(c.req.raw);
    const note = String(payload.note || '').trim();
    const token = randomToken(24);

    const result = await c.env.DB.prepare(
      `INSERT INTO registration_invites (token, note, created_by)
       VALUES (?, ?, ?)`
    )
      .bind(token, note, session.userId)
      .run();

    return c.json({
      invite: {
        id: Number(result.meta.last_row_id),
        token,
        note,
        createdAt: new Date().toISOString(),
        consumedAt: null,
        deletedAt: null,
        creatorDisplayName: session.displayName,
        consumerDisplayName: '',
        isAvailable: true
      }
    });
  });

  app.delete('/api/admin/register-links/:inviteId', async (c) => {
    const inviteId = Number(c.req.param('inviteId'));
    if (!Number.isFinite(inviteId)) {
      return errorResponse('注册链接不存在', 404);
    }

    await c.env.DB.prepare(
      `UPDATE registration_invites
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`
    )
      .bind(inviteId)
      .run();

    return c.json({ ok: true });
  });

  app.get('/api/admin/users', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT
         id,
         username,
         display_name,
         avatar_key,
         is_disabled,
         created_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    ).all();

    return c.json({
      users: results.map((row) => ({
        id: Number(row.id),
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_key ? `/files/${encodeURIComponent(row.avatar_key)}` : '',
        isDisabled: Boolean(Number(row.is_disabled)),
        createdAt: row.created_at
      }))
    });
  });

  app.post('/api/admin/users', async (c) => {
    const payload = await parseJsonRequest(c.req.raw);
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    const displayName = String(payload.displayName || username).trim();

    if (!username || !password) {
      return errorResponse('用户名和密码不能为空');
    }

    const hashed = await hashPassword(password);
    const result = await c.env.DB.prepare(
      `INSERT INTO users (
         username,
         display_name,
         password_hash,
         password_salt
       ) VALUES (?, ?, ?, ?)`
    )
      .bind(username, displayName, hashed.hash, hashed.salt)
      .run()
      .catch((error) => {
        if (String(error.message).includes('UNIQUE')) {
          throw new ApiError('用户名已存在');
        }
        throw error;
      });

    return c.json({
      user: {
        id: result.meta.last_row_id,
        username,
        displayName,
        isDisabled: false
      }
    });
  });

  app.patch('/api/admin/users/:userId', async (c) => {
    const userId = Number(c.req.param('userId'));
    const payload = await parseJsonRequest(c.req.raw);
    const isDisabled = payload.isDisabled ? 1 : 0;
    const bumpVersion = isDisabled ? 1 : 0;
    await c.env.DB.prepare(
      `UPDATE users
       SET is_disabled = ?,
           display_name = COALESCE(?, display_name),
           session_version = session_version + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`
    )
      .bind(isDisabled, payload.displayName || null, bumpVersion, userId)
      .run();

    return c.json({ ok: true });
  });

  app.post('/api/admin/users/:userId/reset-password', async (c) => {
    const userId = Number(c.req.param('userId'));
    const payload = await parseJsonRequest(c.req.raw);
    const password = String(payload.password || '');
    if (!password) {
      return errorResponse('新密码不能为空');
    }

    const hashed = await hashPassword(password);
    await c.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?,
            password_salt = ?,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`
    )
      .bind(hashed.hash, hashed.salt, userId)
      .run();

    return c.json({ ok: true });
  });

  app.delete('/api/admin/users/:userId', async (c) => {
    const userId = Number(c.req.param('userId'));
    await c.env.DB.prepare(
      `UPDATE users
       SET deleted_at = CURRENT_TIMESTAMP,
            is_disabled = 1,
            session_version = session_version + 1,
            updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(userId)
      .run();

    return c.json({ ok: true });
  });

  app.get('/api/admin/messages/search', async (c) => {
    const keyword = String(c.req.query('keyword') || '').trim();
    const channelId = Number(c.req.query('channelId') || '');
    const userId = Number(c.req.query('userId') || '');
    const kind = c.req.query('kind');
    const limit = sanitizeLimit(c.req.query('limit'), 50, 200);
    const filters = ['m.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    const binds = [];

    if (keyword) {
      filters.push('(m.content LIKE ? OR m.attachment_name LIKE ?)');
      binds.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (Number.isFinite(channelId)) {
      filters.push('c.id = ?');
      binds.push(channelId);
    }

    if (Number.isFinite(userId)) {
      filters.push('u.id = ?');
      binds.push(userId);
    }

    if (kind === 'public' || kind === 'private' || kind === 'dm') {
      filters.push('c.kind = ?');
      binds.push(kind);
    }

    const { results } = await c.env.DB.prepare(
      `SELECT
         m.id,
         m.content,
         m.attachment_name,
         m.created_at,
         c.id AS channel_id,
         c.name AS channel_name,
         c.kind AS channel_kind,
         u.id AS sender_id,
         u.display_name AS sender_display_name,
         u.username AS sender_username
       FROM messages m
        JOIN channels c ON c.id = m.channel_id
        JOIN users u ON u.id = m.sender_id
        WHERE ${filters.join(' AND ')}
        ORDER BY m.id DESC
        LIMIT ?`
    )
      .bind(...binds, limit)
      .all();

    return c.json({
      messages: results.map((row) => ({
        id: Number(row.id),
        content: row.content,
        attachmentName: row.attachment_name,
        createdAt: row.created_at,
        room: {
          id: Number(row.channel_id),
          name: row.channel_name,
          kind: row.channel_kind
        },
        sender: {
          id: Number(row.sender_id),
          username: row.sender_username,
          displayName: row.sender_display_name
        }
      }))
    });
  });

  app.get('/api/admin/rooms/:kind/:roomId/messages', async (c) => {
    const kind = c.req.param('kind');
    const roomId = Number(c.req.param('roomId'));
    const before = c.req.query('before');
    const room = await requireAccessibleRoom(c.env.DB, 0, kind, roomId, true);
    if (!room) {
      return errorResponse('会话不存在', 404);
    }

    const messages = await listMessages(c.env.DB, roomId, before, 50);
    return c.json({ room, messages });
  });
}
