import { getWatch, putWatch, allWatches } from "@/lib/store";
import { sendTelegram } from "@/lib/telegram";

/**
 * Telegram webhook. Handles:
 *   /start <watchId>  link this chat to a watch
 *   /stop             stop all alerts to this chat
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return new Response("forbidden", { status: 403 });
  const upd = (await req.json().catch(() => null)) as
    | { message?: { chat: { id: number }; text?: string } }
    | null;
  const msg = upd?.message;
  if (!msg?.text) return Response.json({ ok: true });
  const chatId = msg.chat.id;
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
  if (cmd === "/start" && arg) {
    const w = await getWatch(arg);
    if (!w) {
      await sendTelegram(chatId, "That watch link has expired or was deleted. Set it up again at the JagaBanjir website.");
    } else {
      w.chatId = chatId;
      await putWatch(w);
      await sendTelegram(
        chatId,
        `You'll get a message here when the river near "${w.label}" changes level.\nAnda akan menerima mesej di sini apabila paras sungai berhampiran "${w.label}" berubah.\n\nSend /stop to stop.`,
      );
    }
  } else if (cmd === "/stop") {
    for (const w of await allWatches())
      if (w.chatId === chatId) {
        delete w.chatId;
        await putWatch(w);
      }
    await sendTelegram(chatId, "Alerts stopped. / Amaran dihentikan.");
  } else if (cmd === "/start") {
    await sendTelegram(chatId, "Open your watch page on the JagaBanjir website and tap “Get alerts on Telegram”.");
  }
  return Response.json({ ok: true });
}

/** One-off: point Telegram at this webhook. Protected by the webhook secret. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !token || u.searchParams.get("setup") !== secret)
    return Response.json({ error: "Not configured." }, { status: 403 });
  const hook = `${u.protocol}//${req.headers.get("x-forwarded-host") ?? u.host}/api/telegram`;
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: hook, secret_token: secret, allowed_updates: ["message"] }),
  });
  return Response.json({ hook, telegram: await r.json() });
}
