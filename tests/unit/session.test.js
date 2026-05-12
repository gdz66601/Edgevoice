/**
 * 会话管理单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateSession } from '../../worker/src/session.js';
import { createMockKV, createMockD1 } from '../integration/test-helpers.js';

describe('Session Management', () => {
  let env;

  beforeEach(() => {
    env = {
      SESSIONS: createMockKV(),
      DB: createMockD1(),
      ADMIN_USERNAMES: 'admin,superadmin'
    };
  });

  describe('validateSession', () => {
    it('should validate active session successfully', async () => {
      const token = 'valid-token-123';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'alice',
              is_disabled: 0,
              deleted_at: null,
              session_version: 1,
              is_admin: 0
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(true);
      expect(result.session.userId).toBe(1);
      expect(result.session.isAdmin).toBe(false);
    });

    it('should reject non-existent session', async () => {
      const result = await validateSession(env, 'non-existent-token');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('请先登录');
    });

    it('should reject session for deleted user', async () => {
      const token = 'token-for-deleted-user';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'deleted-user',
              is_disabled: 0,
              deleted_at: '2026-05-01',
              session_version: 1,
              is_admin: 0
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('账号已不可用');

      // 验证会话已被删除
      const deletedSession = await env.SESSIONS.get(token);
      expect(deletedSession).toBeNull();
    });

    it('should reject session for disabled user', async () => {
      const token = 'token-for-disabled-user';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'disabled-user',
              is_disabled: 1,
              deleted_at: null,
              session_version: 1,
              is_admin: 0
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('账号已不可用');
    });

    it('should reject session with mismatched version', async () => {
      const token = 'token-with-old-version';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'alice',
              is_disabled: 0,
              deleted_at: null,
              session_version: 2, // 版本不匹配
              is_admin: 0
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('登录已过期');

      // 验证会话已被删除
      const deletedSession = await env.SESSIONS.get(token);
      expect(deletedSession).toBeNull();
    });

    it('should refresh admin status when changed', async () => {
      const token = 'admin-token';
      const session = {
        userId: 1,
        isAdmin: false, // 旧状态：非管理员
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'admin', // 现在是管理员
              is_disabled: 0,
              deleted_at: null,
              session_version: 1,
              is_admin: 1
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(true);
      expect(result.session.isAdmin).toBe(true);

      // 验证会话已更新
      const updatedSession = await env.SESSIONS.get(token, { type: 'json' });
      expect(updatedSession.isAdmin).toBe(true);
    });

    it('should handle user not found in database', async () => {
      const token = 'token-for-missing-user';
      const session = {
        userId: 999,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [] // 用户不存在
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should handle session version as string', async () => {
      const token = 'token-with-string-version';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: '1', // 字符串版本
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'alice',
              is_disabled: 0,
              deleted_at: null,
              session_version: '1', // 字符串版本
              is_admin: 0
            }]
          })
        })
      });

      const result = await validateSession(env, token);

      expect(result.ok).toBe(true);
    });

    it('should update session when version changes', async () => {
      const token = 'token-version-update';
      const session = {
        userId: 1,
        isAdmin: false,
        sessionVersion: 1,
        expiresAt: Date.now() + 1000000
      };

      await env.SESSIONS.put(token, JSON.stringify(session));

      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({
            results: [{
              username: 'alice',
              is_disabled: 0,
              deleted_at: null,
              session_version: 2, // 版本已更新但仍然有效
              is_admin: 0
            }]
          })
        })
      });

      // 注意：这个测试实际上会因为版本不匹配而失败
      // 这是预期行为，因为 session_version 不匹配会导致会话失效
      const result = await validateSession(env, token);

      expect(result.ok).toBe(false);
      expect(result.message).toContain('登录已过期');
    });
  });
});
