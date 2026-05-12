import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createSession,
  deleteSession,
  getSession,
  hashPassword,
  putSession,
  rehashPasswordOnLogin,
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
import { runScheduledGc } from './gc.js';
import { errorResponse, parseJsonRequest, publicFileUrl } from './utils.js';
import { validateDisplayName, validatePassword, validateUsername } from './validation.js';
import { getBlockedWords } from './moderation.js';
import { clientIp, enforceRateLimit } from './rate-limit.js';

const app = new Hono();
const INTERNAL_AUTH_HEADER = 'x-cfchat-internal-auth';
const VERIFIED_USER_ID_HEADER = 'x-cfchat-verified-user-id';
const VERIFIED_IS_ADMIN_HEADER = 'x-cfchat-verified-is-admin';
const VERIFIED_AT_HEADER = 'x-cfchat-verified-at';
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB

// 全局请求体大小限制中间件
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_SIZE) {
    return c.json({ error: '请求体过大' }, 413);
  }
  await next();
});

// SPA shell 的 CSP：允许内联样式（Vue runtime 需要），但禁止内联脚本与外部 JS。
// 对 /files/* 的强约束 CSP 由 upload.js 单独设置（sandbox + default-src none）。
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

app.use('*', async (c, next) => {
  await next();
  const url = new URL(c.req.url);
  const isApi = url.pathname.startsWith('/api/');
  const isFile = url.pathname.startsWith('/files/');

  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'no-referrer');
  c.header('x-frame-options', 'DENY');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');

  // 仅在 https 访问时启用 HSTS，避免本地 http 开发环境意外被卡死。
  if (url.protocol === 'https:') {
    c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  if (isApi) {
    c.header('cache-control', 'no-store');
  } else if (!isFile) {
    // SPA shell / 静态资源使用全局 CSP；/files/* 由各自 handler 单独控制。
    if (!c.res.headers.has('content-security-policy')) {
      c.header('content-security-policy', SPA_CSP);
    }
  }
});

// CORS 配置：限制到特定的来源列表
function getAllowedOrigins(env) {
  const originsStr = env.ALLOWED_ORIGINS || '';
  if (!originsStr) return [];
  return originsStr.split(',').map(origin => origin.trim()).filter(Boolean);
}

function resolveCorsOrigin(origin, c) {
  if (!origin) return '';

  const requestOrigin = new URL(c.req.url).origin;
  if (origin === requestOrigin) {
    return origin;
  }

  const allowedOrigins = getAllowedOrigins(c.env);
  return allowedOrigins.includes(origin) ? origin : '';
}

app.use('/api/*', cors({
  origin: resolveCorsOrigin,
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 3600
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
  // 限流：每个 IP 每分钟最多 5 次注册尝试，防止 invite token 爆破
  const limited = await enforceRateLimit(c, 'register', clientIp(c), { max: 5, windowSeconds: 60 });
  if (limited) return limited;

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

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return errorResponse(usernameValidation.error);
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return errorResponse(passwordValidation.error);
  }

  const displayNameValidation = validateDisplayName(displayName);
  if (!displayNameValidation.valid) {
    return errorResponse(displayNameValidation.error);
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
       password_hash_version,
       registration_invite_id
     ) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(username, displayName, hashed.hash, hashed.salt, hashed.version, Number(invite.id))
    .run()
    .catch((error) => {
      if (String(error.message).includes('UNIQUE')) {
        throw new ApiError('用户名已存在或注册链接已被使用');
      }
      throw error;
    });

  const consume = await c.env.DB.prepare(
    `UPDATE registration_invites
     SET consumed_by_user_id = ?,
         consumed_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND consumed_at IS NULL
       AND deleted_at IS NULL`
  )
    .bind(Number(result.meta.last_row_id), Number(invite.id))
    .run();

  if (!consume.meta?.changes) {
    await c.env.DB.prepare(
      `UPDATE users
       SET username = username || '#revoked-' || id,
           deleted_at = CURRENT_TIMESTAMP,
           is_disabled = 1
       WHERE id = ?`
    )
      .bind(Number(result.meta.last_row_id))
      .run();
    return errorResponse('注册链接已失效', 400);
  }

  return c.json({ ok: true });
});

const SESSION_COOKIE_NAME = 'cfchat_token';

function isSecureRequest(c) {
  // CDN 后 c.req.url 协议会被改写为 https；保险起见同时检查 forwarded header
  if (new URL(c.req.url).protocol === 'https:') {
    return true;
  }
  const forwarded = (c.req.header('x-forwarded-proto') || c.req.header('cf-visitor') || '').toLowerCase();
  return forwarded.includes('https');
}

function sessionCookieOptions(c) {
  return {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  };
}

function clearedSessionCookieOptions(c) {
  return {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Strict',
    path: '/',
    maxAge: 0
  };
}

app.post('/api/auth/login', async (c) => {
  const payload = await parseJsonRequest(c.req.raw);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  if (!username || !password) {
    return errorResponse('请输入用户名和密码');
  }

  // 限流：以 IP+username 双维度，60s 内最多 8 次失败/尝试，阻止密码爆破。
  // 注意：此处对所有请求计数（无论是否登录成功），避免攻击者通过试探有效用户。
  const ip = clientIp(c);
  const limited = await enforceRateLimit(c, 'login', `${ip}:${username.toLowerCase()}`, {
    max: 8,
    windowSeconds: 60
  });
  if (limited) return limited;

  const user = await getUserByUsername(c.env.DB, username);
  if (!user || Number(user.is_disabled)) {
    return errorResponse('账号或密码错误', 401);
  }

  const verifyResult = await verifyPassword(
    password,
    user.password_hash,
    user.password_salt,
    user.password_hash_version
  );
  if (!verifyResult.valid) {
    return errorResponse('账号或密码错误', 401);
  }

  if (verifyResult.needsRehash) {
    // 异步迁移到当前 PBKDF2 配置；失败仅日志，不影响登录主流程。
    c.executionCtx.waitUntil(
      rehashPasswordOnLogin(c.env.DB, Number(user.id), password).catch((error) => {
        console.error('Failed to rehash password on login', error);
      })
    );
  }

  const session = await createSession(c.env, user);

  // HttpOnly Cookie：path '/' 确保所有路径接收，Secure 在 CDN https 部署上启用，
  // SameSite=Strict 防 CSRF（同源 SPA 内 fetch 不受影响）。
  c.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(c));

  // 返回会话信息，但不返回令牌（令牌在 cookie 中）
  return c.json({
    session: {
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      isAdmin: session.isAdmin
    }
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

  // 必须使用与 set 时一致的 path/secure/sameSite，否则浏览器认为是不同 cookie
  c.cookie(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions(c));

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

  // 限流：按 userId，10 分钟内最多 5 次，防止已登录账户被盗后批量改密。
  const limited = await enforceRateLimit(c, 'change-password', String(session.userId), {
    max: 5,
    windowSeconds: 600
  });
  if (limited) return limited;

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return errorResponse(passwordValidation.error);
  }

  const user = await c.env.DB.prepare(
    `SELECT password_hash, password_salt, password_hash_version
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

  const verifyResult = await verifyPassword(
    currentPassword,
    user.results[0].password_hash,
    user.results[0].password_salt,
    user.results[0].password_hash_version
  );
  if (!verifyResult.valid) {
    return errorResponse('当前密码不正确', 400);
  }

  const hashed = await hashPassword(newPassword);
  await c.env.DB.prepare(
    `UPDATE users
     SET password_hash = ?,
          password_salt = ?,
          password_hash_version = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND deleted_at IS NULL`
  )
    .bind(hashed.hash, hashed.salt, hashed.version, session.userId)
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

  const displayNameValidation = validateDisplayName(displayName);
  if (!displayNameValidation.valid) {
    return errorResponse(displayNameValidation.error);
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
         c.avatar_key,
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
      avatarKey: row.avatar_key || '',
      avatarUrl: row.avatar_key ? publicFileUrl(row.avatar_key) : '',
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

app.get('/api/moderation/blocked-words', async (c) => {
  return c.json({ words: await getBlockedWords(c.env.DB) });
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

  const headers = new Headers(c.req.raw.headers);
  headers.set(INTERNAL_AUTH_HEADER, 'worker-verified');
  headers.set(VERIFIED_USER_ID_HEADER, String(session.userId));
  headers.set(VERIFIED_IS_ADMIN_HEADER, session.isAdmin ? '1' : '0');
  headers.set(VERIFIED_AT_HEADER, String(Date.now()));

  const request = new Request(url.toString(), {
    method: c.req.raw.method,
    headers
  });

  return stub.fetch(request);
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

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledGc(env));
  }
};
export { ChannelRoom };
