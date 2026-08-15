/**
 * Parse WhatsApp click-to-chat URLs into a phone number (E.164, with leading
 * "+") and an optional pre-filled message text.
 *
 * Supported formats:
 *   - https://wa.me/<number>[?text=...]
 *   - https://api.whatsapp.com/send?phone=<number>[&text=...]
 *
 * chat.whatsapp.com group-invite links are explicitly rejected (no phone
 * number to start a DM with).
 */

export interface ParsedWhatsAppUrl {
  readonly phone: string;
  readonly text?: string;
}

/** Thrown when a URL is not a WhatsApp click-to-chat link we can handle. */
export class UrlParseError extends Error {}

const WA_ME_HOSTS = new Set(['wa.me', 'www.wa.me']);
const API_HOSTS = new Set(['api.whatsapp.com', 'www.api.whatsapp.com']);

export function parseWhatsAppUrl(raw: string): ParsedWhatsAppUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlParseError(`Not a valid URL: ${raw}`);
  }

  const host = url.hostname.toLowerCase();

  if (WA_ME_HOSTS.has(host)) {
    const path = url.pathname.slice(1); // strip leading '/'
    const number = path.split('/')[0];
    if (!number) {
      throw new UrlParseError('wa.me link is missing a phone number');
    }
    const text = url.searchParams.get('text') ?? undefined;
    return { phone: normalizePhone(number), ...withText(text) };
  }

  if (API_HOSTS.has(host)) {
    if (!url.pathname.endsWith('/send')) {
      throw new UrlParseError(`Unsupported api.whatsapp.com path: ${url.pathname}`);
    }
    const number = url.searchParams.get('phone');
    if (!number) {
      throw new UrlParseError('api.whatsapp.com/send link is missing the phone parameter');
    }
    const text = url.searchParams.get('text') ?? undefined;
    return { phone: normalizePhone(number), ...withText(text) };
  }

  if (host === 'chat.whatsapp.com' || host === 'www.chat.whatsapp.com') {
    throw new UrlParseError('chat.whatsapp.com group invite links cannot be opened as a phone-number chat');
  }

  throw new UrlParseError(`Unsupported WhatsApp host: ${host}`);
}

/**
 * Normalize a raw phone string to E.164-ish form: strip everything that is
 * not a digit and prepend "+". wa.me and api.whatsapp.com numbers are already
 * country-code based, so digits are kept as-is.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 0) {
    throw new UrlParseError(`Invalid phone number: ${raw}`);
  }
  return `+${digits}`;
}

function withText(text: string | undefined): Pick<ParsedWhatsAppUrl, 'text'> {
  return text !== undefined && text !== '' ? { text } : {};
}
