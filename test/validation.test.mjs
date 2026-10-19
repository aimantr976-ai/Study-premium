import test from 'node:test';
import assert from 'node:assert/strict';
import { validHttpUrl, emailValid, mobileValid, cleanText, moneyPaise, ApiError } from '../netlify/functions/lib/security.mjs';

test('valid HTTP and HTTPS destination URLs are accepted', () => {
  assert.equal(validHttpUrl('https://example.com/resource'), true);
  assert.equal(validHttpUrl('http://localhost:3000/path'), true);
  assert.equal(validHttpUrl('javascript:alert(1)'), false);
  assert.equal(validHttpUrl('https://user:pass@example.com'), false);
});
test('email and mobile validators handle common valid and invalid input', () => {
  assert.equal(emailValid('student@example.com'), true);
  assert.equal(emailValid('bad-address'), false);
  assert.equal(mobileValid('+919876543210'), true);
  assert.equal(mobileValid('abc123'), false);
});
test('text input is trimmed and bounded', () => {
  assert.equal(cleanText('  hello  ', 10), 'hello');
  assert.equal(cleanText('abcdef', 3), 'abc');
});
test('money is represented in integer paise', () => {
  assert.equal(moneyPaise('149.50'), 14950);
  assert.throws(() => moneyPaise('-1'), ApiError);
  assert.throws(() => moneyPaise('not-a-number'), ApiError);
});
