import { deleteWatch, getWatch, putWatch } from "@/lib/store";
import { freshSnapshot, originOf } from "@/lib/server";
import { evaluateWatch } from "@/lib/tick";
import { botUsername, telegramEnabled } from "@/lib/telegram";
import type { Lang } from "@/lib/types";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const w = await getWatch(id);
  if (!w) return Response.json({ error: "This watch link does not exist or was deleted." }, { status: 404 });
  try {
    const snap = await freshSnapshot(originOf(req));
    const now = new Date();
    const byId = new Map(snap.stations.map((s) => [s.id, s]));
    const ev = await evaluateWatch(w, byId, now);
    const history = ev.history;
    return Response.json({
      watch: { id: w.id, label: w.label, lat: w.lat, lon: w.lon, lang: w.lang, telegram: Boolean(w.chatId) },
      fetchedAt: snap.fetchedAt,
      house: ev.house,
      message: ev.message,
      checked: ev.problems.length === 0,
      history,
      telegram: telegramEnabled() ? await botUsername().then((bot) => (bot ? { bot } : null)) : null,
    });
  } catch (e) {
    return Response.json({ error: `Could not reach the JPS river feed: ${String(e)}` }, { status: 502 });
  }
}

/** Change the language or name. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const w = await getWatch(id);
  if (!w) return Response.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { lang?: Lang; label?: string };
  if (b.lang && ["ms", "zh", "ta", "en"].includes(b.lang)) w.lang = b.lang;
  if (b.label && b.label.trim()) w.label = b.label.trim().slice(0, 40);
  await putWatch(w);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteWatch(id);
  return Response.json({ ok: true });
}
