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

  const resp = await apiRequest<{ id?: string; chatID?: string; status?: string }>(
    config,
    '/v1/chats/start',
    { method: 'POST', body: JSON.stringify(body) },
  );

  return {
    chatId: resp.id ?? resp.chatID ?? '',
    status: resp.status ?? '',
  };
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
    const method = init?.method ?? 'GET';
    throw new Error(`Beeper API ${method} ${path} failed: HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}