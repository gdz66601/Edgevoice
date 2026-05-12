/**
 * 集成测试辅助函数
 * 提供模拟的 Cloudflare Workers 环境和测试工具
 */

import { Hono } from 'hono';

/**
 * 创建模拟的 D1 数据库
 */
export function createMockD1() {
  const data = new Map();
  let autoIncrement = 1;

  return {
    prepare(sql) {
      const boundParams = [];
      return {
        bind(...params) {
          boundParams.push(...params);
          return this;
        },
        async run() {
          // 简单的 INSERT 模拟
          if (sql.trim().toUpperCase().startsWith('INSERT')) {
            const id = autoIncrement++;
            return { success: true, meta: { last_row_id: id, changes: 1 } };
          }
          // UPDATE/DELETE 模拟
          return { success: true, meta: { changes: 1 } };
        },
        async first() {
          // 返回第一行
          return null;
        },
        async all() {
          // 返回所有行
          return { results: [], success: true };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(sql) {
      return { success: true };
    }
  };
}

/**
 * 创建模拟的 KV 存储
 */
export function createMockKV() {
  const store = new Map();

  return {
    async get(key, options) {
      const value = store.get(key);
      if (!value) return null;

      if (options?.type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    async put(key, value, options) {
      if (typeof value === 'object') {
        store.set(key, JSON.stringify(value));
      } else {
        store.set(key, value);
      }
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options) {
      const keys = Array.from(store.keys());
      const prefix = options?.prefix || '';
      const filtered = keys.filter(k => k.startsWith(prefix));
      return {
        keys: filtered.map(name => ({ name })),
        list_complete: true
      };
    }
  };
}

/**
 * 创建模拟的 R2 存储
 */
export function createMockR2() {
  const store = new Map();

  return {
    async get(key) {
      const value = store.get(key);
      if (!value) return null;
      return {
        body: value,
        httpMetadata: { contentType: 'application/octet-stream' }
      };
    },
    async put(key, value, options) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async head(key) {
      return store.has(key) ? { httpMetadata: {} } : null;
    }
  };
}

/**
 * 创建模拟的 Durable Object Namespace
 */
export function createMockDONamespace() {
  return {
    idFromName(name) {
      return { toString: () => name };
    },
    get(id) {
      return {
        fetch(request) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json' }
          });
        }
      };
    }
  };
}

/**
 * 创建完整的测试环境
 */
export function createTestEnv(overrides = {}) {
  return {
    DB: createMockD1(),
    KV: createMockKV(),
    R2: createMockR2(),
    CHANNEL_ROOM: createMockDONamespace(),
    ALLOWED_ORIGINS: 'http://localhost:5173',
    INTERNAL_AUTH_SECRET: 'test-secret-key-for-testing-only',
    ...overrides
  };
}

/**
 * 创建测试请求
 */
export function createTestRequest(path, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    cookies = {}
  } = options;

  const url = `http://localhost${path}`;
  const reqHeaders = new Headers(headers);

  // 添加 Cookie
  if (Object.keys(cookies).length > 0) {
    const cookieStr = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    reqHeaders.set('Cookie', cookieStr);
  }

  // 添加 Content-Type
  if (body && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  const reqOptions = {
    method,
    headers: reqHeaders
  };

  if (body) {
    reqOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  return new Request(url, reqOptions);
}

/**
 * 执行测试请求并返回响应
 */
export async function executeRequest(app, request, env) {
  return await app.fetch(request, env);
}

/**
 * 解析响应 JSON
 */
export async function parseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * 从响应中提取 Cookie
 */
export function extractCookies(response) {
  const cookies = {};
  const setCookieHeaders = response.headers.getSetCookie?.() || [];

  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(';');
    const [name, value] = cookiePart.split('=');
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  }

  return cookies;
}

/**
 * 创建测试用户
 */
export async function createTestUser(db, userData = {}) {
  const {
    username = 'testuser',
    password_hash = 'hash',
    password_salt = 'salt',
    password_version = 2,
    display_name = 'Test User',
    is_admin = 0,
    is_disabled = 0
  } = userData;

  const result = await db.prepare(
    `INSERT INTO users (username, password_hash, password_salt, password_version, display_name, is_admin, is_disabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(username, password_hash, password_salt, password_version, display_name, is_admin, is_disabled).run();

  return result.meta.last_row_id;
}

/**
 * 创建测试频道
 */
export async function createTestChannel(db, channelData = {}) {
  const {
    name = 'test-channel',
    description = 'Test Channel',
    kind = 'public',
    created_by = 1
  } = channelData;

  const result = await db.prepare(
    `INSERT INTO channels (name, description, kind, created_by, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).bind(name, description, kind, created_by).run();

  return result.meta.last_row_id;
}

/**
 * 创建测试会话
 */
export async function createTestSession(kv, sessionData = {}) {
  const {
    userId = 1,
    isAdmin = false,
    expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
  } = sessionData;

  const sessionId = `test-session-${Date.now()}-${Math.random()}`;
  const session = {
    userId,
    isAdmin,
    expiresAt
  };

  await kv.put(`session:${sessionId}`, JSON.stringify(session));
  return sessionId;
}
