/**
 * Resolve a wa.me/message/<code> business short link to its phone number.
 *
 * The number is not in the URL. WhatsApp's landing page embeds it in a
 * web.whatsapp.com/send?...&phone=<number> link, so one server-side GET is
 * enough to read it back out.
 */

import { normalizePhone, UrlParseError } from './whatsapp-url.ts';

const TIMEOUT_MS = 10_000;

// Without these navigation headers WhatsApp answers with a Meta "something went
// wrong" page instead of the resolved chat.
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-site': 'none',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

const PHONE_IN_PAGE = /(?:send|wa\.me)[^"'\s<]*?[?&](?:amp;)?phone=(\d{6,15})/;

export async function resolveWhatsAppShortLink(code: string): Promise<string> {
  const link = `https://wa.me/message/${encodeURIComponent(code)}`;

  let html: string;
  try {
    const res = await fetch(link, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      throw new UrlParseError(`WhatsApp short link ${code} could not be resolved (HTTP ${res.status})`);
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof UrlParseError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new UrlParseError(`Could not reach WhatsApp to resolve short link ${code}: ${reason}`);
  }

  const phone = PHONE_IN_PAGE.exec(html)?.[1];
  if (phone === undefined) {
    throw new UrlParseError(
      `WhatsApp short link ${code} has no phone number on its page — it may be expired or revoked`,
    );
  }
  return normalizePhone(phone);
}
