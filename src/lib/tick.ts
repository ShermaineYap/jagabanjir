import { assessHouse, assessStation, shouldNotify } from "./assess";
import { fetchSnapshot } from "./jps";
import { compose, verify } from "./messages";
import {
  allWatches,
  getSnapshot,
  historyFor,
  loadTicks,
  putWatch,
  releaseLock,
  saveTick,
  setJSON,
  tryLock,
  type TickBlob,
} from "./store";
import { sendTelegram } from "./telegram";
import type { Snapshot, Watch } from "./types";

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
export async function runTick(now = new Date(), origin = ""): Promise<TickResult> {
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
  const ticks = await loadTicks(now.getTime() - 3 * 3600_000);
  const byId = new Map(snap.stations.map((s) => [s.id, s]));
  let notified = 0;
  let blocked = 0;
  for (const w of watches) {
    const res = evaluateWatch(w, byId, ticks, now);
    const next = res.house.level;
    const held = next === w.pending?.level ? (w.pending.ticks ?? 0) + 1 : 1;
    const send = shouldNotify(w.last?.level, next, held);
    const updated: Watch = { ...w, pending: { level: next, ticks: held } };
    if (send) {
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

export function evaluateWatch(
  w: Watch,
  byId: Map<string, Snapshot["stations"][number]>,
  ticks: TickBlob[],
  now: Date,
) {
  const statuses = w.stationIds
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => assessStation(s, now, historyFor(ticks, s.id)));
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
