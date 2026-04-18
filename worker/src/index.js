import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createSession,
  deleteSession,
  getSession,
  hashPassword,
  putSession,
  verifyPassword
} from './auth.js';
import { getSiteSettings, getUserByUsername } from './db.js';
import { ApiError } from './errors.js';
import { adminMiddleware, authMiddleware } from './middleware.js';
import { registerAdminRoutes } from './api/admin.js';
import { registerChannelRoutes } from './api/channels.js';
import { registerDmRoutes } from './api/dm.js';
import { registerMessageRoutes } from './api/messages.js';
import { registerUploadRoutes } from './api/upload.js';
import { ChannelRoom } from './do/ChannelRoom.js';
import { Scheduler } from './do/Scheduler.js';
import { errorResponse, parseJsonRequest } from './utils.js';

const app = new Hono();

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/site', async (c) => {
  const site = await getSiteSettings(c.env.DB);
  return c.json({ site });
});

app.get('/api/register-links/:token', async (c) => {
  const token = String(c.req.param('token') || '').trim();
  if (!token) {
    return errorResponse('注册链接不存在', 404);
  }

  const site = await getSiteSettings(c.env.DB);
  const invite = await c.env.DB.prepare(
    `SELECT id, note, created_at, consumed_at, deleted_at
     FROM registration_invites
     WHERE token = ?
     LIMIT 1`
  )
    .bind(token)
    .all();

  const row = invite.results[0];
  if (!row || row.deleted_at || row.consumed_at) {
    return errorResponse('注册链接已失效', 404);
  }

  return c.json({
    site,
    invite: {
      note: row.note || '',
      createdAt: row.created_at
    }
  });
});

app.post('/api/register-links/:token/register', async (c) => {
  const token = String(c.req.param('token') || '').trim();
  const payload = await parseJsonRequest(c.req.raw);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const displayName = String(payload.displayName || username).trim();

  if (!token) {
    return errorResponse('注册链接不存在', 404);
  }
  if (!username || !password) {
    return errorResponse('用户名和密码不能为空');
  }

  const inviteQuery = await c.env.DB.prepare(
    `SELECT id, consumed_at, deleted_at
     FROM registration_invites
     WHERE token = ?
     LIMIT 1`
  )
    .bind(token)
    .all();

  const invite = inviteQuery.results[0];
  if (!invite || invite.deleted_at || invite.consumed_at) {
    return errorResponse('注册链接已失效', 400);
  }

  const hashed = await hashPassword(password);
  const result = await c.env.DB.prepare(
    `INSERT INTO users (
       username,
       display_name,
       password_hash,
       password_salt,
       registration_invite_id
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(username, displayName, hashed.hash, hashed.salt, Number(invite.id))
    .run()
    .catch((error) => {
      if (String(error.message).includes('UNIQUE')) {
        throw new ApiError('用户名已存在或注册链接已被使用');
      }
      throw error;
    });

  await c.env.DB.prepare(
    `UPDATE registration_invites
     SET consumed_by_user_id = ?,
         consumed_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND consumed_at IS NULL
       AND deleted_at IS NULL`
  )
    .bind(Number(result.meta.last_row_id), Number(invite.id))
    .run();

  return c.json({ ok: true });
});

app.post('/api/auth/login', async (c) => {
  const payload = await parseJsonRequest(c.req.raw);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  if (!username || !password) {
    return errorResponse('请输入用户名和密码');
  }

  const user = await getUserByUsername(c.env.DB, username);
  if (!user || Number(user.is_disabled)) {
    return errorResponse('账号或密码错误', 401);
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    return errorResponse('账号或密码错误', 401);
  }

  const session = await createSession(c.env, user);
  return c.json({
    token: session.token,
    session
  });
});

app.use('/api/*', authMiddleware);

app.get('/api/auth/session', async (c) => {
  const session = c.get('session');
  const user = await c.env.DB.prepare(
    `SELECT display_name, avatar_key, is_disabled
     FROM users
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`
  )
    .bind(session.userId)
    .all();

  if (!user.results[0] || Number(user.results[0].is_disabled)) {
    await deleteSession(c.env, session.token);
    return errorResponse('账号已不可用', 401);
  }

  const freshSession = {
    ...session,
    displayName: user.results[0].display_name,
    avatarUrl: user.results[0].avatar_key ? `/files/${encodeURIComponent(user.results[0].avatar_key)}` : ''
  };
  await putSession(c.env, freshSession);

  return c.json({ session: freshSession });
});

app.post('/api/auth/logout', async (c) => {
  const session = c.get('session');
  await deleteSession(c.env, session.token);
  return c.json({ ok: true });
});

app.post('/api/auth/change-password', async (c) => {
  const session = c.get('session');
  const payload = await parseJsonRequest(c.req.raw);
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');
  if (!currentPassword || !newPassword) {
    return errorResponse('请填写完整密码');
  }

  const user = await c.env.DB.prepare(
    `SELECT password_hash, password_salt
     FROM users
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`
  )
    .bind(session.userId)
    .all();

  if (!user.results[0]) {
    return errorResponse('用户不存在', 404);
  }

  const valid = await verifyPassword(
    currentPassword,
    user.results[0].password_hash,
    user.results[0].password_salt
  );
  if (!valid) {
    return errorResponse('当前密码不正确', 400);
  }

  const hashed = await hashPassword(newPassword);
  await c.env.DB.prepare(
    `UPDATE users
     SET password_hash = ?,
          password_salt = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND deleted_at IS NULL`
  )
    .bind(hashed.hash, hashed.salt, session.userId)
    .run();

  const nextSession = {
    ...session,
    sessionVersion: Number(session.sessionVersion || 0) + 1
  };
  await putSession(c.env, nextSession);

  return c.json({ ok: true });
});

app.patch('/api/me/profile', async (c) => {
  const session = c.get('session');
  const payload = await parseJsonRequest(c.req.raw);
  const displayName = String(payload.displayName || session.displayName).trim();
  const avatarKey = payload.avatarKey ? String(payload.avatarKey) : null;
  if (!displayName) {
    return errorResponse('显示名称不能为空');
  }

  await c.env.DB.prepare(
    `UPDATE users
     SET display_name = ?,
         avatar_key = COALESCE(?, avatar_key),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(displayName, avatarKey, session.userId)
    .run();

  const nextSession = await getSession(c.env, session.token);
  const merged = {
    ...nextSession,
    displayName,
    avatarUrl: avatarKey ? `/files/${encodeURIComponent(avatarKey)}` : nextSession.avatarUrl
  };
  await putSession(c.env, merged);

  return c.json({ session: merged });
});

app.get('/api/users', async (c) => {
  const session = c.get('session');
  const { results } = await c.env.DB.prepare(
    `SELECT id, username, display_name, avatar_key
     FROM users
     WHERE deleted_at IS NULL
       AND is_disabled = 0
       AND id != ?
     ORDER BY display_name ASC`
  )
    .bind(session.userId)
    .all();

  return c.json({
    users: results.map((row) => ({
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_key ? `/files/${encodeURIComponent(row.avatar_key)}` : ''
    }))
  });
});

app.get('/api/bootstrap', async (c) => {
  const session = c.get('session');
  const [usersResult, channelsResult, dmsResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, username, display_name, avatar_key
       FROM users
       WHERE deleted_at IS NULL
         AND is_disabled = 0
         AND id != ?
       ORDER BY display_name ASC`
    )
      .bind(session.userId)
      .all(),
    c.env.DB.prepare(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.kind,
         owner.display_name AS owner_display_name,
         EXISTS (
           SELECT 1 FROM channel_members cm
           WHERE cm.channel_id = c.id AND cm.user_id = ?
         ) AS is_member,
         COALESCE((
           SELECT cm.role
           FROM channel_members cm
           WHERE cm.channel_id = c.id AND cm.user_id = ?
           LIMIT 1
         ), '') AS my_role,
         EXISTS (
           SELECT 1 FROM channel_members cm
           WHERE cm.channel_id = c.id AND cm.user_id = ? AND cm.role = 'owner'
         ) AS can_manage,
         (
           SELECT COUNT(*)
           FROM channel_members cm
           WHERE cm.channel_id = c.id
         ) AS member_count,
         (
           SELECT MAX(m.created_at)
           FROM messages m
           WHERE m.channel_id = c.id AND m.deleted_at IS NULL
         ) AS last_message_at
       FROM channels c
       LEFT JOIN users owner ON owner.id = c.created_by
       WHERE c.kind IN ('public', 'private')
         AND c.deleted_at IS NULL
         AND (
           c.kind = 'public'
           OR EXISTS (
             SELECT 1 FROM channel_members cm
             WHERE cm.channel_id = c.id AND cm.user_id = ?
           )
         )
       ORDER BY CASE c.kind WHEN 'public' THEN 0 ELSE 1 END, c.name ASC`
    )
      .bind(session.userId, session.userId, session.userId, session.userId)
      .all(),
    c.env.DB.prepare(
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
      .all()
  ]);

  return c.json({
    users: usersResult.results.map((row) => ({
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_key ? `/files/${encodeURIComponent(row.avatar_key)}` : ''
    })),
    channels: channelsResult.results.map((row) => ({
      id: Number(row.id),
      name: row.name,
      description: row.description,
      kind: row.kind,
      ownerDisplayName: row.owner_display_name || '',
      isMember: Boolean(Number(row.is_member)),
      myRole: row.my_role || '',
      canManage: Boolean(Number(row.can_manage)),
      memberCount: Number(row.member_count || 0),
      lastMessageAt: row.last_message_at || null
    })),
    dms: dmsResult.results.map((row) => ({
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

app.use('/api/admin/*', adminMiddleware);

registerMessageRoutes(app);
registerDmRoutes(app);
registerUploadRoutes(app);
registerChannelRoutes(app);
registerAdminRoutes(app);

app.get('/api/ws/:kind/:id', async (c) => {
  const session = c.get('session');
  const kind = c.req.param('kind');
  const id = c.req.param('id');
  if (!['public', 'private', 'dm'].includes(kind)) {
    return errorResponse('无效的会话类型');
  }

  const stub = c.env.CHANNEL_ROOM.get(c.env.CHANNEL_ROOM.idFromName(`${kind}:${id}`));
  const url = new URL(c.req.url);
  url.pathname = '/connect';
  url.searchParams.set('kind', kind);
  url.searchParams.set('id', id);
  url.searchParams.set('token', session.token);
  return stub.fetch(url.toString(), c.req.raw);
});

app.notFound(async (c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return errorResponse('接口不存在', 404);
  }
  return new Response('Not Found', { status: 404 });
});

app.onError((error) => {
  console.error(error);
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.status);
  }
  return errorResponse('服务器开小差了', 500);
});

async function cleanupExpiredMessages(env) {
  const retentionDays = Number(env.MESSAGE_RETENTION_DAYS || 7);
  await env.DB.prepare(
    `DELETE FROM messages
     WHERE created_at < datetime('now', ?)`
  )
    .bind(`-${retentionDays} day`)
    .run();
}

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanupExpiredMessages(env));
  }
};
export { ChannelRoom, Scheduler };
