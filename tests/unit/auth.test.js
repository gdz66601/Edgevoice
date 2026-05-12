import { describe, expect, it } from 'vitest';

import {
  PBKDF2_HASH_VERSION_CURRENT,
  PBKDF2_ITERATIONS_CURRENT,
  PBKDF2_ITERATIONS_V1,
  hashPassword,
  isAdminUser,
  verifyPassword
} from '../../worker/src/auth.js';

describe('hashPassword', () => {
  it('returns a fresh salt each time', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('tags the hash with the current version', async () => {
    const result = await hashPassword('secret');
    expect(result.version).toBe(PBKDF2_HASH_VERSION_CURRENT);
  });

  it('is deterministic given the same salt', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret', a.salt);
    expect(b.hash).toBe(a.hash);
  });
});

describe('verifyPassword', () => {
  it('returns valid=true / needsRehash=false for current-version hashes', async () => {
    const hashed = await hashPassword('secret');
    const result = await verifyPassword('secret', hashed.hash, hashed.salt, hashed.version);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('returns valid=false for wrong password without timing leak via lengths', async () => {
    const hashed = await hashPassword('secret');
    const result = await verifyPassword('wrong', hashed.hash, hashed.salt, hashed.version);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('flags legacy v1 hashes for rehash on successful login', async () => {
    // 模拟历史用户：手动用 100k 迭代构造一个 v1 hash
    const encoder = new TextEncoder();
    const salt = await hashPassword('any').then((h) => h.salt);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('legacy'),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const saltBytes = Uint8Array.from(atob(salt.replace(/-/g, '+').replace(/_/g, '/').padEnd(salt.length + ((4 - (salt.length % 4 || 4)) % 4), '=')), (c) => c.charCodeAt(0));
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS_V1, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const legacyHash = btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const result = await verifyPassword('legacy', legacyHash, salt, 1);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it('does not signal rehash when password is wrong', async () => {
    const hashed = await hashPassword('secret');
    const result = await verifyPassword('wrong', hashed.hash, hashed.salt, 1);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });
});

describe('isAdminUser', () => {
  it('honors the is_admin column', () => {
    expect(isAdminUser({ ADMIN_USERNAMES: '' }, { username: 'alice', is_admin: 1 })).toBe(true);
    expect(isAdminUser({ ADMIN_USERNAMES: '' }, { username: 'alice', is_admin: 0 })).toBe(false);
  });

  it('honors the ADMIN_USERNAMES env list (case-insensitive)', () => {
    expect(isAdminUser({ ADMIN_USERNAMES: 'admin,Root' }, { username: 'ROOT' })).toBe(true);
    expect(isAdminUser({ ADMIN_USERNAMES: 'admin,Root' }, { username: 'bob' })).toBe(false);
  });
});

describe('PBKDF2 configuration', () => {
  it('uses 600k iterations for current version', () => {
    expect(PBKDF2_ITERATIONS_CURRENT).toBeGreaterThanOrEqual(600_000);
  });

  it('keeps the legacy iteration count documented for migration', () => {
    expect(PBKDF2_ITERATIONS_V1).toBe(100_000);
  });
});
