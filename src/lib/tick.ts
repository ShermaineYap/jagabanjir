import { assessHouse, decideNotify } from "./assess";
import { detailedStatuses } from "./detail";
import { fetchSnapshot } from "./jps";
import { compose, verify } from "./messages";
import {
  allWatches,
  getSnapshot,
  putWatch,
  releaseLock,
  saveTick,
  setJSON,
  tryLock,
  type TickBlob,
} from "./store";
import { sendTelegram, setWebhook, telegramEnabled } from "./telegram";
import type { Snapshot, StationStatus, Watch } from "./types";

export const MIN_TICK_GAP_MIN = 10;

function tickKey(d: Date) {
  const m = new Date(d.getTime() + 8 * 3600_000).toISOString(); // MYT
  return `tick:${m.slice(0, 4)}${m.slice(5, 7)}${m.slice(8, 10)}${m.slice(11, 13)}${m.slice(14, 16)}`;
}

export interface TickResult {
  ran: boolean;
  reason?: string;
  stations?: number;
  watches?: number;
  notified?: number;
  blocked?: number;
}

/**
 * Fetch the JPS feed, store it, and notify watches whose level changed.
 * Safe to call from anywhere: a lock stops it running more than once per 10 minutes.
 */
const gw = globalThis as unknown as { __jbhook?: boolean };

export async function runTick(now = new Date(), origin = ""): Promise<TickResult> {
  if (!gw.__jbhook && telegramEnabled() && origin.startsWith("https://")) {
    gw.__jbhook = true;
    setWebhook(origin).catch(() => (gw.__jbhook = false));
  }
  const prev = await getSnapshot();
  if (prev && now.getTime() - Date.parse(prev.fetchedAt) < MIN_TICK_GAP_MIN * 60_000)
    return { ran: false, reason: "recent" };
  if (!(await tryLock("lock:tick", MIN_TICK_GAP_MIN * 60))) return { ran: false, reason: "locked" };
  try {
    const snap = await fetchSnapshot();
    await setJSON("snap:latest", snap);
    const blob: TickBlob = { t: snap.fetchedAt, l: {} };
    for (const s of snap.stations) if (s.level !== null && s.updated) blob.l[s.id] = [s.updated, s.level];
    await saveTick(tickKey(now), blob);
    const r = await notifyWatches(snap, now, origin);
    return { ran: true, stations: snap.stations.length, ...r };
  } catch (e) {
    await releaseLock("lock:tick");
    throw e;
  }
}

async function notifyWatches(snap: Snapshot, now: Date, origin: string) {
  const watches = await allWatches();
  if (watches.length === 0) return { watches: 0, notified: 0, blocked: 0 };
  const byId = new Map(snap.stations.map((s) => [s.id, s]));
  let notified = 0;
  let blocked = 0;
  for (const w of watches) {
    const res = await evaluateWatch(w, byId, now);
    const next = res.house.level;
    const d = decideNotify(w.notify ?? {}, next, now.getTime(), res.house.routine);
    const updated: Watch = { ...w, notify: d.state };
    if (d.send) {
      if (res.problems.length > 0) {
        blocked++; // number check failed: never send a message we cannot stand behind
      } else if (w.chatId) {
        await sendTelegram(w.chatId, res.message, origin ? `${origin}/w/${w.id}` : undefined, "Open / Buka");
        notified++;
      }
      updated.last = { level: next, at: now.toISOString() };
    } else if (!w.last) {
      updated.last = { level: next, at: now.toISOString() };
    }
    await putWatch(updated);
  }
  return { watches: watches.length, notified, blocked };
}

export async function evaluateWatch(w: Watch, byId: Map<string, Snapshot["stations"][number]>, now: Date) {
  const stations = w.stationIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const detailed = await detailedStatuses(stations, now);
  return { ...composeFor(w, detailed.map((d) => d.status)), history: Object.fromEntries(detailed.map((d) => [d.status.station.id, d.history])) };
}

/** Pure: house level and checked message from already-assessed stations. */
export function composeFor(w: Watch, statuses: StationStatus[]) {
  const house = assessHouse(statuses);
  const deciding = statuses.find((s) => s.station.id === house.decidingId) ?? statuses[0];
  const input = {
    label: w.label,
    station: deciding?.station.name ?? "—",
    level: deciding?.station.level ?? null,
    danger: deciding?.station.thr?.danger ?? null,
    at: deciding?.station.updated ?? null,
  };
  const message = compose(w.lang, house.level, input);
  return { house, statuses, message, problems: verify(message, input) };
}
