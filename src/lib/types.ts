export type Level = "NORMAL" | "ALERT" | "WARNING" | "DANGER";
export type Trend = "rising" | "falling" | "steady";
export type Trust = "live" | "delayed" | "stale" | "broken" | "suspect";
export type Lang = "ms" | "en" | "zh" | "ta";

export interface Thresholds {
  normal: number | null;
  alert: number | null;
  warning: number | null;
  danger: number | null;
}

/** One JPS water-level station, normalised from the Public InfoBanjir live feed. */
export interface Station {
  id: string;
  name: string;
  district: string;
  state: string;
  basin: string;
  river: string;
  lat: number | null;
  lon: number | null;
  /** metres; null when JPS sends -9999 or blank */
  level: number | null;
  /** ISO 8601 with +08:00 offset */
  updated: string | null;
  trend: Trend | null;
  /** level label JPS itself shows on its map */
  jps: Level | "ERROR" | null;
  thr: Thresholds | null;
  rain: string | null;
}

export interface Snapshot {
  fetchedAt: string;
  source: string;
  stations: Station[];
}

export interface TrustResult {
  trust: Trust;
  /** short machine reason, rendered by the UI */
  reason:
    | "fresh"
    | "late"
    | "old"
    | "no_reading"
    | "jps_error"
    | "zero"
    | "far_below_alert"
    | "jump";
  ageMinutes: number | null;
}

export interface StationStatus {
  station: Station;
  trust: TrustResult;
  /** our own reading of the level against published thresholds, or JPS's label */
  level: Level | null;
  levelSource: "thresholds" | "jps" | null;
  /** true when our computed level and JPS's label disagree */
  disagrees: boolean;
  toDanger: number | null;
  /** metres per hour over roughly the last hour, from our own log */
  ratePerHour: number | null;
  /** rough minutes until danger level at current rate; only when rising */
  etaDangerMin: number | null;
  /** median of earlier days' highest readings; null with under 3 days of history */
  usualHigh: number | null;
  /** above normal, but no higher than it gets most days (e.g. high tide) */
  routine: boolean;
}

export interface Watch {
  id: string;
  createdAt: string;
  label: string;
  lat: number;
  lon: number;
  stationIds: string[];
  lang: Lang;
  chatId?: number;
  last?: { level: Level | "UNKNOWN"; at: string };
  /** notification state carried between ticks (see decideNotify) */
  notify?: import("./assess").NotifyState;
}

export interface HouseStatus {
  level: Level | "UNKNOWN";
  /** the station that decided the level */
  decidingId: string | null;
  /** the deciding station is within its usual daily high */
  routine: boolean;
  statuses: StationStatus[];
}
