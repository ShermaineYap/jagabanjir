import { createHash } from "node:crypto";

/** The only setting needed: TELEGRAM_BOT_TOKEN, from @BotFather. */
const token = () => process.env.TELEGRAM_BOT_TOKEN;
export const telegramEnabled = () => Boolean(token());

/** Secret Telegram sends back on every webhook call; derived from the token so there is nothing else to set. */
export function webhookSecret(): string | null {
  const t = token();
  return t ? createHash("sha256").update(`jagabanjir-webhook:${t}`).digest("hex").slice(0, 48) : null;
}

const g = globalThis as unknown as { __jbbot?: string };

/** The bot's @username, asked from Telegram once per server instance. */
export async function botUsername(): Promise<string | null> {
  const t = token();
  if (!t) return null;
  if (g.__jbbot) return g.__jbbot;
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/getMe`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
    if (j.ok && j.result?.username) g.__jbbot = j.result.username;
  } catch {
    return null;
  }
  return g.__jbbot ?? null;
}

async function call(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: unknown };
}

export async function sendTelegram(chatId: number, text: string, buttonUrl?: string, buttonText?: string) {
  if (!token()) return { ok: false, skipped: true };
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (buttonUrl) body.reply_markup = { inline_keyboard: [[{ text: buttonText ?? "Open", url: buttonUrl }]] };
  return call("sendMessage", body);
}

/** Point the bot at this site's webhook. Harmless to repeat: it can only point the bot here. */
export async function setWebhook(origin: string) {
  if (!token()) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  return call("setWebhook", {
    url: `${origin}/api/telegram`,
    secret_token: webhookSecret(),
    allowed_updates: ["message"],
  });
}
