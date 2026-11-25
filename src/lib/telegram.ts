const token = () => process.env.TELEGRAM_BOT_TOKEN;
export const botUsername = () => process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? "";
export const telegramEnabled = () => Boolean(token());

export async function sendTelegram(chatId: number, text: string, buttonUrl?: string, buttonText?: string) {
  const t = token();
  if (!t) return { ok: false, skipped: true };
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (buttonUrl)
    body.reply_markup = { inline_keyboard: [[{ text: buttonText ?? "Open", url: buttonUrl }]] };
  const res = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as { ok: boolean };
}
