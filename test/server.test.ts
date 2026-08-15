import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/server.ts';

interface StartRequest {
  accountID: string;
  user: { phoneNumber: string };
  messageText?: string;
}

interface JsonResponse {
  ok: boolean;
  error?: string;
  phone?: string;
  text?: string;
  chatId?: string;
  status?: string;
}

let beeper: Server;
let beeperUrl: string;
let app: Server;
let appUrl: string;
const startRequests: StartRequest[] = [];
let accountCalls = 0;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function getJson(url: string): Promise<{ status: number; body: JsonResponse }> {
  const res = await fetch(url);
  return { status: res.status, body: (await res.json()) as JsonResponse };
}

before(async () => {
  beeper = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/accounts') {
      accountCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          { accountID: 'telegram', network: 'Telegram' },
          { accountID: 'local-whatsapp_ba_abc', network: 'WhatsApp' },
          { accountID: 'whatsapp', network: 'WhatsApp' },
        ]),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chats/start') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        startRequests.push(JSON.parse(body) as StartRequest);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: '!room:beeper.local', localChatID: '42', status: 'created' }));
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not found"}');
  });
  beeperUrl = await listen(beeper);

  app = createApp({ BEEPER_BASE_URL: beeperUrl, BEEPER_ACCESS_TOKEN: 'test-token' });
  appUrl = await listen(app);
});

after(async () => {
  await closeServer(app);
  await closeServer(beeper);
});

test('health reports ok and configured token', async () => {
  const { status, body } = await getJson(`${appUrl}/health`);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, undefined);
});

test('index page renders', async () => {
  const res = await fetch(`${appUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const html = await res.text();
  assert.match(html, /Open in Beeper/);
});

test('open chat by phone number with pre-filled text', async () => {
  const { status, body } = await getJson(`${appUrl}/open?phone=56944897244&text=Hi&json=1`);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.phone, '+56944897244');
  assert.equal(body.text, 'Hi');
  assert.equal(body.chatId, '!room:beeper.local');
  assert.equal(body.status, 'created');
  assert.deepEqual(startRequests.at(-1), {
    accountID: 'local-whatsapp_ba_abc', // on-device connection preferred
    user: { phoneNumber: '+56944897244' },
    messageText: 'Hi',
  });
});

test('short /wa/<number> route', async () => {
  const { status, body } = await getJson(`${appUrl}/wa/56944897244?text=Hello&json=1`);
  assert.equal(status, 200);
  assert.equal(body.phone, '+56944897244');
  assert.equal(body.text, 'Hello');
});

test('redirect parses a wa.me link end to end', async () => {
  const target = encodeURIComponent('https://wa.me/56944897244?text=Hola');
  const { status, body } = await getJson(`${appUrl}/redirect?url=${target}&json=1`);
  assert.equal(status, 200);
  assert.equal(body.phone, '+56944897244');
  assert.equal(body.text, 'Hola');
});

test('redirect parses an api.whatsapp.com link', async () => {
  const target = encodeURIComponent('https://api.whatsapp.com/send?phone=%2B56944897244&text=Hey');
  const { status, body } = await getJson(`${appUrl}/redirect?url=${target}&json=1`);
  assert.equal(status, 200);
  assert.equal(body.phone, '+56944897244');
  assert.equal(body.text, 'Hey');
});

test('chat.whatsapp.com group link returns 400', async () => {
  const target = encodeURIComponent('https://chat.whatsapp.com/abc123');
  const { status, body } = await getJson(`${appUrl}/redirect?url=${target}&json=1`);
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

test('unparseable redirect target returns 400', async () => {
  const target = encodeURIComponent('https://example.com/nope');
  const { status, body } = await getJson(`${appUrl}/redirect?url=${target}&json=1`);
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

test('account lookup is cached between calls', async () => {
  const before = accountCalls;
  await getJson(`${appUrl}/open?phone=56944897244&json=1`);
  assert.equal(accountCalls, before);
});

test('missing token is rejected with a helpful error', async () => {
  const noToken = createApp({ BEEPER_BASE_URL: beeperUrl, BEEPER_ACCESS_TOKEN: '' });
  const url = await listen(noToken);
  try {
    const { status, body } = await getJson(`${url}/open?phone=56944897244&json=1`);
    assert.equal(status, 500);
    assert.match(body.error ?? '', /BEEPER_ACCESS_TOKEN/);
  } finally {
    await closeServer(noToken);
  }
});

test('unreachable Beeper API surfaces a clear error', async () => {
  const broken = createApp({ BEEPER_BASE_URL: 'http://127.0.0.1:1', BEEPER_ACCESS_TOKEN: 'x' });
  const url = await listen(broken);
  try {
    const { status, body } = await getJson(`${url}/open?phone=56944897244&json=1`);
    assert.equal(status, 500);
    assert.match(body.error ?? '', /unreachable/);
  } finally {
    await closeServer(broken);
  }
});

test('unknown path returns 404', async () => {
  const { status, body } = await getJson(`${appUrl}/nope?json=1`);
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});