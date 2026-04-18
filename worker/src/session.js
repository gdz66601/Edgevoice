import { deleteSession, getSession, putSession } from './auth.js';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function validateSession(env, token) {
  const session = await getSession(env, token);
  if (!session) {
    return { ok: false, status: 401, message: '请先登录' };
  }

  const { results } = await env.DB.prepare(
    `SELECT is_disabled, deleted_at, session_version, is_admin
     FROM users
     WHERE id = ?
     LIMIT 1`
  )
    .bind(session.userId)
    .all();

  const user = results[0];
  if (!user || user.deleted_at || Boolean(toNumber(user.is_disabled))) {
    await deleteSession(env, token);
    return { ok: false, status: 401, message: '账号已不可用' };
  }

  const dbVersion = toNumber(user.session_version);
  const sessionVersion = toNumber(session.sessionVersion);
  if (sessionVersion !== dbVersion) {
    await deleteSession(env, token);
    return { ok: false, status: 401, message: '登录已过期，请重新登录' };
  }

  const refreshed = {
    ...session,
    isAdmin: Boolean(toNumber(user.is_admin)),
    sessionVersion: dbVersion
  };

  if (refreshed.isAdmin !== session.isAdmin || refreshed.sessionVersion !== session.sessionVersion) {
    await putSession(env, refreshed);
  }

  return { ok: true, session: refreshed };
}

