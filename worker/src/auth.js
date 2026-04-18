const encoder = new TextEncoder();
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function toBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function hashPassword(password, salt = null) {
  const passwordSalt = salt || toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
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
      salt: fromBase64Url(passwordSalt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return {
    salt: passwordSalt,
    hash: toBase64Url(new Uint8Array(bits))
  };
}

export async function verifyPassword(password, passwordHash, passwordSalt) {
  const derived = await hashPassword(password, passwordSalt);
  return derived.hash === passwordHash;
}

function toSessionVersion(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function putSession(env, session) {
  await env.SESSIONS.put(session.token, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function createSession(env, user) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const session = {
    token,
    userId: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_key ? `/files/${encodeURIComponent(user.avatar_key)}` : '',
    isAdmin: Boolean(Number(user.is_admin)),
    sessionVersion: toSessionVersion(user.session_version)
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
