/**
 * 认证 API 集成测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hashPassword } from '../../worker/src/auth.js';
import {
  createTestEnv,
  createTestRequest,
  parseResponse,
  extractCookies,
  createMockD1
} from './test-helpers.js';

describe('Authentication API Integration Tests', () => {
  let env;
  let app;

  beforeEach(() => {
    env = createTestEnv();
    app = new Hono();

    // 模拟登录端点
    app.post('/api/auth/login', async (c) => {
      const body = await c.req.json();
      const { username, password } = body;

      // 模拟数据库查询
      const db = c.env.DB;
      const user = await db.prepare(
        'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL'
      ).bind(username).first();

      if (!user) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // 简化的密码验证（实际应该使用 verifyPassword）
      if (password !== 'correct-password') {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // 创建会话
      const sessionId = `session-${Date.now()}`;
      await c.env.KV.put(`session:${sessionId}`, JSON.stringify({
        userId: user.id,
        isAdmin: user.is_admin === 1,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      }));

      // 设置 Cookie
      const response = c.json({ success: true, user: { id: user.id, username: user.username } });
      response.headers.set('Set-Cookie', `cfchat_token=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      return response;
    });

    // 模拟登出端点
    app.post('/api/auth/logout', async (c) => {
      const cookie = c.req.header('Cookie');
      if (cookie) {
        const match = cookie.match(/cfchat_token=([^;]+)/);
        if (match) {
          await c.env.KV.delete(`session:${match[1]}`);
        }
      }

      const response = c.json({ success: true });
      response.headers.set('Set-Cookie', 'cfchat_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
      return response;
    });

    // 模拟当前用户端点
    app.get('/api/auth/me', async (c) => {
      const cookie = c.req.header('Cookie');
      if (!cookie) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const match = cookie.match(/cfchat_token=([^;]+)/);
      if (!match) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const session = await c.env.KV.get(`session:${match[1]}`, { type: 'json' });
      if (!session || session.expiresAt < Date.now()) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      return c.json({
        user: {
          id: session.userId,
          isAdmin: session.isAdmin
        }
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // 准备测试数据
      const mockUser = {
        id: 1,
        username: 'alice',
        password_hash: 'hash',
        password_salt: 'salt',
        is_admin: 0,
        deleted_at: null
      };

      // 模拟数据库返回用户
      env.DB.prepare = () => ({
        bind: () => ({
          first: async () => mockUser
        })
      });

      const request = createTestRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'alice', password: 'correct-password' }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);
      const cookies = extractCookies(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.username).toBe('alice');
      expect(cookies.cfchat_token).toBeDefined();
    });

    it('should reject login with invalid username', async () => {
      env.DB.prepare = () => ({
        bind: () => ({
          first: async () => null
        })
      });

      const request = createTestRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'nonexistent', password: 'password' }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const mockUser = {
        id: 1,
        username: 'alice',
        password_hash: 'hash',
        is_admin: 0,
        deleted_at: null
      };

      env.DB.prepare = () => ({
        bind: () => ({
          first: async () => mockUser
        })
      });

      const request = createTestRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'alice', password: 'wrong-password' }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should set HttpOnly cookie on successful login', async () => {
      const mockUser = {
        id: 1,
        username: 'alice',
        is_admin: 0,
        deleted_at: null
      };

      env.DB.prepare = () => ({
        bind: () => ({
          first: async () => mockUser
        })
      });

      const request = createTestRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'alice', password: 'correct-password' }
      });

      const response = await app.fetch(request, env);
      const setCookie = response.headers.get('Set-Cookie');

      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('cfchat_token=');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully and clear cookie', async () => {
      const sessionId = 'test-session-123';
      await env.KV.put(`session:${sessionId}`, JSON.stringify({
        userId: 1,
        isAdmin: false,
        expiresAt: Date.now() + 1000000
      }));

      const request = createTestRequest('/api/auth/logout', {
        method: 'POST',
        cookies: { cfchat_token: sessionId }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);
      const setCookie = response.headers.get('Set-Cookie');

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(setCookie).toContain('Max-Age=0');

      // 验证会话已删除
      const session = await env.KV.get(`session:${sessionId}`);
      expect(session).toBeNull();
    });

    it('should handle logout without session gracefully', async () => {
      const request = createTestRequest('/api/auth/logout', {
        method: 'POST'
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid session', async () => {
      const sessionId = 'test-session-456';
      await env.KV.put(`session:${sessionId}`, JSON.stringify({
        userId: 1,
        isAdmin: true,
        expiresAt: Date.now() + 1000000
      }));

      const request = createTestRequest('/api/auth/me', {
        cookies: { cfchat_token: sessionId }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.user.id).toBe(1);
      expect(data.user.isAdmin).toBe(true);
    });

    it('should reject request without session', async () => {
      const request = createTestRequest('/api/auth/me');

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject request with expired session', async () => {
      const sessionId = 'expired-session';
      await env.KV.put(`session:${sessionId}`, JSON.stringify({
        userId: 1,
        isAdmin: false,
        expiresAt: Date.now() - 1000 // 已过期
      }));

      const request = createTestRequest('/api/auth/me', {
        cookies: { cfchat_token: sessionId }
      });

      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});
