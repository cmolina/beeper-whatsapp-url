/**
 * Parse WhatsApp click-to-chat URLs into a phone number (E.164, with leading
 * "+") and an optional pre-filled message text.
 *
 * Supported formats:
 *   - https://wa.me/<number>[?text=...]
 *   - https://api.whatsapp.com/send?phone=<number>[&text=...]
 *   - https://web.whatsapp.com/send?phone=<number>[&text=...]
 *   - https://wa.me/message/<code> (short links; reported via WhatsAppShortLinkError
 *     and resolved by whatsapp-short-link.ts)
 *
 * chat.whatsapp.com group-invite links are explicitly rejected.
 */

export interface ParsedWhatsAppUrl {
  readonly phone: string;
  readonly text?: string;
}

/** Thrown when a URL is not a WhatsApp click-to-chat link we can handle. */
export class UrlParseError extends Error {}

/**
 * Thrown for wa.me/message/<code> business short links, which hide the phone
 * number behind a code that only WhatsApp's landing page can resolve.
 */
export class WhatsAppShortLinkError extends UrlParseError {
  readonly code: string;

  constructor(code: string) {
    super(`WhatsApp short link ${code} has no phone number in the URL`);
    this.code = code;
  }
}

export function parseWhatsAppUrl(raw: string): ParsedWhatsAppUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlParseError(`Not a valid URL: ${raw}`);
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith('wa.me') && !host.endsWith('whatsapp.com')) {
    throw new UrlParseError(`Unsupported WhatsApp host: ${host}`);
  }
  if (host.includes('chat.whatsapp.com')) {
    throw new UrlParseError('chat.whatsapp.com group invite links cannot be opened as a phone-number chat');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'message') {
    const code = segments[1];
    if (code === undefined) {
      throw new UrlParseError(`WhatsApp short link is missing its code: ${raw}`);
    }
    throw new WhatsAppShortLinkError(code);
  }

  const phone = url.searchParams.get('phone') || segments[0];
  if (!phone || phone === 'send') {
    throw new UrlParseError(`WhatsApp link is missing a phone number: ${raw}`);
  }

  const text = url.searchParams.get('text') || undefined;
  return {
    phone: normalizePhone(phone),
    ...(text ? { text } : {}),
  };
}

/**
 * Normalize a raw phone string to E.164-ish form: strip non-digits and prepend "+".
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 0) {
    throw new UrlParseError(`Invalid phone number: ${raw}`);
  }
  return `+${digits}`;
}
