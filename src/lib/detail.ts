import { assessStation } from "./assess";
import { fetchHistory, type JpsHistory } from "./jps";
import { getJSON, historyFor, loadTicks, setJSON } from "./store";
import type { Station, StationStatus } from "./types";

/** JPS 7-day history, cached for 10 minutes. Returns null if JPS does not answer. */
export async function jpsHistory(id: string): Promise<JpsHistory | null> {
  const key = `jh:${id}`;
  const hit = await getJSON<JpsHistory>(key);
  if (hit) return hit;
  try {
    const h = await fetchHistory(id);
    await setJSON(key, h, 600);
    return h;
  } catch (e) {
    console.error("history failed", id, e);
    return null;
  }
}

/**
 * Full assessment for a handful of stations (a watch): uses JPS's own 7-day record for the
 * rate of rise and the jump check, and borrows its thresholds where the state tables have none.
 * Falls back to our own 15-minute log when JPS history is unavailable.
 */
export async function detailedStatuses(stations: Station[], now = new Date()) {
  const ticks = await loadTicks(now.getTime() - 26 * 3600_000);
  const out: { status: StationStatus; history: [string, number][] }[] = [];
  await Promise.all(
    stations.map(async (s, i) => {
      const h = await jpsHistory(s.id);
      let pts = h?.points ?? [];
      // make sure the live reading is the last point
      if (s.level !== null && s.updated && (pts.length === 0 || Date.parse(pts[pts.length - 1][0]) < Date.parse(s.updated)))
        pts = [...pts, [s.updated, s.level]];
      if (pts.length < 2) pts = historyFor(ticks, s.id);
      const st: Station = s.thr || !h?.thr ? s : { ...s, thr: h.thr };
      const day = pts.filter(([t]) => now.getTime() - Date.parse(t) <= 24 * 3600_000);
      out[i] = { status: assessStation(st, now, pts), history: day };
    }),
  );
  return out;
}

