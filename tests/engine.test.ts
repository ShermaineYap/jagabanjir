import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalise, parseJpsTime, type RawRecord } from "../src/lib/jps";
import { assessHouse, assessStation, assessTrust, levelFromThresholds, ratePerHour, shouldNotify } from "../src/lib/assess";
import { compose, forSpeech, hhmm, verify } from "../src/lib/messages";
import { nearest } from "../src/lib/geo";
import type { Lang, Station } from "../src/lib/types";

const NOW = new Date("2026-11-25T20:02:00+08:00");
const raw = JSON.parse(readFileSync(new URL("./fixtures/jps-20261125T2002.json", import.meta.url), "utf8")) as RawRecord[];
const stations = normalise(raw);

function st(p: Partial<Station>): Station {
  return {
    id: "x", name: "Sg. Test di Kg. Ujian", district: "D", state: "S", basin: "B", river: "R",
    lat: 3, lon: 101, level: 2, updated: "2026-11-25T19:45:00+08:00", trend: "steady", jps: "NORMAL",
    thr: { normal: 1, alert: 3, warning: 4, danger: 5 }, rain: null, ...p,
  };
}

describe("JPS feed normalisation (real feed, 25 Nov 2026 20:02)", () => {
  it("keeps only water-level stations", () => {
    expect(stations.length).toBe(1306);
  });
  it("parses Malaysia time with offset", () => {
    expect(parseJpsTime("25/11/2026 19:45")).toBe("2026-11-25T19:45:00+08:00");
    expect(parseJpsTime("")).toBeNull();
  });
  it("turns -9999 into null, never a level", () => {
    expect(stations.some((s) => s.level !== null && s.level <= -9999)).toBe(false);
  });
  it("attaches published thresholds to Roban", () => {
    const roban = stations.find((s) => s.name === "Roban")!;
    expect(roban.thr?.danger).toBe(5.2);
    expect(roban.level).toBe(5.22);
  });
  it("our own level agrees with JPS's label for every live station that has thresholds", () => {
    const checked = stations
      .map((s) => assessStation(s, NOW))
      .filter((x) => x.trust.trust === "live" && x.levelSource === "thresholds" && x.station.jps && x.station.jps !== "ERROR");
    expect(checked.length).toBeGreaterThan(300);
    const mismatches = checked.filter((x) => x.disagrees);
    expect(mismatches.length / checked.length).toBeLessThan(0.02);
  });
});

describe("trust", () => {
  it("live within 75 minutes", () => expect(assessTrust(st({}), NOW).trust).toBe("live"));
  it("delayed between 75 minutes and 6 hours", () =>
    expect(assessTrust(st({ updated: "2026-11-25T16:00:00+08:00" }), NOW).trust).toBe("delayed"));
  it("stale after 6 hours", () =>
    expect(assessTrust(st({ updated: "2024-02-23T14:45:00+08:00" }), NOW).trust).toBe("stale"));
  it("broken when JPS says Error or there is no reading", () => {
    expect(assessTrust(st({ jps: "ERROR" }), NOW).trust).toBe("broken");
    expect(assessTrust(st({ level: null }), NOW).trust).toBe("broken");
  });
  it("suspect when the reading is exactly zero or far below the alert level", () => {
    expect(assessTrust(st({ level: 0 }), NOW).reason).toBe("zero");
    expect(assessTrust(st({ level: 3.17, thr: { normal: 32.95, alert: 35.5, warning: 36.8, danger: 37.4 } }), NOW).reason).toBe("far_below_alert");
  });
  it("suspect on a 2 m jump between readings", () =>
    expect(assessTrust(st({ level: 4.5 }), NOW, 2.1).reason).toBe("jump"));
});

describe("levels and the house", () => {
  it("classifies against thresholds", () => {
    expect(levelFromThresholds(2.9, st({}))).toBe("NORMAL");
    expect(levelFromThresholds(3, st({}))).toBe("ALERT");
    expect(levelFromThresholds(4.2, st({}))).toBe("WARNING");
    expect(levelFromThresholds(5, st({}))).toBe("DANGER");
  });
  it("falls back to JPS's label when no thresholds are published", () => {
    const r = assessStation(st({ thr: null, jps: "WARNING", level: 9 }), NOW);
    expect(r.level).toBe("WARNING");
    expect(r.levelSource).toBe("jps");
  });
  it("takes the worst trusted station", () => {
    const a = assessStation(st({ id: "a", level: 3.5 }), NOW);
    const b = assessStation(st({ id: "b", level: 4.5 }), NOW);
    expect(assessHouse([a, b])).toMatchObject({ level: "WARNING", decidingId: "b" });
  });
  it("ignores an untrusted station even if it shows DANGER", () => {
    const stale = assessStation(st({ id: "s", level: 6, updated: "2024-02-23T14:45:00+08:00", jps: "DANGER" }), NOW);
    const ok = assessStation(st({ id: "o", level: 2 }), NOW);
    expect(assessHouse([stale, ok]).level).toBe("NORMAL");
  });
  it("says UNKNOWN, never NORMAL, when nothing can be trusted", () => {
    const stale = assessStation(st({ updated: "2024-02-23T14:45:00+08:00" }), NOW);
    expect(assessHouse([stale]).level).toBe("UNKNOWN");
    expect(assessHouse([]).level).toBe("UNKNOWN");
  });
});

describe("rate and ETA", () => {
  it("computes metres per hour over the last 90 minutes", () => {
    const h: [string, number][] = [
      ["2026-11-25T19:00:00+08:00", 3.0],
      ["2026-11-25T19:30:00+08:00", 3.2],
      ["2026-11-25T20:00:00+08:00", 3.4],
    ];
    expect(ratePerHour(h, NOW)).toBe(0.4);
    const r = assessStation(st({ level: 3.4 }), NOW, h);
    expect(r.toDanger).toBe(1.6);
    expect(r.etaDangerMin).toBe(240);
  });
  it("gives no ETA with too little history", () => {
    expect(ratePerHour([["2026-11-25T19:45:00+08:00", 3]], NOW)).toBeNull();
  });
});

describe("when to notify", () => {
  it("notifies on any rise at once", () => {
    expect(shouldNotify("NORMAL", "ALERT", 1)).toBe(true);
    expect(shouldNotify("ALERT", "DANGER", 1)).toBe(true);
  });
  it("waits two ticks before an all-clear or step down", () => {
    expect(shouldNotify("WARNING", "ALERT", 1)).toBe(false);
    expect(shouldNotify("WARNING", "ALERT", 2)).toBe(true);
    expect(shouldNotify("ALERT", "NORMAL", 2)).toBe(true);
  });
  it("tells you when the sensor goes quiet during a flood, not during calm", () => {
    expect(shouldNotify("WARNING", "UNKNOWN", 1)).toBe(true);
    expect(shouldNotify("NORMAL", "UNKNOWN", 1)).toBe(false);
  });
  it("does not repeat", () => expect(shouldNotify("ALERT", "ALERT", 5)).toBe(false));
});

describe("messages", () => {
  const input = { label: "Rumah Mak", station: "Sg. Langat di Bukit Changgang", level: 4.35, danger: 4.2, at: "2026-11-25T19:30:00+08:00" };
  const langs: Lang[] = ["ms", "zh", "ta", "en"];
  for (const lang of langs)
    for (const level of ["NORMAL", "ALERT", "WARNING", "DANGER", "UNKNOWN"] as const)
      it(`${lang} ${level}: every number traces to the reading`, () => {
        const msg = compose(lang, level, input);
        expect(verify(msg, input)).toEqual([]);
        expect(msg).toContain("Rumah Mak");
      });
  it("catches a number that did not come from the source", () => {
    expect(verify("Sungai di 4.80 m", input)).toEqual(["4.80"]);
  });
  it("formats time in Malaysia time", () => expect(hhmm("2026-11-25T11:45:00Z")).toBe("19:45"));
  it("strips emoji and list numbers for speech", () => {
    const s = forSpeech(compose("ms", "DANGER", input));
    expect(s).not.toMatch(/🔴/);
    expect(s).not.toMatch(/^1\)/m);
  });
  it("every message carries the not-official line", () => {
    for (const lang of langs) expect(compose(lang, "DANGER", input).split("\n").at(-1)!.length).toBeGreaterThan(20);
  });
});

describe("nearest stations", () => {
  it("finds stations near Kuala Selangor", () => {
    const n = nearest(stations, 3.34, 101.25);
    expect(n.length).toBeGreaterThan(0);
    expect(n[0].km).toBeLessThan(25);
    for (let i = 1; i < n.length; i++) expect(n[i].km).toBeGreaterThanOrEqual(n[i - 1].km);
  });
});
