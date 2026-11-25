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

/** Margin above the usual daily high before a level counts as unusual. */
export const ROUTINE_MARGIN_M = 0.05;

const mytDate = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * The river's usual daily high: the median of each earlier day's highest reading
 * (Malaysia days, up to 7, today excluded). Needs at least 3 days.
 */
export function usualHigh(history: [string, number][], now: Date): number | null {
  const today = mytDate(now.toISOString());
  const weekAgo = now.getTime() - 7.5 * 24 * 3600_000;
  const daily = new Map<string, number>();
  for (const [t, v] of history) {
    const d = mytDate(t);
    if (d >= today || Date.parse(t) < weekAgo) continue;
    daily.set(d, Math.max(daily.get(d) ?? -Infinity, v));
  }
  if (daily.size < 3) return null;
  const xs = [...daily.values()].sort((a, b) => a - b);
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/**
 * Tide signature: on at least 3 earlier days the river rose above `line` and fell back
 * twice in the same day (two high tides). A flood rises once and stays up; a tide does not.
 * A rise only counts if the river was below the line for at least 2 hours before it.
 */
export function isTidal(history: [string, number][], now: Date, line: number): boolean {
  const today = mytDate(now.toISOString());
  const weekAgo = now.getTime() - 7.5 * 24 * 3600_000;
  const rises = new Map<string, number>();
  let belowSince: number | null = null;
  let above = false;
  for (const [t, v] of history) {
    const ms = Date.parse(t);
    if (ms < weekAgo) continue;
    if (v < line) {
      if (above || belowSince === null) belowSince = ms;
      above = false;
    } else if (!above) {
      above = true;
      const d = mytDate(t);
      if (belowSince !== null && ms - belowSince >= 2 * 3600_000 && d < today) rises.set(d, (rises.get(d) ?? 0) + 1);
    }
  }
  return [...rises.values()].filter((n) => n >= 2).length >= 3;
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
  // The usual daily high only matters at tidal gauges; elsewhere a high week is a flood, not a habit.
  const tidal = s.thr?.alert != null && isTidal(history, now, s.thr.alert);
  const usual = tidal ? usualHigh(history, now) : null;
  const routine =
    level !== null && level !== "NORMAL" && s.level !== null && usual !== null && s.level <= usual + ROUTINE_MARGIN_M;
  return { station: s, trust, level, levelSource, disagrees, toDanger, ratePerHour: rate, etaDangerMin, usualHigh: usual, routine };
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
    routine: best?.routine ?? false,
    statuses,
  };
}

/** Readings (15 min each) a lower level must hold before we say it went down. */
export const HOLD_DOWN_TICKS = 4;
/** Within this window, a rise only notifies if it goes higher than what we already sent. */
export const COOLDOWN_MS = 12 * 3600_000;

/** What we last told the family, carried between ticks. */
export interface NotifyState {
  last?: Level | "UNKNOWN";
  /** highest level sent within the cooldown window, and when */
  peak?: { level: Level; at: number };
  pending?: Level | "UNKNOWN";
  held?: number;
}

/**
 * Decide whether to message the family, and return the new state.
 * - A rise is sent at once, unless we already sent that level or higher in the last 12 h
 *   (tidal river mouths cross the alert line twice a day; one message is enough).
 * - Going down, only the all-clear is sent, once the river has been normal for an hour.
 * - Losing the sensor while the river is up is sent; losing it in calm weather is not.
 */
export function decideNotify(
  s: NotifyState,
  next: Level | "UNKNOWN",
  nowMs: number,
  /** the river is within its usual daily high (e.g. a tide); rises below DANGER are not news */
  routine = false,
): { send: boolean; state: NotifyState } {
  const held = next === s.pending ? (s.held ?? 0) + 1 : 1;
  const peak = s.peak && nowMs - s.peak.at < COOLDOWN_MS ? s.peak : undefined;
  const base: NotifyState = { ...s, pending: next, held, peak };
  const sent = (lv: Level | "UNKNOWN"): { send: true; state: NotifyState } => ({
    send: true,
    state: {
      ...base,
      last: lv,
      peak: lv !== "UNKNOWN" && lv !== "NORMAL" && (!peak || rank(lv) >= rank(peak.level)) ? { level: lv, at: nowMs } : peak,
    },
  });
  const quiet = (last = s.last): { send: false; state: NotifyState } => ({ send: false, state: { ...base, last } });

  const prev = s.last;
  if (prev === undefined) return next === "NORMAL" || next === "UNKNOWN" ? quiet(next) : sent(next);
  if (prev === next) return quiet();
  if (next === "UNKNOWN") return prev === "NORMAL" || prev === "UNKNOWN" ? quiet(next) : sent(next);
  if (prev === "UNKNOWN") return next === "NORMAL" ? quiet(next) : sent(next);
  if (rank(next) > rank(prev)) {
    // Not sent, and the family's picture (`last`) stays as it was, so no all-clear follows later.
    if (peak && rank(next) <= rank(peak.level)) return quiet(); // already told them, recently
    if (routine && next !== "DANGER") return quiet(); // happens most days here
    return sent(next);
  }
  // Going down: only the all-clear is news, and only once it has held for an hour.
  // (Warning -> alert keeps the family's picture at warning, so the later all-clear still comes.)
  if (next !== "NORMAL") return quiet();
  return held >= HOLD_DOWN_TICKS ? sent(next) : quiet();
}
