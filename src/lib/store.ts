import { neon } from "@neondatabase/serverless";
import type { Snapshot, Watch } from "./types";

/**
 * Small key-value store. Uses Postgres (Neon, free tier) when DATABASE_URL is set,
 * otherwise an in-process map (local dev and tests).
 *
 * One table: kv(k text primary key, v jsonb, exp timestamptz, score double precision)
 *   snap:latest           latest Snapshot
 *   tick:YYYYMMDDHHmm     compact levels for one tick {t, l: {stationId: [time, level]}}, 8-day expiry, score = time
 *   watch:<id>            one watched house
 *   jh:<stationId>        cached JPS 7-day history, 10-minute expiry
 *   lock:tick             10-minute lock so /api/tick is safe to call publicly
 */

type Mem = Map<string, { v: unknown; exp?: number; score?: number }>;
const g = globalThis as unknown as { __jbmem?: Mem; __jbready?: Promise<unknown> };
const mem: Mem = (g.__jbmem ??= new Map());

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const sql = url ? neon(url) : null;

export const usingDatabase = () => sql !== null;

async function db() {
  if (!sql) return null;
  // the HTTP driver runs one statement per call
  g.__jbready ??= (async () => {
    await sql.query(
      "CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v jsonb NOT NULL, exp timestamptz, score double precision)",
    );
    await sql.query("CREATE INDEX IF NOT EXISTS kv_score ON kv (score) WHERE score IS NOT NULL");
  })();
  try {
    await g.__jbready;
  } catch (e) {
    g.__jbready = undefined; // retry on the next call
    throw e;
  }
  return sql;
}

function memGet<T>(k: string): T | null {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.v as T;
}

const expAt = (ttlSec?: number) => (ttlSec ? new Date(Date.now() + ttlSec * 1000).toISOString() : null);

export async function getJSON<T>(k: string): Promise<T | null> {
  const q = await db();
  if (!q) return memGet<T>(k);
  const rows = (await q.query("SELECT v FROM kv WHERE k = $1 AND (exp IS NULL OR exp > now())", [k])) as { v: T }[];
  return rows[0]?.v ?? null;
}

export async function setJSON(k: string, v: unknown, ttlSec?: number, score?: number) {
  const q = await db();
  if (!q) {
    mem.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined, score });
    return;
  }
  await q.query(
    `INSERT INTO kv (k, v, exp, score) VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, exp = EXCLUDED.exp, score = EXCLUDED.score`,
    [k, JSON.stringify(v), expAt(ttlSec), score ?? null],
  );
}

async function del(k: string) {
  const q = await db();
  if (q) await q.query("DELETE FROM kv WHERE k = $1", [k]);
  else mem.delete(k);
}

/** Returns true if we got the lock. */
export async function tryLock(k: string, ttlSec: number): Promise<boolean> {
  const q = await db();
  if (!q) {
    if (memGet(k)) return false;
    mem.set(k, { v: 1, exp: Date.now() + ttlSec * 1000 });
    return true;
  }
  const rows = await q.query(
    `INSERT INTO kv (k, v, exp) VALUES ($1, '1'::jsonb, $2)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, exp = EXCLUDED.exp WHERE kv.exp IS NOT NULL AND kv.exp <= now()
     RETURNING k`,
    [k, expAt(ttlSec)],
  );
  return (rows as unknown[]).length === 1;
}

export const releaseLock = del;

export interface TickBlob {
  t: string; // ISO fetch time
  l: Record<string, [string, number]>; // stationId -> [reading time ISO, level]
}

const TICK_TTL = 8 * 24 * 3600;

export async function saveTick(key: string, blob: TickBlob) {
  await setJSON(key, blob, TICK_TTL, Date.parse(blob.t));
  const q = await db();
  if (q) await q.query("DELETE FROM kv WHERE exp IS NOT NULL AND exp < now()");
}

/** Tick blobs since `sinceMs`, oldest first. */
export async function loadTicks(sinceMs: number): Promise<TickBlob[]> {
  const q = await db();
  if (!q) {
    return [...mem.entries()]
      .filter(([k, e]) => k.startsWith("tick:") && (e.score ?? 0) >= sinceMs && !(e.exp && e.exp < Date.now()))
      .sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0))
      .map(([, e]) => e.v as TickBlob);
  }
  const rows = (await q.query(
    "SELECT v FROM kv WHERE k LIKE 'tick:%' AND score >= $1 AND (exp IS NULL OR exp > now()) ORDER BY score",
    [sinceMs],
  )) as { v: TickBlob }[];
  return rows.map((r) => r.v);
}

/** Per-station history [readingTime, level] from tick blobs, de-duplicated by reading time. */
export function historyFor(ticks: TickBlob[], id: string): [string, number][] {
  const seen = new Set<string>();
  const out: [string, number][] = [];
  for (const b of ticks) {
    const r = b.l[id];
    if (!r || seen.has(r[0])) continue;
    seen.add(r[0]);
    out.push(r);
  }
  return out.sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
}

export async function getSnapshot(): Promise<Snapshot | null> {
  return getJSON<Snapshot>("snap:latest");
}

export const getWatch = (id: string) => getJSON<Watch>(`watch:${id}`);
export const putWatch = (w: Watch) => setJSON(`watch:${w.id}`, w);
export const deleteWatch = (id: string) => del(`watch:${id}`);

export async function allWatches(): Promise<Watch[]> {
  const q = await db();
  if (!q) return [...mem.entries()].filter(([k]) => k.startsWith("watch:")).map(([, e]) => e.v as Watch);
  const rows = (await q.query("SELECT v FROM kv WHERE k LIKE 'watch:%'")) as { v: Watch }[];
  return rows.map((r) => r.v);
}
