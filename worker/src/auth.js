const encoder = new TextEncoder();
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

// 当前推荐的 PBKDF2 迭代次数；登录时检测到旧版本会触发懒重哈希。
// 历史版本（用 hash_version=null/0 标记）使用 100,000 轮。
export const PBKDF2_ITERATIONS_V1 = 100_000;
export const PBKDF2_ITERATIONS_CURRENT = 600_000;
export const PBKDF2_HASH_VERSION_CURRENT = 2;

const ITERATIONS_BY_VERSION = {
  0: PBKDF2_ITERATIONS_V1,
  1: PBKDF2_ITERATIONS_V1,
  2: PBKDF2_ITERATIONS_CURRENT
};

function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqualStrings(a, b) {
  const aStr = String(a ?? '');
  const bStr = String(b ?? '');
  if (aStr.length !== bStr.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aStr.length; i += 1) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}

function resolveIterations(version) {
  const numeric = Number(version);
  if (!Number.isFinite(numeric)) {
    return PBKDF2_ITERATIONS_V1;
  }
  return ITERATIONS_BY_VERSION[numeric] ?? PBKDF2_ITERATIONS_V1;
}

async function deriveHash(password, saltBase64, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64Url(saltBase64),
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return toBase64Url(new Uint8Array(bits));
}

export async function hashPassword(password, salt = null) {
  const passwordSalt = salt || toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await deriveHash(password, passwordSalt, PBKDF2_ITERATIONS_CURRENT);
  return {
    salt: passwordSalt,
    hash,
    version: PBKDF2_HASH_VERSION_CURRENT
  };
}

/**
 * 校验密码。返回 { valid, needsRehash }；调用方在登录成功且 needsRehash=true 时应
 * 用本次提交的明文密码调用 hashPassword 并写回 users 表，把账户迁移到当前迭代次数。
 */
export async function verifyPassword(password, passwordHash, passwordSalt, hashVersion = null) {
  const iterations = resolveIterations(hashVersion);
  const derived = await deriveHash(password, passwordSalt, iterations);
  const valid = timingSafeEqualStrings(derived, passwordHash);
  return {
    valid,
    needsRehash: valid && iterations !== PBKDF2_ITERATIONS_CURRENT
  };
}

function toSessionVersion(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseAdminUsernames(env) {
  return String(env.ADMIN_USERNAMES || '')
    .split(',')
    .map((username) => username.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(env, user) {
  const username = String(user?.username || '')
    .trim()
    .toLowerCase();
  return Boolean(Number(user?.is_admin)) || parseAdminUsernames(env).includes(username);
}

export async function putSession(env, session) {
  await env.SESSIONS.put(session.token, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function createSession(env, user) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  const session = {
    token,
    userId: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_key ? `/files/${encodeURIComponent(user.avatar_key)}` : '',
    isAdmin: isAdminUser(env, user),
    sessionVersion: toSessionVersion(user.session_version),
    createdAt: now,
    expiresAt: now + (SESSION_TTL_SECONDS * 1000)
  };

  await putSession(env, session);

  return session;
}

export async function getSession(env, token) {
  if (!token) {
    return null;
  }

  const raw = await env.SESSIONS.get(token);
  if (!raw) {
    return null;
  }

  const session = JSON.parse(raw);

  if (session.expiresAt && Date.now() > session.expiresAt) {
    await deleteSession(env, token);
    return null;
  }
  session.token = token;
  if (session.sessionVersion === undefined) {
    session.sessionVersion = 0;
  }
  if (session.isAdmin === undefined) {
    session.isAdmin = false;
  }
  return session;
}

export async function deleteSession(env, token) {
  if (!token) {
    return;
  }
  await env.SESSIONS.delete(token);
}

/**
 * 把指定用户的密码哈希迁移到当前 PBKDF2 配置。
 * 仅在登录时拿到明文且校验通过后调用；失败仅记录日志，不阻塞登录主流程。
 */
export async function rehashPasswordOnLogin(db, userId, plainPassword) {
  const hashed = await hashPassword(plainPassword);
  await db
    .prepare(
      `UPDATE users
       SET password_hash = ?,
           password_salt = ?,
           password_hash_version = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(hashed.hash, hashed.salt, PBKDF2_HASH_VERSION_CURRENT, userId)
    .run();
}
