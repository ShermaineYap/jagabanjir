// Build src/data/replay.json: run the real engine over a JPS 7-day record, reading by reading,
// and record what the house status was and which messages would have been sent.
// Usage: npx tsx scripts/make-replay.ts <history.json> <live-feed.json> <stationId> <fromISO> <toISO>
import { readFileSync, writeFileSync } from "node:fs";
import { assessHouse, assessStation, decideNotify, type NotifyState } from "../src/lib/assess";
import { normalise, parseHistory, type RawRecord } from "../src/lib/jps";
import { compose, verify } from "../src/lib/messages";
import type { Lang } from "../src/lib/types";

const [histFile, feedFile, id, from, to] = process.argv.slice(2);
const h = parseHistory(JSON.parse(readFileSync(histFile, "utf8")));
const meta = normalise(JSON.parse(readFileSync(feedFile, "utf8")) as RawRecord[]).find((s) => s.id === id)!;
const thr = meta.thr ?? h.thr!;
const LANGS: Lang[] = ["ms", "zh", "ta", "en"];
const frames: { t: string; v: number; lv: string }[] = [];
const sent: { t: string; level: string; text: Record<Lang, string> }[] = [];
let ns: NotifyState = {};
const t0 = Date.parse(from);
const t1 = Date.parse(to);
h.points.forEach(([t, v], i) => {
  const ms = Date.parse(t);
  if (ms < t0 - 3 * 24 * 3600_000 || ms > t1) return; // warm up the state on the days before
  const now = new Date(ms + 60_000);
  const s = assessStation({ ...meta, thr, level: v, updated: t, jps: null }, now, h.points.slice(0, i + 1));
  const house = assessHouse([s]);
  const d = decideNotify(ns, house.level, ms, house.routine);
  ns = d.state;
  if (ms < t0) return;
  frames.push({ t, v, lv: house.level });
  if (d.send) {
    const input = { label: "Rumah Mak", station: meta.name, level: v, danger: thr.danger, at: t };
    const text = Object.fromEntries(LANGS.map((l) => [l, compose(l, house.level, input)])) as Record<Lang, string>;
    for (const l of LANGS) if (verify(text[l], input).length) throw new Error("number check failed");
    sent.push({ t, level: house.level, text });
  }
});
writeFileSync(
  "src/data/replay.json",
  JSON.stringify({ station: { id, name: meta.name, district: meta.district, state: meta.state, river: meta.river, thr }, frames, sent }),
);
console.log(frames.length, "frames,", sent.length, "messages:", sent.map((s) => `${s.t.slice(5, 16)} ${s.level}`).join(" | "));
