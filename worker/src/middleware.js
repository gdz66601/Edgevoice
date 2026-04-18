import { errorResponse } from './utils.js';
import { validateSession } from './session.js';

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const url = new URL(request.url);
  return url.searchParams.get('token') || '';
}

export async function authMiddleware(c, next) {
  const token = extractToken(c.req.raw);
  const result = await validateSession(c.env, token);
  if (!result.ok) {
    return errorResponse(result.message, result.status);
  }

  c.set('session', result.session);
  await next();
}

export async function adminMiddleware(c, next) {
  const session = c.get('session');
  if (!session?.isAdmin) {
    return errorResponse('需要管理员权限', 403);
  }

  await next();
}
