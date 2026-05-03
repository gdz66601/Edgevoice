import assert from 'node:assert/strict';

import { sanitizeText, validateMessage } from '../worker/src/validation.js';

assert.equal(sanitizeText('1 < 2 && <3'), '1 &lt; 2 &amp;&amp; &lt;3');

const result = validateMessage('Use Array<string> & keep it');

assert.equal(result.valid, true);
assert.equal(result.sanitized, 'Use Array&lt;string&gt; &amp; keep it');
