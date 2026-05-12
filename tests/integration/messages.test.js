/**
 * Messages API 集成测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { registerMessageRoutes } from '../../worker/src/api/messages.js';
import {
  createTestEnv,
  createTestRequest,
  parseResponse
} from './test-helpers.js';

describe('Messages API Integration Tests', () => {
  let env;
  let app;

  beforeEach(() => {
    env = createTestEnv();
    app = new Hono();

    // 模拟认证中间件
    app.use('*', async (c, next) => {
      c.set('session', {
        userId: 1,
        username: 'testuser',
        displayName: 'Test User',
        isAdmin: false
      });
      await next();
    });

    registerMessageRoutes(app);
  });

  describe('GET /api/messages', () => {
    it('should return messages for accessible public channel', async () => {
      const mockRoom = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public'
      };

      const mockMessages = [
        {
          id: 1,
          content: 'Hello world',
          userId: 1,
          username: 'testuser',
          displayName: 'Test User',
          createdAt: '2026-05-12 10:00:00'
        },
        {
          id: 2,
          content: 'Hi there',
          userId: 2,
          username: 'user2',
          displayName: 'User 2',
          createdAt: '2026-05-12 10:01:00'
        }
      ];

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: () => ({
              all: async () => ({ results: mockMessages })
            })
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.room.name).toBe('general');
      expect(data.room.kind).toBe('public');
      expect(data.messages).toHaveLength(2);
      // 消息按 ID 降序排列，所以第一条是最新的
      expect(data.messages[0].content).toBe('Hi there');
    });

    it('should return messages for accessible private channel', async () => {
      const mockRoom = {
        id: 2,
        name: 'private-team',
        description: 'Team chat',
        kind: 'private'
      };

      const mockMessages = [
        {
          id: 3,
          content: 'Private message',
          userId: 1,
          username: 'testuser',
          displayName: 'Test User',
          createdAt: '2026-05-12 11:00:00'
        }
      ];

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: () => ({
              all: async () => ({ results: mockMessages })
            })
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=private&roomId=2&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.room.kind).toBe('private');
      expect(data.messages).toHaveLength(1);
    });

    it('should return messages for accessible DM', async () => {
      const mockRoom = {
        id: 3,
        name: 'DM',
        description: '',
        kind: 'dm'
      };

      const mockMessages = [
        {
          id: 4,
          content: 'Direct message',
          userId: 1,
          username: 'testuser',
          displayName: 'Test User',
          createdAt: '2026-05-12 12:00:00'
        }
      ];

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: () => ({
              all: async () => ({ results: mockMessages })
            })
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=dm&roomId=3&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.room.kind).toBe('dm');
      expect(data.messages).toHaveLength(1);
    });

    it('should return empty messages array when no messages exist', async () => {
      const mockRoom = {
        id: 1,
        name: 'empty-channel',
        description: 'No messages',
        kind: 'public'
      };

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: () => ({
              all: async () => ({ results: [] })
            })
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(0);
    });

    it('should reject invalid kind parameter', async () => {
      const request = createTestRequest('/api/messages?kind=invalid&roomId=1&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toContain('参数无效');
    });

    it('should reject invalid roomId parameter', async () => {
      const request = createTestRequest('/api/messages?kind=public&roomId=invalid&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toContain('参数无效');
    });

    it('should reject missing kind parameter', async () => {
      const request = createTestRequest('/api/messages?roomId=1&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toContain('参数无效');
    });

    it('should reject missing roomId parameter', async () => {
      const request = createTestRequest('/api/messages?kind=public&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(400);
      expect(data.error).toContain('参数无效');
    });

    it('should reject access to inaccessible room', async () => {
      env.DB.prepare = () => ({
        bind: () => ({
          all: async () => ({ results: [] })
        })
      });

      const request = createTestRequest('/api/messages?kind=private&roomId=999&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(403);
      expect(data.error).toContain('无权访问该会话');
    });

    it('should support pagination with before parameter', async () => {
      const mockRoom = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public'
      };

      const mockMessages = [
        {
          id: 5,
          content: 'Older message',
          userId: 1,
          username: 'testuser',
          displayName: 'Test User',
          createdAt: '2026-05-12 09:00:00'
        }
      ];

      let capturedBefore = null;

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: (...args) => {
              // 捕获 before 参数（第二个参数）
              if (args.length > 1) {
                capturedBefore = args[1];
              }
              return {
                all: async () => ({ results: mockMessages })
              };
            }
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1&before=10&limit=50');
      const response = await app.fetch(request, env);
      const data = await parseResponse(response);

      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(1);
      expect(capturedBefore).toBe(10); // Number, not string
    });

    it('should respect limit parameter', async () => {
      const mockRoom = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public'
      };

      let capturedLimit = null;

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: (...args) => {
              // 捕获 limit 参数（最后一个参数）
              capturedLimit = args[args.length - 1];
              return {
                all: async () => ({ results: [] })
              };
            }
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1&limit=20');
      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
      expect(capturedLimit).toBe(20);
    });

    it('should use default limit when not specified', async () => {
      const mockRoom = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public'
      };

      let capturedLimit = null;

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: (...args) => {
              capturedLimit = args[args.length - 1];
              return {
                all: async () => ({ results: [] })
              };
            }
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1');
      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
      // 默认 limit 是 30（根据 listMessages 的实现）
      expect(capturedLimit).toBe(30);
    });

    it('should cap limit at maximum value', async () => {
      const mockRoom = {
        id: 1,
        name: 'general',
        description: 'General chat',
        kind: 'public'
      };

      let capturedLimit = null;

      env.DB.prepare = (sql) => {
        if (sql.includes('SELECT c.id, c.name')) {
          return {
            bind: () => ({
              all: async () => ({ results: [mockRoom] })
            })
          };
        }
        if (sql.includes('FROM messages m')) {
          return {
            bind: (...args) => {
              capturedLimit = args[args.length - 1];
              return {
                all: async () => ({ results: [] })
              };
            }
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] })
          })
        };
      };

      const request = createTestRequest('/api/messages?kind=public&roomId=1&limit=1000');
      const response = await app.fetch(request, env);

      expect(response.status).toBe(200);
      // limit 应该被限制在最大值（通常是 100）
      expect(capturedLimit).toBeLessThanOrEqual(100);
    });
  });
});
