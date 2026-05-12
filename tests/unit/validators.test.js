import { describe, expect, it } from 'vitest';

import {
  isValidEmail,
  isValidUrl,
  validateChannelName,
  validateDisplayName,
  validatePassword,
  validateUsername
} from '../../worker/src/validation.js';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 chars', () => {
    expect(validatePassword('Abc12').valid).toBe(false);
  });

  it('rejects weak single-class passwords', () => {
    // 全小写：strengthScore = 1 → weak
    expect(validatePassword('abcdefgh').valid).toBe(false);
    // 全数字
    expect(validatePassword('12345678').valid).toBe(false);
  });

  it('accepts medium passwords (2+ char classes)', () => {
    const result = validatePassword('admin123');
    expect(result.valid).toBe(true);
    expect(result.strength).toBe('medium');
  });

  it('accepts strong passwords (3+ char classes)', () => {
    const result = validatePassword('Admin123!');
    expect(result.valid).toBe(true);
    expect(result.strength).toBe('strong');
  });

  it('rejects passwords longer than 128 chars', () => {
    expect(validatePassword('A1' + 'a'.repeat(127)).valid).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validatePassword(null).valid).toBe(false);
    expect(validatePassword(12345678).valid).toBe(false);
  });
});

describe('validateUsername', () => {
  it('rejects empty / too-short / too-long', () => {
    expect(validateUsername('').valid).toBe(false);
    expect(validateUsername('a').valid).toBe(false);
    expect(validateUsername('a'.repeat(33)).valid).toBe(false);
  });

  it('accepts valid usernames', () => {
    expect(validateUsername('alice').valid).toBe(true);
    expect(validateUsername('alice_99').valid).toBe(true);
  });
});

describe('validateDisplayName', () => {
  it('rejects empty', () => {
    expect(validateDisplayName('').valid).toBe(false);
  });

  it('accepts unicode and trims internally', () => {
    expect(validateDisplayName('张三').valid).toBe(true);
  });
});

describe('validateChannelName', () => {
  it('rejects empty / too-long', () => {
    expect(validateChannelName('').valid).toBe(false);
    expect(validateChannelName('x'.repeat(80)).valid).toBe(false);
  });

  it('accepts reasonable names', () => {
    expect(validateChannelName('general').valid).toBe(true);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/icon.png')).toBe(true);
  });

  it('rejects javascript: and data: schemes', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('data:text/html,<script>')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl(undefined)).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user.example.com')).toBe(false);
  });
});
