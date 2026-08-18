/**
 * Parse WhatsApp click-to-chat URLs into a phone number (E.164, with leading
 * "+") and an optional pre-filled message text.
 *
 * Supported formats:
 *   - https://wa.me/<number>[?text=...]
 *   - https://api.whatsapp.com/send?phone=<number>[&text=...]
 *   - https://web.whatsapp.com/send?phone=<number>[&text=...]
 *
 * chat.whatsapp.com group-invite links are explicitly rejected.
 */

export interface ParsedWhatsAppUrl {
  readonly phone: string;
  readonly text?: string;
}

/** Thrown when a URL is not a WhatsApp click-to-chat link we can handle. */
export class UrlParseError extends Error {}

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

  const phone = url.searchParams.get('phone') || url.pathname.split('/').filter(Boolean)[0];
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
