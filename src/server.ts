/**
 * beeper-whatsapp-url — turn wa.me / api.whatsapp.com links into new WhatsApp
 * chats inside Beeper Desktop.
 *
 * Routes:
 *   GET /                  HTML form to paste a WhatsApp link
 *   GET /health            JSON status
 *   GET /open?phone=..&text=..       open chat by phone number
 *   GET /wa/<number>?text=..         short form of /open
 *   GET /redirect?url=<encoded>      parse a full WhatsApp URL and open it
 *
 * Append &json=1 to any route to get a JSON response instead of HTML.
 *
 * Run:  BEEPER_ACCESS_TOKEN=... node --experimental-strip-types src/server.ts
 */

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { pathToFileURL } from 'node:url';

import { normalizePhone, parseWhatsAppUrl, UrlParseError } from './whatsapp-url.ts';
import type { ParsedWhatsAppUrl } from './whatsapp-url.ts';
import { startWhatsAppChat, focusChat } from './beeper-client.ts';
import type { BeeperConfig, ChatStartResult, FocusResult } from './beeper-client.ts';

const DEFAULT_PORT = 8765;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Build the HTTP server. Environment values are read at call time so tests can
 * inject their own (mock Beeper endpoint, token, etc.).
 */
export function createApp(env: NodeJS.ProcessEnv = process.env): Server {
  const config: BeeperConfig = {
    baseUrl: env.BEEPER_BASE_URL ?? 'http://127.0.0.1:23373',
    token: env.BEEPER_ACCESS_TOKEN ?? '',
    whatsappAccountOverride: env.BEEPER_WHATSAPP_ACCOUNT,
  };

  const server = createServer((req, res) => {
    handle(req, res, config).catch((err: unknown) => {
      const status =
        err instanceof HttpError ? err.status : err instanceof UrlParseError ? 400 : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (req.url?.includes('json=1')) {
        sendJson(res, status, { ok: false, error: message });
      } else {
        sendHtml(res, status, errorPage(status, message));
      }
    });
  });

  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, config: BeeperConfig): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'Only GET is supported');
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const json = url.searchParams.get('json') === '1';
  const pathname = url.pathname;

  if (pathname === '/') {
    sendHtml(res, 200, indexPage(config));
    return;
  }

  if (pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'beeper-whatsapp-url',
      beeperBaseUrl: config.baseUrl,
      tokenConfigured: config.token !== '',
    });
    return;
  }

  if (pathname === '/open') {
    const phone = url.searchParams.get('phone');
    if (!phone) {
      throw new HttpError(400, 'Missing ?phone= parameter');
    }
    const parsed: ParsedWhatsAppUrl = {
      phone: normalizePhone(phone),
      ...withText(url.searchParams.get('text') ?? undefined),
    };
    await openChat(parsed, json, res, config);
    return;
  }

  if (pathname.startsWith('/wa/')) {
    const phone = decodeURIComponent(pathname.slice('/wa/'.length));
    const parsed: ParsedWhatsAppUrl = {
      phone: normalizePhone(phone),
      ...withText(url.searchParams.get('text') ?? undefined),
    };
    await openChat(parsed, json, res, config);
    return;
  }

  if (pathname === '/redirect') {
    const target = url.searchParams.get('url');
    if (!target) {
      throw new HttpError(400, 'Missing ?url= parameter');
    }
    const parsed = parseWhatsAppUrl(target);
    await openChat(parsed, json, res, config);
    return;
  }

  throw new HttpError(404, `Unknown path: ${pathname}`);
}

async function openChat(
  parsed: ParsedWhatsAppUrl,
  json: boolean,
  res: ServerResponse,
  config: BeeperConfig,
): Promise<void> {
  if (config.token === '') {
    throw new HttpError(
      500,
      'BEEPER_ACCESS_TOKEN is not set. Get a token from Beeper Desktop (Settings -> Integrations) and add it to the .env file.',
    );
  }
  const result: ChatStartResult = await startWhatsAppChat(config, parsed);
  const focus: FocusResult = await focusChat(config, result.chatId, parsed.text);
  if (json) {
    sendJson(res, 200, { ok: true, phone: parsed.phone, text: parsed.text, ...result, focus });
  } else {
    sendHtml(res, 200, successPage(parsed, result, focus));
  }
}

// ---------------------------------------------------------------- responses

function send(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, 'application/json; charset=utf-8', `${JSON.stringify(data, null, 2)}\n`);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  send(res, status, 'text/html; charset=utf-8', html);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; color: #1f2328; }
  h1 { font-size: 1.4rem; }
  input[type=url] { width: 100%; padding: .5rem .6rem; font-size: 1rem; box-sizing: border-box; border: 1px solid #d0d7de; border-radius: 6px; }
  button { margin-top: .5rem; padding: .5rem 1rem; font-size: 1rem; background: #1f6feb; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
  .btn { display: inline-block; margin-top: 1rem; padding: .5rem 1rem; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 6px; }
  .err { color: #b42318; background: #fef3f2; padding: .6rem .8rem; border-radius: 6px; }
  code { background: #f6f8fa; padding: .1rem .3rem; border-radius: 4px; }
  footer { margin-top: 2.5rem; font-size: .8rem; color: #57606a; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function indexPage(config: BeeperConfig): string {
  return page(
    'Beeper WhatsApp URL opener',
    `<h1>Beeper WhatsApp URL opener</h1>
    <p>Paste a WhatsApp click-to-chat link and it will open as a new chat in Beeper Desktop.</p>
    <form action="/redirect" method="get">
      <input type="url" name="url" value="https://wa.me/56944897244?text=Hi" required>
      <button type="submit">Open in Beeper</button>
    </form>
    <p>Programmatic: <code>/open?phone=NUMBER&amp;text=Hello</code></p>
    <footer>Beeper API: ${escapeHtml(config.baseUrl)} &middot; token: ${config.token === '' ? 'MISSING' : 'configured'}</footer>`,
  );
}

function successPage(parsed: ParsedWhatsAppUrl, result: ChatStartResult, focus: FocusResult): string {
  return page(
    'Opened in Beeper',
    `<h1>Opened in Beeper &check;</h1>
    <p>Chat with <strong>${escapeHtml(parsed.phone)}</strong>${
      parsed.text !== undefined ? ` &mdash; draft ready: <em>${escapeHtml(parsed.text)}</em>` : ''
    } (${escapeHtml(result.status)})</p>
    <p>Chat id: <code>${escapeHtml(result.chatId)}</code>${
      focus.success ? '' : ' &mdash; could not focus the chat'
    }</p>
    <p><a href="/">Open another link</a></p>`,
  );
}

function errorPage(status: number, message: string): string {
  return page(
    'Could not open in Beeper',
    `<h1>Could not open in Beeper (${status})</h1>
    <p class="err">${escapeHtml(message)}</p>
    <p><a href="/">Back</a></p>`,
  );
}

function withText(text: string | undefined): Pick<ParsedWhatsAppUrl, 'text'> {
  return text !== undefined && text !== '' ? { text } : {};
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

// ---------------------------------------------------------------- bootstrap

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? '127.0.0.1';
  const config: BeeperConfig = {
    baseUrl: process.env.BEEPER_BASE_URL ?? 'http://127.0.0.1:23373',
    token: process.env.BEEPER_ACCESS_TOKEN ?? '',
    whatsappAccountOverride: process.env.BEEPER_WHATSAPP_ACCOUNT,
  };

  const server = createApp();
  server.listen(port, host, () => {
    console.log(`beeper-whatsapp-url listening on http://${host}:${port}`);
    console.log(`Beeper API: ${config.baseUrl} | token: ${config.token === '' ? 'MISSING' : 'configured'}`);
    if (config.token === '') {
      console.log('Set BEEPER_ACCESS_TOKEN (Beeper Desktop -> Settings -> API) to enable opening chats.');
    }
  });
}