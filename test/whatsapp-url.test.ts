import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePhone, parseWhatsAppUrl, UrlParseError } from '../src/whatsapp-url.ts';

test('wa.me with just a number', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/5491163544698'), { phone: '+5491163544698' });
});

test('wa.me with pre-filled text', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/5491163544698?text=Hola%20mundo!'), {
    phone: '+5491163544698',
    text: 'Hola mundo!',
  });
});

test('wa.me number with a plus sign', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/+5491163544698'), { phone: '+5491163544698' });
});

test('api.whatsapp.com/send with phone and text', () => {
  assert.deepEqual(parseWhatsAppUrl('https://api.whatsapp.com/send?phone=%2B5491163544698&text=Hola%20mundo!'), {
    phone: '+5491163544698',
    text: 'Hola mundo!',
  });
});

test('api.whatsapp.com/send/ with trailing slash, extra query params, and text', () => {
  const raw =
    'https://api.whatsapp.com/send/?phone=5491163544698&text=Hola+mundo%21&type=phone_number&app_absent=0';
  assert.deepEqual(parseWhatsAppUrl(raw), {
    phone: '+5491163544698',
    text: 'Hola mundo!',
  });
});

test('web.whatsapp.com/send with phone and text', () => {
  assert.deepEqual(parseWhatsAppUrl('https://web.whatsapp.com/send?phone=5491163544698&text=Hola%20mundo!'), {
    phone: '+5491163544698',
    text: 'Hola mundo!',
  });
});

test('wa.me with trailing slash', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/5491163544698/'), { phone: '+5491163544698' });
});

test('wa.me/?phone= query style', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/?phone=5491163544698&text=Hola%20mundo!'), {
    phone: '+5491163544698',
    text: 'Hola mundo!',
  });
});

test('empty text is omitted', () => {
  assert.deepEqual(parseWhatsAppUrl('https://wa.me/5491163544698?text='), { phone: '+5491163544698' });
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
  assert.equal(normalizePhone('+54 9 11 6354-4698'), '+5491163544698');
  assert.equal(normalizePhone('+54 (9) 11 6354-4698'), '+5491163544698');
});

test('normalizePhone rejects numbers with no digits', () => {
  assert.throws(() => normalizePhone('---'), UrlParseError);
});
