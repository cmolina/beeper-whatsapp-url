# beeper-whatsapp-url

Open WhatsApp click-to-chat links (`wa.me`, `api.whatsapp.com/send?phone=…&text=…`) as **new chats inside Beeper Desktop**, instead of launching the native WhatsApp app.

A tiny zero-dependency Node.js HTTP server that listens on `127.0.0.1` and forwards to Beeper Desktop's local API.

## How it works

1. You hit the server with a phone number or a WhatsApp URL (`/wa/<phone>`, `/open?phone=…`, or `/redirect?url=<encoded>`).
2. The server parses/normalizes the number.
3. It calls Beeper Desktop's local API (`POST /v1/chats/start` on `http://127.0.0.1:23373`) which opens the chat window for that contact.

Runs on Node's native TypeScript type-stripping (`--experimental-strip-types`) — no build step, no runtime dependencies.

## Requirements

- **Node.js ≥ 22.6.0** (needed for `--experimental-strip-types`)
- **Beeper Desktop ≥ v4.2.808**, running, with the **API enabled**

## Install

```bash
git clone git@github.com:cmolina/beeper-whatsapp-url.git
cd beeper-whatsapp-url
npm install        # dev deps only (runtime is zero-dependency)
```

## Configure

1. Open **Beeper Desktop → Settings → API**.
2. Enable the API and copy the **access token**.
3. Export it in the shell you'll run the server from:

```bash
export BEEPER_ACCESS_TOKEN=<your-token>
```

## Run

```bash
npm start
```

The server listens on `http://127.0.0.1:8765`. For development with auto-restart: `npm run dev`.

## Usage

| Route | Example | What it does |
|---|---|---|
| `/` | `http://127.0.0.1:8765/` | Web form — paste a WhatsApp link and open it |
| `/health` | `http://127.0.0.1:8765/health` | JSON status (token configured? Beeper URL?) |
| `/wa/<phone>` | `http://127.0.0.1:8765/wa/56944897244?text=Hola` | Open a chat by phone number |
| `/open` | `http://127.0.0.1:8765/open?phone=56944897244&text=Hola` | Same as above, query-param style |
| `/redirect` | `http://127.0.0.1:8765/redirect?url=https%3A%2F%2Fwa.me%2F56944897244` | Parse a full WhatsApp URL and open it |

Append `&json=1` (or `?json=1`) to any route to get a JSON response instead of HTML.

**Note:** `chat.whatsapp.com` group-invite links are rejected with a 400 — this tool is for one-to-one chat links only.

## Point wa.me links at this server

To make `wa.me` clicks open here instead of WhatsApp, route `wa.me` / `api.whatsapp.com` URLs to `http://127.0.0.1:8765/redirect?url=<encoded>`. How depends on your OS/browser — e.g. a browser extension that redirects specific hostnames, or an OS-level URL handler. The server just needs to be running for the links to resolve.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BEEPER_ACCESS_TOKEN` | — (required) | Beeper Desktop API token (Settings → API) |
| `BEEPER_BASE_URL` | `http://127.0.0.1:23373` | Beeper Desktop local API base URL |
| `BEEPER_WHATSAPP_ACCOUNT` | auto-detected | Override the WhatsApp `accountID` (e.g. `local-whatsapp_ba_…`) |
| `PORT` | `8765` | Server listen port |
| `HOST` | `127.0.0.1` | Server bind address |

The WhatsApp account is auto-detected from `GET /v1/accounts` (preferring on-device `local-whatsapp*` connections, cached for 60 s).

## Tests

```bash
npm test            # 24 tests (parser unit + server integration with mock Beeper)
npm run typecheck   # tsc --noEmit
```