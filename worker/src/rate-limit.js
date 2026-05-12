// 简单的 KV 固定窗口速率限制器。
//
// 使用 SESSIONS KV namespace（已有，会话 TTL 与速率窗口相互独立）存放
// 计数器：键为 `rl:<scope>:<key>:<windowStart>`，值为整数。
//
// 适合保护：登录、注册、改密、DM open 等中低频路径。不适合保护消息发送
// 等高频路径（DO 内已有专门的 messageRateLimits）。

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 10;

function clientIp(c) {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * 检查并递增计数。返回 { allowed, remaining, retryAfterSeconds }。
 * 不抛错，但如果 KV 出现故障会兜底放行（fail-open）以避免锁死所有人。
 */
export async function checkRateLimit(env, scope, key, options = {}) {
  const windowSeconds = Number(options.windowSeconds) || DEFAULT_WINDOW_SECONDS;
  const max = Number(options.max) || DEFAULT_MAX_REQUESTS;

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const cacheKey = `rl:${scope}:${key}:${windowStart}`;

  let count = 0;
  try {
    const raw = await env.SESSIONS.get(cacheKey);
    count = raw ? Number(raw) || 0 : 0;
  } catch (error) {
    console.error('rate limit read failed', error);
    return { allowed: true, remaining: max, retryAfterSeconds: 0 };
  }

  if (count >= max) {
    const retryAfter = windowStart + windowSeconds - now;
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(retryAfter, 1) };
  }

  // 写回；失败仅日志
  try {
    await env.SESSIONS.put(cacheKey, String(count + 1), {
      // KV TTL 必须 ≥ 60s
      expirationTtl: Math.max(windowSeconds * 2, 60)
    });
  } catch (error) {
    console.error('rate limit write failed', error);
  }

  return { allowed: true, remaining: max - count - 1, retryAfterSeconds: 0 };
}

/**
 * 高阶辅助：在 c 对象上限流；超过返回 429 响应（带 Retry-After 头）。
 * 用法：
 *   const limited = await enforceRateLimit(c, 'login', `${ip}:${username}`, { max: 5, windowSeconds: 60 });
 *   if (limited) return limited;
 */
export async function enforceRateLimit(c, scope, key, options = {}) {
  const result = await checkRateLimit(c.env, scope, key, options);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ error: '请求过于频繁，请稍后再试' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(result.retryAfterSeconds),
          'cache-control': 'no-store'
        }
      }
    );
  }
  return null;
}

export { clientIp };
