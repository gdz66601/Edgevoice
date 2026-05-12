/**
 * 速率限制单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, enforceRateLimit, clientIp } from '../../worker/src/rate-limit.js';
import { createMockKV } from '../integration/test-helpers.js';

describe('Rate Limiting', () => {
  let env;

  beforeEach(() => {
    env = {
      SESSIONS: createMockKV()
    };
  });

  describe('checkRateLimit', () => {
    it('should allow request within limit', async () => {
      const result = await checkRateLimit(env, 'test', 'user1', { max: 5, windowSeconds: 60 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should track multiple requests', async () => {
      const options = { max: 3, windowSeconds: 60 };

      const r1 = await checkRateLimit(env, 'test', 'user1', options);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await checkRateLimit(env, 'test', 'user1', options);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await checkRateLimit(env, 'test', 'user1', options);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it('should block request when limit exceeded', async () => {
      const options = { max: 2, windowSeconds: 60 };

      await checkRateLimit(env, 'test', 'user1', options);
      await checkRateLimit(env, 'test', 'user1', options);
      const result = await checkRateLimit(env, 'test', 'user1', options);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should use different counters for different scopes', async () => {
      const options = { max: 2, windowSeconds: 60 };

      await checkRateLimit(env, 'login', 'user1', options);
      await checkRateLimit(env, 'login', 'user1', options);

      // 不同的 scope 应该有独立的计数器
      const result = await checkRateLimit(env, 'register', 'user1', options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should use different counters for different keys', async () => {
      const options = { max: 2, windowSeconds: 60 };

      await checkRateLimit(env, 'test', 'user1', options);
      await checkRateLimit(env, 'test', 'user1', options);

      // 不同的 key 应该有独立的计数器
      const result = await checkRateLimit(env, 'test', 'user2', options);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should use default values when options not provided', async () => {
      const result = await checkRateLimit(env, 'test', 'user1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 默认 max 是 10
    });

    it('should fail open when KV read fails', async () => {
      env.SESSIONS.get = async () => {
        throw new Error('KV read error');
      };

      const result = await checkRateLimit(env, 'test', 'user1', { max: 5 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('should continue when KV write fails', async () => {
      env.SESSIONS.put = async () => {
        throw new Error('KV write error');
      };

      const result = await checkRateLimit(env, 'test', 'user1', { max: 5 });

      // 即使写入失败，也应该允许请求（fail-open）
      expect(result.allowed).toBe(true);
    });

    it('should handle invalid count values gracefully', async () => {
      await env.SESSIONS.put('rl:test:user1:0', 'invalid-number');

      const result = await checkRateLimit(env, 'test', 'user1', { max: 5 });

      expect(result.allowed).toBe(true);
    });
  });

  describe('enforceRateLimit', () => {
    it('should return null when request is allowed', async () => {
      const c = {
        env,
        req: { header: () => null }
      };

      const result = await enforceRateLimit(c, 'test', 'user1', { max: 5 });

      expect(result).toBeNull();
    });

    it('should return 429 response when limit exceeded', async () => {
      const c = {
        env,
        req: { header: () => null }
      };

      const options = { max: 2, windowSeconds: 60 };

      await enforceRateLimit(c, 'test', 'user1', options);
      await enforceRateLimit(c, 'test', 'user1', options);
      const result = await enforceRateLimit(c, 'test', 'user1', options);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(429);

      const body = await result.json();
      expect(body.error).toContain('请求过于频繁');

      const retryAfter = result.headers.get('retry-after');
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);
    });

    it('should include cache-control header in 429 response', async () => {
      const c = {
        env,
        req: { header: () => null }
      };

      const options = { max: 1, windowSeconds: 60 };

      await enforceRateLimit(c, 'test', 'user1', options);
      const result = await enforceRateLimit(c, 'test', 'user1', options);

      expect(result.headers.get('cache-control')).toBe('no-store');
    });
  });

  describe('clientIp', () => {
    it('should extract IP from cf-connecting-ip header', () => {
      const c = {
        req: {
          header: (name) => {
            if (name === 'cf-connecting-ip') return '1.2.3.4';
            return null;
          }
        }
      };

      const ip = clientIp(c);
      expect(ip).toBe('1.2.3.4');
    });

    it('should extract IP from x-forwarded-for header', () => {
      const c = {
        req: {
          header: (name) => {
            if (name === 'x-forwarded-for') return '5.6.7.8, 9.10.11.12';
            return null;
          }
        }
      };

      const ip = clientIp(c);
      expect(ip).toBe('5.6.7.8');
    });

    it('should prefer cf-connecting-ip over x-forwarded-for', () => {
      const c = {
        req: {
          header: (name) => {
            if (name === 'cf-connecting-ip') return '1.2.3.4';
            if (name === 'x-forwarded-for') return '5.6.7.8';
            return null;
          }
        }
      };

      const ip = clientIp(c);
      expect(ip).toBe('1.2.3.4');
    });

    it('should return "unknown" when no IP headers present', () => {
      const c = {
        req: {
          header: () => null
        }
      };

      const ip = clientIp(c);
      expect(ip).toBe('unknown');
    });

    it('should trim whitespace from x-forwarded-for', () => {
      const c = {
        req: {
          header: (name) => {
            if (name === 'x-forwarded-for') return '  1.2.3.4  , 5.6.7.8';
            return null;
          }
        }
      };

      const ip = clientIp(c);
      expect(ip).toBe('1.2.3.4');
    });
  });
});
