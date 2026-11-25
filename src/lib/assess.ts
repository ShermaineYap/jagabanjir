import type { HouseStatus, Level, Station, StationStatus, TrustResult } from "./types";

export const LIVE_MAX_MIN = 75;
export const DELAYED_MAX_MIN = 6 * 60;
/** A reading this far under the alert level is physically implausible for a river in flood season. */
export const FAR_BELOW_M = 5;
/** A change this large between two 15-minute readings is treated as a sensor glitch. */
export const JUMP_M = 2;

const ORDER: Level[] = ["NORMAL", "ALERT", "WARNING", "DANGER"];
export const rank = (l: Level) => ORDER.indexOf(l);

export function ageMinutes(updated: string | null, now: Date): number | null {
  if (!updated) return null;
  const t = Date.parse(updated);
  if (Number.isNaN(t)) return null;
  return Math.round((now.getTime() - t) / 60000);
}

/**
 * Decide whether a station's latest reading can be trusted.
 * prevLevel: the reading before the latest one (from our own log), if we have it.
 */
export function assessTrust(s: Station, now: Date, prevLevel?: number | null): TrustResult {
  const age = ageMinutes(s.updated, now);
  if (s.level === null || age === null) return { trust: "broken", reason: "no_reading", ageMinutes: age };
  if (s.jps === "ERROR") return { trust: "broken", reason: "jps_error", ageMinutes: age };
  if (s.level === 0) return { trust: "suspect", reason: "zero", ageMinutes: age };
  if (s.thr?.alert != null && s.thr.alert - s.level > FAR_BELOW_M)
    return { trust: "suspect", reason: "far_below_alert", ageMinutes: age };
  if (prevLevel != null && Math.abs(s.level - prevLevel) >= JUMP_M)
    return { trust: "suspect", reason: "jump", ageMinutes: age };
  if (age > DELAYED_MAX_MIN) return { trust: "stale", reason: "old", ageMinutes: age };
  if (age > LIVE_MAX_MIN) return { trust: "delayed", reason: "late", ageMinutes: age };
  return { trust: "live", reason: "fresh", ageMinutes: age };
}

export function levelFromThresholds(level: number, s: Station): Level | null {
  const t = s.thr;
  if (!t || t.alert == null || t.warning == null || t.danger == null) return null;
  if (!(t.alert <= t.warning && t.warning <= t.danger)) return null;
  if (level >= t.danger) return "DANGER";
  if (level >= t.warning) return "WARNING";
  if (level >= t.alert) return "ALERT";
  return "NORMAL";
}

/** history: [isoTime, level] oldest first, from our own 15-minute log */
export function ratePerHour(history: [string, number][], now: Date): number | null {
  const recent = history.filter(([t]) => {
    const age = (now.getTime() - Date.parse(t)) / 60000;
    return age >= 0 && age <= 90;
  });
  if (recent.length < 2) return null;
  const [t0, l0] = recent[0];
  const [t1, l1] = recent[recent.length - 1];
  const hours = (Date.parse(t1) - Date.parse(t0)) / 3_600_000;
  if (hours < 0.4) return null;
  return Math.round(((l1 - l0) / hours) * 100) / 100;
}

export function assessStation(
  s: Station,
  now: Date,
  history: [string, number][] = [],
): StationStatus {
  const prev = history.length >= 2 ? history[history.length - 2][1] : null;
  const trust = assessTrust(s, now, prev);
  let level: Level | null = null;
  let levelSource: StationStatus["levelSource"] = null;
  let disagrees = false;
  if (s.level !== null) {
    const own = levelFromThresholds(s.level, s);
    const jps = s.jps && s.jps !== "ERROR" ? s.jps : null;
    if (own) {
      level = own;
      levelSource = "thresholds";
      disagrees = jps !== null && jps !== own;
    } else if (jps) {
      level = jps;
      levelSource = "jps";
    }
  }
  const toDanger =
    s.level !== null && s.thr?.danger != null ? Math.round((s.thr.danger - s.level) * 100) / 100 : null;
  const rate = ratePerHour(history, now);
  const etaDangerMin =
    rate !== null && rate > 0.01 && toDanger !== null && toDanger > 0
      ? Math.round((toDanger / rate) * 60)
      : null;
  return { station: s, trust, level, levelSource, disagrees, toDanger, ratePerHour: rate, etaDangerMin };
}

/**
 * The house takes the worst level among the stations we can trust (live or delayed).
 * If none can be trusted, the honest answer is UNKNOWN, never NORMAL.
 */
export function assessHouse(statuses: StationStatus[]): HouseStatus {
  let best: StationStatus | null = null;
  for (const st of statuses) {
    if (st.trust.trust !== "live" && st.trust.trust !== "delayed") continue;
    if (!st.level) continue;
    if (!best || rank(st.level) > rank(best.level!)) best = st;
  }
  return {
    level: best?.level ?? "UNKNOWN",
    decidingId: best?.station.id ?? null,
    statuses,
  };
}

/**
 * Should we notify? Up-moves notify immediately. Down-moves (including the all-clear)
 * notify only once the lower level has held for two ticks, to stop flapping.
 */
export function shouldNotify(
  prev: Level | "UNKNOWN" | undefined,
  next: Level | "UNKNOWN",
  nextHeldTicks: number,
): boolean {
  if (prev === undefined) return next !== "NORMAL" && next !== "UNKNOWN";
  if (prev === next) return false;
  if (next === "UNKNOWN") return prev !== "NORMAL"; // lost the sensor while things were bad
  if (prev === "UNKNOWN") return next !== "NORMAL";
  if (rank(next) > rank(prev)) return true;
  return nextHeldTicks >= 2;
}
