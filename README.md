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

1. Open **Beeper Desktop → Settings → Integrations**.
2. Click the **“+”** button next to **“Approved connections”**.
3. Follow the instructions to create a token — make sure it has **read + write** permissions and **“Allow sensitive actions”** is checked (`chats/start` and `focus` require write).
4. Put it in a `.env` file in the project root (auto-loaded by `npm start`, gitignored):

```bash
BEEPER_ACCESS_TOKEN=<your-token>
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

To make `wa.me` / `api.whatsapp.com` clicks open here instead of WhatsApp, you can use the popular **Redirector** extension, the bundled unpacked extension (`extension/`), or **Finicky** (for system-wide link clicks).

> **The server must be running** for redirected links to resolve — if it isn't, the click lands on a connection error page.

### Option 1: Redirector extension (Recommended for Firefox & Chrome)

[Redirector](https://github.com/einaregilsson/Redirector) ([Firefox Add-on](https://addons.mozilla.org/en-US/firefox/addon/redirector/) / [Chrome Web Store](https://chromewebstore.google.com/detail/redirector/jegbdohdgebjljoljfeinojeobdabpjo)) is a permanent, store-signed extension that intercepts in-browser link clicks without needing temporary reloads after restarts.

1. Install **Redirector** from your browser's add-on store.
2. Click the Redirector icon in your toolbar and select **Edit Redirects** (or **Create new redirect**).
3. Click **Create new redirect** and fill in:
   - **Description**: `Beeper WhatsApp Redirect`
   - **Example URL**: `https://wa.me/56944897244?text=Hola`
   - **Include pattern**: `^(https?://(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/.*)$`
   - **Redirect to**: `http://127.0.0.1:8765/redirect?url=$1`
   - **Pattern type**: `Regular Expression`
   - **Applies to**: `Main window (address bar)` (default)
4. Click **Save**.

### Option 2: Bundled Browser Extension (`extension/`)

The repository includes a standalone Manifest V3 extension using `declarativeNetRequest`.

#### Chrome / Edge / Arc / Orion
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Enable **Developer mode** (toggle, top-right).
3. Click **Load unpacked** and select the `extension/` folder.

#### Firefox / Zen (Temporary Add-on)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `extension/manifest.json` (or `rules.json`).
3. *Note: Temporary add-ons unload when Firefox restarts — use Redirector (Option 1) for a permanent setup.*

### Option 3: Finicky (System-wide from Slack, Messages, Terminal, etc.)

[Finicky](https://github.com/johnste/finicky) (`brew install finicky`, set as macOS default browser) captures `wa.me` clicks from *external apps* (Slack, Messages, Mail, Terminal `open`), routing them to this server.

In `~/.finicky.ts` (or `~/.finicky.js`):

```typescript
export default {
  defaultBrowser: "/Applications/Firefox Developer Edition.app",
  rewrite: [
    {
      // Open WhatsApp click-to-chat links in Beeper via beeper-whatsapp-url server
      match: [
        "wa.me/*",
        "api.whatsapp.com/*",
        "web.whatsapp.com/*",
      ],
      url: ({ urlString }) =>
        `http://127.0.0.1:8765/redirect?url=${encodeURIComponent(urlString)}`,
    },
  ],
  handlers: [],
};
```

> **Tip:** Use **Redirector** for links clicked *inside* your browser, and **Finicky** for links clicked in *external desktop apps*.

### Verify

Click a link like `https://wa.me/56944897244?text=Hola` (or type it in the address bar) — it should open Beeper Desktop with that chat selected and the draft pre-filled, instead of navigating to WhatsApp.

The redirect target is passed raw (regex substitution cannot percent-encode), so `api.whatsapp.com/send?phone=…&text=…` arrives with its `&` intact — the `/redirect` handler reconstructs the full URL from the raw query string.

### Notes

- **Safari** is not supported: Safari Web Extensions lack reliable DNR redirect support (and this project ships without Xcode tooling).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BEEPER_ACCESS_TOKEN` | — (required, from `.env`) | Beeper Desktop API token (Settings → Integrations → “+” → Approved connections) |
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