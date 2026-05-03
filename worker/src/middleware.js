import { errorResponse } from './utils.js';
import { validateSession } from './session.js';

function extractToken(request) {
  // 首先尝试从 cookie 读取令牌（推荐方式）
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});

  if (cookies.cfchat_token) {
    return cookies.cfchat_token;
  }

  // 向后兼容：从 Authorization 头读取令牌
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  // 最后尝试从 URL 查询参数读取（用于 WebSocket）
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
