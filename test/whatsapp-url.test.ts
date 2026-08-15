import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePhone, parseWhatsAppUrl, UrlParseError } from '../src/whatsapp-url.ts';

test('wa.me with just a number', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/56944897244'), { phone: '+56944897244' });
});

test('wa.me with pre-filled text', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/56944897244?text=Hello%20world'), {
    phone: '+56944897244',
    text: 'Hello world',
  });
});

test('wa.me number with a plus sign', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/+56944897244'), { phone: '+56944897244' });
});

test('api.whatsapp.com/send with phone and text', () => {
  assert.deepEqual(parseWhatsAppUrl('https://api.whatsapp.com/send?phone=%2B56944897244&text=Hi%20there'), {
    phone: '+56944897244',
    text: 'Hi there',
  });
});

test('empty text is omitted', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/56944897244?text='), { phone: '+56944897244' });
});

test('chat.whatsapp.com group links are rejected', () => {
  assert.throws(() => parseWhatsAppUrl('https://chat.whatsapp.com/abc123'), UrlParseError);
});

test('wa.me without a number is rejected', () => {
  assert.throws(() => parseWhatsAppUrl('https://wa.me/'), UrlParseError);
});

test('api.whatsapp.com without phone param is rejected', () => {
  assert.throws(() => parseWhatsAppUrl('https://api.whatsapp.com/send?text=Hi'), UrlParseError);
});

test('unsupported host is rejected', () => {
  assert.throws(() => parseWhatsAppUrl('https://example.com/x'), UrlParseError);
});

test('garbage input is rejected', () => {
  assert.throws(() => parseWhatsAppUrl('not a url'), UrlParseError);
});

test('normalizePhone strips formatting junk', () => {
  assert.equal(normalizePhone('(56) 9 4489-7244'), '+56944897244');
  assert.equal(normalizePhone('+56 9 4489 7244'), '+56944897244');
});

test('normalizePhone rejects numbers with no digits', () => {
  assert.throws(() => normalizePhone('---'), UrlParseError);
});
