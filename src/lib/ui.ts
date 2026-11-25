import type { Level, StationStatus, Trust, TrustResult } from "./types";

export const LEVEL_WORD: Record<Level | "UNKNOWN", { en: string; ms: string }> = {
  NORMAL: { en: "Normal", ms: "Normal" },
  ALERT: { en: "Alert", ms: "Waspada" },
  WARNING: { en: "Warning", ms: "Amaran" },
  DANGER: { en: "Danger", ms: "Bahaya" },
  UNKNOWN: { en: "Can't tell", ms: "Tidak pasti" },
};

export const TRUST_WORD: Record<Trust, string> = {
  live: "Live",
  delayed: "Late",
  stale: "Stale",
  broken: "Broken",
  suspect: "Suspect",
};

export function ago(min: number | null): string {
  if (min === null) return "no time given";
  if (min < 2) return "just now";
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  return `${Math.round(d / 30.4)} months ago`;
}

export function trustSentence(t: TrustResult): string {
  switch (t.reason) {
    case "fresh":
      return `Reported ${ago(t.ageMinutes)}.`;
    case "late":
      return `Last report ${ago(t.ageMinutes)}. Usable, but late.`;
    case "old":
      return `Last report ${ago(t.ageMinutes)}. Too old to rely on.`;
    case "no_reading":
      return "Sends no water level.";
    case "jps_error":
      return "JPS marks this sensor as faulty.";
    case "zero":
      return "Reads exactly 0 m, which usually means a fault.";
    case "far_below_alert":
      return "Reads more than 5 m below its alert level, which is not physically likely.";
    case "jump":
      return "Jumped 2 m or more in one reading, which looks like a glitch.";
  }
}

export const isTrusted = (s: StationStatus) => s.trust.trust === "live" || s.trust.trust === "delayed";

export function m(v: number | null | undefined, dp = 2) {
  return v === null || v === undefined ? "—" : `${v.toFixed(dp)} m`;
}

export function myt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
