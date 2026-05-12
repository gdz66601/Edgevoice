import { describe, expect, it } from 'vitest';

import { sanitizeText, validateMessage } from '../../worker/src/validation.js';
import {
  decryptMessageContent,
  encryptMessageContent,
  isEncryptedMessageContent
} from '../../frontend/src/e2ee.js';
import { pickAttachment } from '../../worker/src/utils.js';
import {
  findBlockedWord,
  isMutedUntilActive,
  normalizeBlockedWords,
  toMuteUntil
} from '../../worker/src/moderation.js';

describe('sanitizeText', () => {
  it('escapes HTML special chars', () => {
    expect(sanitizeText('1 < 2 && <3')).toBe('1 &lt; 2 &amp;&amp; &lt;3');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(123)).toBe('');
  });
});

describe('validateMessage', () => {
  it('accepts plain text and HTML-escapes it', () => {
    const result = validateMessage('Use Array<string> & keep it');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Use Array&lt;string&gt; &amp; keep it');
  });

  it('rejects empty messages', () => {
    expect(validateMessage('').valid).toBe(false);
    expect(validateMessage('   ').valid).toBe(false);
  });

  it('passes through valid encrypted envelopes unchanged', async () => {
    const encrypted = await encryptMessageContent('secret <payload>', 'pass', 'dm:42');
    const result = validateMessage(encrypted);
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe(encrypted);
  });

  it('rejects malformed encrypted envelopes', () => {
    expect(validateMessage('edgechat:e2ee:v1:<script>').valid).toBe(false);
  });
});

describe('e2ee encryptMessageContent / decryptMessageContent', () => {
  it('round-trips with the correct passphrase', async () => {
    const encrypted = await encryptMessageContent('secret <payload>', 'pass', 'dm:42');
    expect(isEncryptedMessageContent(encrypted)).toBe(true);

    const decrypted = await decryptMessageContent(encrypted, 'pass', 'dm:42');
    expect(decrypted.encrypted).toBe(true);
    expect(decrypted.failed).toBe(false);
    expect(decrypted.content).toBe('secret <payload>');
  });

  it('fails with the wrong passphrase', async () => {
    const encrypted = await encryptMessageContent('secret', 'pass', 'dm:42');
    const result = await decryptMessageContent(encrypted, 'wrong', 'dm:42');
    expect(result.failed).toBe(true);
  });

  it('fails when AAD (room key) is tampered with', async () => {
    const encrypted = await encryptMessageContent('secret', 'pass', 'dm:42');
    const result = await decryptMessageContent(encrypted, 'pass', 'dm:99');
    expect(result.failed).toBe(true);
  });
});

describe('pickAttachment', () => {
  it('returns a normalized attachment for valid input', () => {
    const attachment = pickAttachment({
      key: '1/123-file.png',
      name: ' report.png '.repeat(30),
      type: 'image/png',
      size: 42
    });
    expect(attachment.key).toBe('1/123-file.png');
    expect(attachment.type).toBe('image/png');
    expect(attachment.size).toBe(42);
    expect(attachment.url).toBe('/files/1%2F123-file.png');
    expect(attachment.name.length).toBe(180);
  });

  it('rejects path-traversal keys', () => {
    expect(pickAttachment({ key: '..\\secret', name: 'x', type: 'text/plain' })).toBeNull();
    expect(pickAttachment({ key: '../secret', name: 'x', type: 'text/plain' })).toBeNull();
  });

  it('returns null for missing key', () => {
    expect(pickAttachment({ name: 'x', type: 'text/plain' })).toBeNull();
    expect(pickAttachment(null)).toBeNull();
  });
});

describe('moderation', () => {
  it('normalizes blocked words (lowercase, dedup, trim, drop empty)', () => {
    expect(normalizeBlockedWords(['  spam  ', 'SPAM', '', '恶意'])).toEqual(['spam', '恶意']);
  });

  it('finds the first blocked word in mixed case', () => {
    expect(findBlockedWord('This contains SpAm text', ['spam'])?.word).toBe('spam');
  });

  it('does not match blocked words inside encrypted envelopes', async () => {
    const encrypted = await encryptMessageContent('secret', 'pass', 'dm:42');
    expect(findBlockedWord(encrypted, ['secret'])).toBeNull();
  });

  it('returns null when no blocked word matches', () => {
    expect(findBlockedWord('干净内容', ['spam'])).toBeNull();
  });
});

describe('mute helpers', () => {
  it('toMuteUntil returns a future ISO timestamp', () => {
    const muteUntil = toMuteUntil(30);
    expect(isMutedUntilActive(muteUntil, new Date(Date.now() - 1000))).toBe(true);
  });

  it('isMutedUntilActive returns false for null / past', () => {
    expect(isMutedUntilActive(null)).toBe(false);
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isMutedUntilActive(past)).toBe(false);
  });

  it('toMuteUntil rejects non-positive minutes', () => {
    expect(() => toMuteUntil(0)).toThrow(/禁言时长/);
    expect(() => toMuteUntil(-1)).toThrow(/禁言时长/);
  });
});
