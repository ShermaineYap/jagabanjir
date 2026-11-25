import { nearest } from "@/lib/geo";
import { freshSnapshot, originOf, statusesFor } from "@/lib/server";

export const maxDuration = 60;

/** Stations near a point, each with its trust label and level. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 0 || lat > 8 || lon < 99 || lon > 120)
    return Response.json({ error: "Pick a place in Malaysia." }, { status: 400 });
  try {
    const snap = await freshSnapshot(originOf(req));
    const near = nearest(snap.stations, lat, lon, 8, 30);
    const statuses = await statusesFor(snap, near.map((n) => n.station.id));
    const byId = new Map(statuses.map((s) => [s.station.id, s]));
    return Response.json({
      fetchedAt: snap.fetchedAt,
      stations: near.map((n) => ({ km: n.km, ...byId.get(n.station.id)! })),
    });
  } catch (e) {
    return Response.json({ error: `Could not reach the JPS river feed: ${String(e)}` }, { status: 502 });
  }
}
