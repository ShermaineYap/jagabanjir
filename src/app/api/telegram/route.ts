import { getWatch, putWatch, allWatches } from "@/lib/store";
import { originOf } from "@/lib/server";
import { sendTelegram, setWebhook, webhookSecret } from "@/lib/telegram";

/**
 * Telegram webhook. Handles:
 *   /start <watchId>  link this chat to a watch
 *   /stop             stop all alerts to this chat
 */
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret)
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

/** Point the bot at this site. Safe to call any time; the tick also calls it once per deploy. */
export async function GET(req: Request) {
  const r = await setWebhook(originOf(req));
  return Response.json({ ok: r.ok, description: r.description ?? null }, { status: r.ok ? 200 : 400 });
}
