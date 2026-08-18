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
| `/wa/<phone>` | `http://127.0.0.1:8765/wa/5491163544698?text=Hola+mundo%21` | Open a chat by phone number |
| `/open` | `http://127.0.0.1:8765/open?phone=5491163544698&text=Hola+mundo%21` | Same as above, query-param style |
| `/redirect` | `http://127.0.0.1:8765/redirect?url=https%3A%2F%2Fwa.me%2F5491163544698` | Parse a full WhatsApp URL and open it |

Append `&json=1` (or `?json=1`) to any route to get a JSON response instead of HTML.

**Note:** `chat.whatsapp.com` group-invite links are rejected with a 400 — this tool is for one-to-one chat links only.

## Point wa.me links at this server

To ensure WhatsApp links open in Beeper regardless of where they are clicked, **both** in-browser and system-wide redirect rules are needed:

1. **In-Browser Redirect (Redirector):** Browsers handle links clicked on web pages internally without asking macOS. A browser extension intercepts navigation inside your browser tabs.
2. **System-Wide Redirect (Finicky):** External applications (Slack, Messages, Mail, Terminal `open`) ask macOS to open URLs with the default browser. An OS-level URL handler intercepts links opened from other apps.

> **The server must be running** for redirected links to resolve — if it isn't, the click lands on a connection error page.

### 1. In-Browser: Redirector extension

Install [Redirector](https://github.com/einaregilsson/Redirector) ([Firefox Add-on](https://addons.mozilla.org/en-US/firefox/addon/redirector/) / [Chrome Web Store](https://chromewebstore.google.com/detail/redirector/jegbdohdgebjljoljfeinojeobdabpjo)):

1. Click the **Redirector** toolbar icon and select **Edit Redirects** (or **Create new redirect**).
2. Create a redirect rule with:
   - **Description**: `Beeper WhatsApp Redirect`
   - **Example URL**: `https://wa.me/5491163544698?text=Hola%20mundo!`
   - **Include pattern**: `^(https?://(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/.*)$`
   - **Redirect to**: `http://127.0.0.1:8765/redirect?url=$1`
   - **Pattern type**: `Regular Expression`
   - **Applies to**: `Main window (address bar)` (default)
3. Click **Save**.

### 2. System-Wide: Finicky

Install [Finicky](https://github.com/johnste/finicky) (`brew install finicky`) and set it as your macOS default browser.

Add the rewrite rule to `~/.finicky.ts` (or `~/.finicky.js`):

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

### Verify

Click a link like `https://wa.me/5491163544698?text=Hola%20mundo!` (or open it from Terminal with `open "https://wa.me/5491163544698?text=Hola%20mundo!"`) — it should open Beeper Desktop with that chat selected and the draft pre-filled, instead of navigating to WhatsApp.

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
npm test            # 32 tests (parser unit + server integration with mock Beeper)
npm run typecheck   # tsc --noEmit
```