import { Redis } from "@upstash/redis";
import type { Snapshot, Watch } from "./types";

/**
 * Small storage layer. Uses Upstash Redis when its env vars are set (production),
 * otherwise an in-process map (local dev and tests).
 *
 * Keys:
 *   snap:latest           latest Snapshot
 *   tick:YYYYMMDDHHmm     compact levels for one tick {t, l: {stationId: level}}, 8-day TTL
 *   ticks                 sorted set of tick keys by time
 *   watches               hash watchId -> Watch JSON
 *   lock:tick             10-minute lock so /api/tick is safe to call publicly
 */

type Mem = Map<string, { v: unknown; exp?: number }>;
const g = globalThis as unknown as { __jbmem?: Mem };
const mem: Mem = (g.__jbmem ??= new Map());

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const usingRedis = () => redis !== null;

function memGet<T>(k: string): T | null {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.v as T;
}

export async function getJSON<T>(k: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(k)) ?? null;
  return memGet<T>(k);
}

export async function setJSON(k: string, v: unknown, ttlSec?: number) {
  if (redis) {
    if (ttlSec) await redis.set(k, v, { ex: ttlSec });
    else await redis.set(k, v);
    return;
  }
  mem.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
}

/** Returns true if we got the lock. */
export async function tryLock(k: string, ttlSec: number): Promise<boolean> {
  if (redis) return (await redis.set(k, "1", { nx: true, ex: ttlSec })) === "OK";
  if (memGet(k)) return false;
  mem.set(k, { v: "1", exp: Date.now() + ttlSec * 1000 });
  return true;
}

export async function releaseLock(k: string) {
  if (redis) await redis.del(k);
  else mem.delete(k);
}

export interface TickBlob {
  t: string; // ISO fetch time
  l: Record<string, [string, number]>; // stationId -> [reading time ISO, level]
}

const TICK_TTL = 8 * 24 * 3600;

export async function saveTick(key: string, blob: TickBlob) {
  await setJSON(key, blob, TICK_TTL);
  const score = Date.parse(blob.t);
  if (redis) {
    await redis.zadd("ticks", { score, member: key });
    await redis.zremrangebyscore("ticks", 0, score - TICK_TTL * 1000);
  } else {
    const list = memGet<{ k: string; s: number }[]>("ticks") ?? [];
    list.push({ k: key, s: score });
    mem.set("ticks", { v: list.filter((x) => x.s > score - TICK_TTL * 1000) });
  }
}

/** Tick blobs since `sinceMs`, oldest first. */
export async function loadTicks(sinceMs: number): Promise<TickBlob[]> {
  let keys: string[];
  if (redis) keys = await redis.zrange<string[]>("ticks", sinceMs, "+inf", { byScore: true });
  else keys = (memGet<{ k: string; s: number }[]>("ticks") ?? []).filter((x) => x.s >= sinceMs).map((x) => x.k);
  if (keys.length === 0) return [];
  if (redis) {
    const vals = await redis.mget<(TickBlob | null)[]>(...keys);
    return vals.filter((v): v is TickBlob => v !== null);
  }
  return keys.map((k) => memGet<TickBlob>(k)).filter((v): v is TickBlob => v !== null);
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

export async function getWatch(id: string): Promise<Watch | null> {
  if (redis) return (await redis.hget<Watch>("watches", id)) ?? null;
  return (memGet<Record<string, Watch>>("watches") ?? {})[id] ?? null;
}

export async function putWatch(w: Watch) {
  if (redis) {
    await redis.hset("watches", { [w.id]: w });
    return;
  }
  const all = memGet<Record<string, Watch>>("watches") ?? {};
  all[w.id] = w;
  mem.set("watches", { v: all });
}

export async function allWatches(): Promise<Watch[]> {
  if (redis) {
    const all = await redis.hgetall<Record<string, Watch>>("watches");
    return all ? Object.values(all) : [];
  }
  return Object.values(memGet<Record<string, Watch>>("watches") ?? {});
}

export async function deleteWatch(id: string) {
  if (redis) await redis.hdel("watches", id);
  else {
    const all = memGet<Record<string, Watch>>("watches") ?? {};
    delete all[id];
    mem.set("watches", { v: all });
  }
}
