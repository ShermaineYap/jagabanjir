import { randomBytes } from "node:crypto";
import { putWatch } from "@/lib/store";
import type { Lang, Watch } from "@/lib/types";

const LANGS: Lang[] = ["ms", "zh", "ta", "en"];

export async function POST(req: Request) {
  let b: Partial<Watch>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  const label = String(b.label ?? "").trim().slice(0, 40);
  const ids = Array.isArray(b.stationIds) ? b.stationIds.map(String).slice(0, 3) : [];
  if (!label) return Response.json({ error: "Give the house a name, like “Rumah Mak”." }, { status: 400 });
  if (ids.length === 0) return Response.json({ error: "Choose at least one river station." }, { status: 400 });
  if (!LANGS.includes(b.lang as Lang)) return Response.json({ error: "Choose a language." }, { status: 400 });
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon))
    return Response.json({ error: "Drop a pin on the house." }, { status: 400 });
  const w: Watch = {
    id: randomBytes(8).toString("base64url"),
    createdAt: new Date().toISOString(),
    label,
    // stored to ~100 m: enough to show the map, not a front door
    lat: Math.round(b.lat! * 1000) / 1000,
    lon: Math.round(b.lon! * 1000) / 1000,
    stationIds: ids,
    lang: b.lang as Lang,
  };
  await putWatch(w);
  return Response.json({ id: w.id });
}
