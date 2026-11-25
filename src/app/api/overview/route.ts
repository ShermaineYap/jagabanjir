import { rank } from "@/lib/assess";
import { freshSnapshot, jpsHistory, originOf, statusesFor } from "@/lib/server";
import type { StationStatus, Trust } from "@/lib/types";

export const maxDuration = 60;

const trusted = (s: StationStatus) => s.trust.trust === "live" || s.trust.trust === "delayed";

/** National picture: census counts, worst trusted rivers right now, and alarms you should not trust. */
export async function GET(req: Request) {
  try {
    const snap = await freshSnapshot(originOf(req));
    const all = await statusesFor(snap, null);
    const counts: Record<Trust, number> = { live: 0, delayed: 0, stale: 0, broken: 0, suspect: 0 };
    for (const s of all) counts[s.trust.trust]++;
    const raised = all
      .filter((s) => trusted(s) && s.level && s.level !== "NORMAL")
      .sort((a, b) => rank(b.level!) - rank(a.level!) || (a.toDanger ?? 99) - (b.toDanger ?? 99));
    const falseAlarms = all.filter(
      (s) => !trusted(s) && s.station.jps && ["ALERT", "WARNING", "DANGER"].includes(s.station.jps),
    );
    const byState: Record<string, { total: number; trusted: number; raised: number }> = {};
    for (const s of all) {
      const b = (byState[s.station.state] ??= { total: 0, trusted: 0, raised: 0 });
      b.total++;
      if (trusted(s)) b.trusted++;
      if (trusted(s) && s.level && s.level !== "NORMAL") b.raised++;
    }
    const featured = raised.find((s) => s.station.thr?.danger != null) ?? raised[0] ?? null;
    const fh = featured ? await jpsHistory(featured.station.id) : null;
    const dayAgo = Date.now() - 24 * 3600_000;
    return Response.json({
      fetchedAt: snap.fetchedAt,
      total: all.length,
      counts,
      raised: raised.slice(0, 40),
      raisedCount: raised.length,
      falseAlarms: falseAlarms.slice(0, 60),
      falseAlarmCount: falseAlarms.length,
      byState,
      featured,
      featuredHistory: fh ? fh.points.filter(([t]) => Date.parse(t) >= dayAgo) : [],
    });
  } catch (e) {
    return Response.json({ error: `Could not reach the JPS river feed: ${String(e)}` }, { status: 502 });
  }
}
