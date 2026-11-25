import { assessStation } from "./assess";
import { getSnapshot, historyFor, loadTicks } from "./store";
import { runTick } from "./tick";
import type { Snapshot, StationStatus } from "./types";
export { detailedStatuses, jpsHistory } from "./detail";

const FRESH_MIN = 16;

/** Latest snapshot; refreshes it first if it is older than one tick. Never throws if we have old data. */
export async function freshSnapshot(origin = ""): Promise<Snapshot> {
  const snap = await getSnapshot();
  if (snap && Date.now() - Date.parse(snap.fetchedAt) < FRESH_MIN * 60_000) return snap;
  try {
    await runTick(new Date(), origin);
  } catch (e) {
    if (!snap) throw e;
    console.error("refresh failed, serving previous snapshot", e);
  }
  return (await getSnapshot()) ?? snap!;
}

/** Quick assessment for many stations: only the last hour of our own log (for the jump check). */
export async function statusesFor(snap: Snapshot, ids: string[] | null, now = new Date()): Promise<StationStatus[]> {
  const ticks = await loadTicks(now.getTime() - 65 * 60_000);
  const pool = ids ? snap.stations.filter((s) => ids.includes(s.id)) : snap.stations;
  return pool.map((s) => assessStation(s, now, historyFor(ticks, s.id)));
}

export function originOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
