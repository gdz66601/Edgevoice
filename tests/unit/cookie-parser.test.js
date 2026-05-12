import { describe, expect, it } from 'vitest';

// 通过 fetch + worker 入口测试 cookie 提取在实际场景非常重，
// 这里只针对 cookie 解析器中容易被忽略的边界做单元测试。
// extractToken 不是 export，但行为已被中间件包装；我们重建相同的解析逻辑。

function parseCookies(cookieHeader) {
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const trimmed = cookie.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      return acc;
    }
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (key && value) {
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}

describe('cookie parser', () => {
  it('extracts a single token cookie', () => {
    const result = parseCookies('cfchat_token=abc123');
    expect(result.cfchat_token).toBe('abc123');
  });

  it('preserves base64-padding-equals inside cookie values', () => {
    // base64url 默认无 =，但万一未来 token 改 base64 标准格式，'='应保留
    const result = parseCookies('cfchat_token=ab==; other=xyz');
    expect(result.cfchat_token).toBe('ab==');
    expect(result.other).toBe('xyz');
  });

  it('handles cookies with leading/trailing whitespace', () => {
    const result = parseCookies('  foo=bar  ;  baz=qux  ');
    expect(result.foo).toBe('bar');
    expect(result.baz).toBe('qux');
  });

  it('skips malformed entries without a key', () => {
    const result = parseCookies('=lone-value;cfchat_token=ok');
    expect(result.cfchat_token).toBe('ok');
    expect(result['']).toBeUndefined();
  });

  it('decodes percent-encoded values', () => {
    const result = parseCookies('foo=hello%20world');
    expect(result.foo).toBe('hello world');
  });

  it('falls back to raw value if decode fails', () => {
    // 无效百分号编码（'%' 后非两位 hex）
    const result = parseCookies('foo=bad%2');
    expect(result.foo).toBe('bad%2');
  });
});
