import { ensureDmChannel } from '../db.js';
import { errorResponse, parseJsonRequest } from '../utils.js';
import { enforceRateLimit } from '../rate-limit.js';

export function registerDmRoutes(app) {
  app.get('/api/dm', async (c) => {
    const session = c.get('session');
    const { results } = await c.env.DB.prepare(
      `SELECT
         c.id,
         c.dm_key,
         other.id AS other_user_id,
         other.username AS other_username,
         other.display_name AS other_display_name,
         other.avatar_key AS other_avatar_key,
         (
           SELECT MAX(m.created_at)
           FROM messages m
           WHERE m.channel_id = c.id AND m.deleted_at IS NULL
         ) AS last_message_at
       FROM channels c
       JOIN channel_members me ON me.channel_id = c.id AND me.user_id = ?
       JOIN channel_members peer ON peer.channel_id = c.id AND peer.user_id != ?
       JOIN users other ON other.id = peer.user_id
       WHERE c.kind = 'dm'
         AND c.deleted_at IS NULL
         AND other.deleted_at IS NULL
       ORDER BY last_message_at DESC NULLS LAST, c.id DESC`
    )
      .bind(session.userId, session.userId)
      .all();

    return c.json({
      dms: results.map((row) => ({
        id: Number(row.id),
        kind: 'dm',
        name: row.dm_key,
        lastMessageAt: row.last_message_at || null,
        otherUser: {
          id: Number(row.other_user_id),
          username: row.other_username,
          displayName: row.other_display_name,
          avatarUrl: row.other_avatar_key ? `/files/${encodeURIComponent(row.other_avatar_key)}` : ''
        }
      }))
    });
  });

  app.post('/api/dm/open', async (c) => {
    const session = c.get('session');
    const payload = await parseJsonRequest(c.req.raw);
    const targetUserId = Number(payload.userId);

    if (!Number.isFinite(targetUserId) || targetUserId === session.userId) {
      return errorResponse('请选择有效用户');
    }

    // 限流：单用户每分钟最多 20 次 DM open（含已存在的复用），阻止批量制造私聊通道。
    const limited = await enforceRateLimit(c, 'dm-open', String(session.userId), {
      max: 20,
      windowSeconds: 60
    });
    if (limited) return limited;

    const targetUser = await c.env.DB.prepare(
      `SELECT id, username, display_name, avatar_key
       FROM users
       WHERE id = ?
         AND is_disabled = 0
         AND deleted_at IS NULL
       LIMIT 1`
    )
      .bind(targetUserId)
      .all();

    if (!targetUser.results[0]) {
      return errorResponse('目标用户不存在', 404);
    }

    const channel = await ensureDmChannel(c.env.DB, session.userId, targetUserId);
    return c.json({
      dm: {
        id: Number(channel.id),
        kind: 'dm',
        name: channel.dm_key,
        otherUser: {
          id: Number(targetUser.results[0].id),
          username: targetUser.results[0].username,
          displayName: targetUser.results[0].display_name,
          avatarUrl: targetUser.results[0].avatar_key
            ? `/files/${encodeURIComponent(targetUser.results[0].avatar_key)}`
            : ''
        }
      }
    });
  });

  app.get('/api/admin/dms', async (c) => {
    const { results } = await c.env.DB.prepare(
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
    ).all();

    return c.json({
      dms: results.map((row) => ({
        id: Number(row.id),
        name: row.dm_key,
        participants: row.participants,
        createdAt: row.created_at,
        messageCount: Number(row.message_count)
      }))
    });
  });
}
