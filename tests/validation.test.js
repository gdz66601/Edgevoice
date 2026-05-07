import assert from 'node:assert/strict';

import { sanitizeText, validateMessage } from '../worker/src/validation.js';
import {
  decryptMessageContent,
  encryptMessageContent,
  isEncryptedMessageContent
} from '../frontend/src/e2ee.js';
import { pickAttachment } from '../worker/src/utils.js';
import {
  findBlockedWord,
  normalizeBlockedWords,
  toMuteUntil,
  isMutedUntilActive
} from '../worker/src/moderation.js';

assert.equal(sanitizeText('1 < 2 && <3'), '1 &lt; 2 &amp;&amp; &lt;3');

const result = validateMessage('Use Array<string> & keep it');

assert.equal(result.valid, true);
assert.equal(result.sanitized, 'Use Array&lt;string&gt; &amp; keep it');

const encrypted = await encryptMessageContent('secret <payload>', 'shared-passphrase', 'dm:42');
assert.equal(isEncryptedMessageContent(encrypted), true);

const encryptedValidation = validateMessage(encrypted);
assert.equal(encryptedValidation.valid, true);
assert.equal(encryptedValidation.sanitized, encrypted);

const decrypted = await decryptMessageContent(encrypted, 'shared-passphrase', 'dm:42');
assert.equal(decrypted.encrypted, true);
assert.equal(decrypted.failed, false);
assert.equal(decrypted.content, 'secret <payload>');

const wrongKey = await decryptMessageContent(encrypted, 'wrong-passphrase', 'dm:42');
assert.equal(wrongKey.failed, true);

const malformedEncrypted = validateMessage('edgechat:e2ee:v1:<script>');
assert.equal(malformedEncrypted.valid, false);

const attachment = pickAttachment({
  key: '1/123-file.png',
  name: ' report.png '.repeat(30),
  type: 'image/png',
  size: 42
});
assert.equal(attachment.key, '1/123-file.png');
assert.equal(attachment.type, 'image/png');
assert.equal(attachment.size, 42);
assert.equal(attachment.url, '/files/1%2F123-file.png');
assert.equal(attachment.name.length, 180);
assert.equal(pickAttachment({ key: '..\\secret', name: 'x', type: 'text/plain' }), null);

assert.deepEqual(normalizeBlockedWords(['  spam  ', 'SPAM', '', '恶意']), ['spam', '恶意']);
assert.equal(findBlockedWord('This contains SpAm text', ['spam'])?.word, 'spam');
assert.equal(findBlockedWord(encrypted, ['secret']), null);
assert.equal(findBlockedWord('干净内容', ['spam']), null);

const muteUntil = toMuteUntil(30);
assert.equal(isMutedUntilActive(muteUntil, new Date(Date.now() - 1000)), true);
assert.equal(isMutedUntilActive(null), false);
assert.throws(() => toMuteUntil(0), /禁言时长/);
