/**
 * Minimal client for the Beeper Desktop local API.
 *
 * Requires Beeper Desktop >= v4.2.808 running with the API enabled
 * (Settings -> Integrations -> Approved connections). Default endpoint:
 * http://127.0.0.1:23373
 */

import type { ParsedWhatsAppUrl } from './whatsapp-url.ts';

export interface BeeperConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly whatsappAccountOverride?: string;
  /** Max attempts for /v1/chats/start when Beeper returns USER_NOT_FOUND. Default 3. */
  readonly startChatMaxAttempts?: number;
  /** Delay between USER_NOT_FOUND retries, in ms. Default 1500. */
  readonly startChatRetryDelayMs?: number;
}

/** Thrown when the Beeper API responds with a non-2xx status. */
export class BeeperApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'BeeperApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ChatStartResult {
  readonly chatId: string;
  readonly status: string;
}

export interface FocusResult {
  readonly success: boolean;
}

/** POST /v1/focus — bring Beeper to front, select the chat, pre-fill the draft. */
export async function focusChat(
  config: BeeperConfig,
  chatId: string,
  draftText?: string,
): Promise<FocusResult> {
  const body: Record<string, unknown> = { chatID: chatId };
  if (draftText !== undefined) {
    body.draftText = draftText;
  }
  const resp = await apiRequest<{ success?: boolean }>(config, '/v1/focus', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { success: resp.success ?? false };
}

interface Account {
  readonly accountID: string;
  readonly network: string;
}

const ACCOUNT_CACHE_TTL_MS = 60_000;
let cachedAccount: { id: string; at: number } | undefined;

/** POST /v1/chats/start — resolve a contact and open/create the direct chat. */
export async function startWhatsAppChat(
  config: BeeperConfig,
  parsed: ParsedWhatsAppUrl,
): Promise<ChatStartResult> {
  const accountId = await resolveWhatsAppAccountId(config);
  const body: Record<string, unknown> = {
    accountID: accountId,
    user: { phoneNumber: parsed.phone },
  };
  if (parsed.text !== undefined) {
    body.messageText = parsed.text;
  }

  const maxAttempts = config.startChatMaxAttempts ?? 3;
  const retryDelayMs = config.startChatRetryDelayMs ?? 1_500;
  const request: RequestInit = { method: 'POST', body: JSON.stringify(body) };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await apiRequest<{ id?: string; chatID?: string; status?: string }>(
        config,
        '/v1/chats/start',
        request,
      );
      return {
        chatId: resp.id ?? resp.chatID ?? '',
        status: resp.status ?? '',
      };
    } catch (err) {
      if (attempt < maxAttempts && isUserNotFound(err)) {
        console.warn(
          `chats/start returned USER_NOT_FOUND for ${parsed.phone}; retrying in ${retryDelayMs}ms (attempt ${attempt}/${maxAttempts})`,
        );
        await delay(retryDelayMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('chats/start failed');
}

function isUserNotFound(err: unknown): boolean {
  return err instanceof BeeperApiError && err.code === 'USER_NOT_FOUND';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Find the accountID of the user's WhatsApp account, preferring on-device connections. */
export async function resolveWhatsAppAccountId(config: BeeperConfig): Promise<string> {
  if (config.whatsappAccountOverride !== undefined && config.whatsappAccountOverride !== '') {
    return config.whatsappAccountOverride;
  }
  if (cachedAccount !== undefined && Date.now() - cachedAccount.at < ACCOUNT_CACHE_TTL_MS) {
    return cachedAccount.id;
  }

  const accounts = await apiRequest<Account[]>(config, '/v1/accounts');

  const candidates = accounts.filter(
    (a) =>
      a.network.toLowerCase() === 'whatsapp' ||
      a.accountID.toLowerCase() === 'whatsapp' ||
      a.accountID.toLowerCase().startsWith('local-whatsapp'),
  );
  if (candidates.length === 0) {
    throw new Error('No WhatsApp account found in Beeper. Connect WhatsApp in Beeper Desktop first.');
  }

  const local = candidates.find((a) => a.accountID.toLowerCase().startsWith('local-whatsapp'));
  const chosen: Account | undefined = local ?? candidates[0];
  if (chosen === undefined) {
    throw new Error('No WhatsApp account found in Beeper. Connect WhatsApp in Beeper Desktop first.');
  }

  cachedAccount = { id: chosen.accountID, at: Date.now() };
  return chosen.accountID;
}

async function apiRequest<T>(config: BeeperConfig, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Beeper Desktop API unreachable at ${config.baseUrl} — is Beeper Desktop running with the API enabled? (${reason})`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let code: string | undefined;
    try {
      code = (JSON.parse(body) as { code?: string }).code;
    } catch {
      // non-JSON error body
    }
    const method = init?.method ?? 'GET';
    throw new BeeperApiError(
      res.status,
      code,
      `Beeper API ${method} ${path} failed: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
    );
  }

  return (await res.json()) as T;
}