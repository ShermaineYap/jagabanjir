import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalise, parseHistory, parseJpsTime, type RawRecord } from "../src/lib/jps";
import { assessHouse, assessStation, assessTrust, decideNotify, isTidal, levelFromThresholds, ratePerHour, usualHigh, type NotifyState } from "../src/lib/assess";
import { compose, forSpeech, hhmm, verify } from "../src/lib/messages";
import { nearest } from "../src/lib/geo";
import type { Lang, Level, Station } from "../src/lib/types";

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
  const T0 = Date.parse("2026-11-25T08:00:00+08:00");
  const Q = 15 * 60_000;
  /** run a sequence of levels, one per 15-minute reading; return which readings sent a message */
  function run(levels: (Level | "UNKNOWN")[], start: NotifyState = {}) {
    let st = start;
    const sent: number[] = [];
    levels.forEach((l, i) => {
      const d = decideNotify(st, l, T0 + i * Q);
      if (d.send) sent.push(i);
      st = d.state;
    });
    return sent;
  }
  it("stays quiet when the first reading is normal", () => expect(run(["NORMAL", "NORMAL"])).toEqual([]));
  it("sends every rise at once", () => expect(run(["NORMAL", "ALERT", "WARNING", "DANGER"])).toEqual([1, 2, 3]));
  it("waits an hour before saying it went down", () =>
    expect(run(["NORMAL", "ALERT", "NORMAL", "NORMAL", "NORMAL", "NORMAL"])).toEqual([1, 5]));
  it("does not re-send a tidal alert that comes back within 12 hours", () => {
    const tide = ["NORMAL", "ALERT", "ALERT", ...Array(6).fill("NORMAL"), "ALERT", "ALERT"] as Level[];
    expect(run(tide)).toEqual([1, 6]); // alert, all-clear after an hour; the second alert is not repeated
  });
  it("does send a rise higher than anything sent recently", () =>
    expect(run(["NORMAL", "ALERT", ...Array(5).fill("NORMAL"), "WARNING"] as Level[])).toEqual([1, 5, 7]));
  it("going down, sends only the all-clear", () =>
    expect(run(["NORMAL", "DANGER", ...Array(5).fill("WARNING"), ...Array(5).fill("ALERT"), ...Array(4).fill("NORMAL")] as Level[])).toEqual([1, 15]));
  it("tells you when the sensor goes quiet during a flood, not during calm", () => {
    expect(run(["NORMAL", "WARNING", "UNKNOWN"])).toEqual([1, 2]);
    expect(run(["NORMAL", "UNKNOWN"])).toEqual([]);
  });
  it("does not repeat a level", () => expect(run(["NORMAL", "ALERT", "ALERT", "ALERT"])).toEqual([1]));
  it("skips a routine alert, but never a routine danger", () => {
    expect(decideNotify({ last: "NORMAL" }, "ALERT", T0, true).send).toBe(false);
    expect(decideNotify({ last: "NORMAL" }, "WARNING", T0, true).send).toBe(false);
    expect(decideNotify({ last: "NORMAL" }, "DANGER", T0, true).send).toBe(true);
  });
  it("a skipped rise leaves the family's picture unchanged, so no all-clear follows", () => {
    const a = decideNotify({ last: "NORMAL" }, "ALERT", T0, true);
    expect(a.state.last).toBe("NORMAL");
    let st = a.state;
    let sent = 0;
    for (let i = 1; i <= 6; i++) {
      const d = decideNotify(st, "NORMAL", T0 + i * Q);
      if (d.send) sent++;
      st = d.state;
    }
    expect(sent).toBe(0);
  });
});

describe("usual daily high", () => {
  const day = (d: number, h: number, v: number): [string, number] => [`2026-11-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00+08:00`, v];
  const now = new Date("2026-11-25T20:00:00+08:00");
  it("is the median of earlier days' highs", () => {
    const h = [day(21, 1, 2.0), day(21, 13, 3.1), day(22, 2, 3.3), day(23, 3, 2.9), day(24, 3, 3.0), day(25, 4, 9)];
    expect(usualHigh(h, now)).toBe(3.05); // today's 9 m is excluded
  });
  it("needs three earlier days", () => expect(usualHigh([day(23, 1, 3), day(24, 1, 3)], now)).toBeNull());
  // two high tides a day (around 02:00 and 14:00) reaching 3.4 m, alert line at 3 m
  const tide: [string, number][] = [];
  for (const d of [20, 21, 22, 23, 24])
    for (let h = 0; h < 24; h++) tide.push(day(d, h, [1, 2, 13, 14].includes(h) ? 3.4 : 2.2));
  const thr = { normal: 1, alert: 3, warning: 4, danger: 5 };
  it("recognises a tide: two rises a day on 3+ days", () => expect(isTidal(tide, now, 3)).toBe(true));
  it("does not mistake a flood that rose once and stayed up for a tide", () => {
    const flood: [string, number][] = [];
    for (const d of [20, 21, 22, 23, 24]) for (let h = 0; h < 24; h++) flood.push(day(d, h, d >= 22 ? 3.6 : 2));
    expect(isTidal(flood, now, 3)).toBe(false);
    expect(assessStation(st({ level: 3.5, thr }), now, [...flood, ["2026-11-25T19:45:00+08:00", 3.5]]).routine).toBe(false);
  });
  it("marks a tide-height alert as routine, and a higher one as not", () => {
    const mk = (v: number) => assessStation(st({ level: v, thr }), now, [...tide, ["2026-11-25T19:45:00+08:00", v]]);
    expect(mk(3.4).routine).toBe(true);
    expect(mk(3.7).routine).toBe(false);
  });
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

describe("JPS 7-day history", () => {
  const h = parseHistory(JSON.parse(readFileSync(new URL("./fixtures/jps-history-27571.json", import.meta.url), "utf8")));
  it("reads thresholds from the record", () => expect(h.thr).toEqual({ normal: 39.69, alert: 41.4, warning: 42.1, danger: 42.4 }));
  it("keeps 15-minute points, oldest first, with no -9999", () => {
    expect(h.points.length).toBeGreaterThan(500);
    for (let i = 1; i < h.points.length; i++) expect(Date.parse(h.points[i][0])).toBeGreaterThan(Date.parse(h.points[i - 1][0]));
    expect(h.points.every(([t, v]) => /:(00|15|30|45):00\+08:00$/.test(t) && v > -9999)).toBe(true);
  });
});
