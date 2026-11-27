import type { Level, Snapshot, Station, Thresholds, Trend } from "./types";
import thresholdsJson from "../data/thresholds.json";
import thresholdsById from "../data/thresholds-by-id.json";
import zeroThresholds from "../data/zero-thresholds.json";

export const JPS_FEED =
  "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/latestreadingstrendabc.json";

const THRESHOLDS = thresholdsJson as Record<string, Thresholds & { jps_id: string | null }>;
/** From each gauge's own JPS 7-day record; fills gaps in the state tables. */
const THRESHOLDS_BY_ID = thresholdsById as Record<string, Thresholds>;
const ZERO_THRESHOLDS = new Set(zeroThresholds as string[]);

/** Raw record from the JPS map feed. Keys are short; only the ones we verified are typed. */
export interface RawRecord {
  a: string; // station id
  b: string; // name
  c: string; // latitude
  d: string; // longitude
  e: string; // district
  f: string; // state
  g: string; // sub-basin / river
  h: string; // main basin
  i: string; // station type: RF, WL, RF,WL
  m: string; // water level (m), -9999 when missing
  n: string; // JPS level label: Normal, Alert, Warning, Danger, Error, ""
  q: string; // water level time, dd/mm/yyyy HH:MM (Malaysia time)
  s: string; // trend: Rising, Receding, No Change
  x: string; // rainfall label
  [k: string]: string;
}

export function thresholdKey(state: string, district: string, name: string): string {
  return [state, district, name].map((x) => x.toLowerCase().split(/\s+/).filter(Boolean).join(" ")).join("|");
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  if (t === "" || t === "-") return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v <= -9999) return null;
  return v;
}

/** "25/11/2026 19:45" (Malaysia time) -> "2026-11-25T19:45:00+08:00" */
export function parseJpsTime(s: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+08:00`;
}

function trend(s: string): Trend | null {
  if (s === "Rising") return "rising";
  if (s === "Receding") return "falling";
  if (s === "No Change") return "steady";
  return null;
}

function jpsLevel(s: string): Level | "ERROR" | null {
  const u = s.trim().toUpperCase();
  if (u === "NORMAL" || u === "ALERT" || u === "WARNING" || u === "DANGER" || u === "ERROR") return u;
  return null;
}

export function normalise(raw: RawRecord[]): Station[] {
  const out: Station[] = [];
  for (const r of raw) {
    if (!r.i || !r.i.includes("WL")) continue;
    const lat = num(r.c);
    const lon = num(r.d);
    const t = THRESHOLDS[thresholdKey(r.f, r.e, r.b)] ?? THRESHOLDS_BY_ID[r.a];
    out.push({
      id: r.a,
      name: r.b.trim(),
      district: r.e.trim(),
      state: r.f.trim(),
      basin: (r.h ?? "").trim(),
      river: (r.g ?? "").trim(),
      lat: lat !== null && lat !== 0 ? lat : null,
      lon: lon !== null && lon !== 0 ? lon : null,
      level: num(r.m),
      updated: parseJpsTime(r.q),
      trend: trend(r.s ?? ""),
      jps: jpsLevel(r.n ?? ""),
      thr: t ? { normal: t.normal, alert: t.alert, warning: t.warning, danger: t.danger } : null,
      rain: r.x?.trim() || null,
      ...(ZERO_THRESHOLDS.has(r.a) ? { zeroThr: true } : {}),
    });
  }
  return out;
}

const HISTORY_URL =
  "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/query/getwaterlevellast7dayslead.php?extra=0&station=";

export interface JpsHistory {
  thr: Thresholds | null;
  /** [ISO time, level] at 15-minute steps, oldest first */
  points: [string, number][];
}

/** JPS's own 7-day record for one station (5-minute data, thinned to 15 minutes). */
export function parseHistory(j: {
  info?: Record<string, string>;
  values?: { dt: string; final: string }[];
}): JpsHistory {
  const info = j.info ?? {};
  const thr: Thresholds = {
    normal: num(info.normal),
    alert: num(info.alert),
    warning: num(info.warning),
    danger: num(info.danger),
  };
  const points: [string, number][] = [];
  for (const r of j.values ?? []) {
    const v = num(r.final);
    const t = parseJpsTime(r.dt);
    if (v === null || !t || !/:(00|15|30|45)$/.test(r.dt)) continue;
    points.push([t, v]);
  }
  const hasThr =
    thr.alert !== null && thr.warning !== null && thr.danger !== null && thr.danger > 0 && thr.alert < thr.danger;
  return { thr: hasThr ? thr : null, points };
}

export async function fetchHistory(id: string): Promise<JpsHistory> {
  const res = await fetch(HISTORY_URL + encodeURIComponent(id), {
    headers: { "User-Agent": "JagaBanjir/0.1 (student non-commercial project)" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`JPS history HTTP ${res.status}`);
  return parseHistory(await res.json());
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch(JPS_FEED, {
    headers: { "User-Agent": "JagaBanjir/0.1 (student non-commercial project)" },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`JPS feed HTTP ${res.status}`);
  const raw = (await res.json()) as RawRecord[];
  return {
    fetchedAt: new Date().toISOString(),
    source: "JPS Public InfoBanjir",
    stations: normalise(raw),
  };
}
