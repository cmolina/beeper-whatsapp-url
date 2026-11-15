import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveWhatsAppShortLink } from '../src/whatsapp-short-link.ts';
import { UrlParseError } from '../src/whatsapp-url.ts';

const realFetch = globalThis.fetch;

/** Serve a canned WhatsApp page for any request and restore fetch afterwards. */
async function withPage(html: string, run: () => Promise<void>): Promise<void> {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(html);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(requested[0] ?? '', /^https:\/\/wa\.me\/message\//);
}

test('reads the phone number out of the resolved WhatsApp page', async () => {
  await withPage(
    '<a href="https://web.whatsapp.com/send?autoload=1&amp;app_absent=0&amp;phone=56954546574&amp;text">',
    async () => {
      assert.equal(await resolveWhatsAppShortLink('5L374KOPQ6ZTJ1'), '+56954546574');
    },
  );
});

test('rejects a short link whose page has no number', async () => {
  await withPage('<html><h1>Sorry, something went wrong.</h1></html>', async () => {
    await assert.rejects(() => resolveWhatsAppShortLink('AAAAAAAAAAAAAA'), UrlParseError);
  });
});

test('rejects a short link whose page fails to load', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(() => resolveWhatsAppShortLink('5L374KOPQ6ZTJ1'), /HTTP 500/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
