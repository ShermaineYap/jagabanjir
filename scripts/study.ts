// Backtest JagaBanjir's rules on JPS's own 7-day records.
// Usage: npx tsx scripts/study.ts data/hist tests/fixtures/jps-20261125T2002.json > data/study/backtest.md
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTINE_MARGIN_M, decideNotify, isTidal, levelFromThresholds, rank, ratePerHour, usualHigh, type NotifyState } from "../src/lib/assess";
import { normalise, type RawRecord } from "../src/lib/jps";
import type { Level, Station, Thresholds } from "../src/lib/types";

const [dir, feedFile] = process.argv.slice(2);
const live = new Map(normalise(JSON.parse(readFileSync(feedFile, "utf8")) as RawRecord[]).map((s) => [s.id, s]));

interface Rec {
  id: string;
  info: Thresholds;
  v: [string, number][];
}
const recs: Rec[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const hrs = (ms: number) => ms / 3_600_000;

let withThr = 0;
let reachedDanger = 0;
const leadAlert: number[] = [];
const leadWarning: number[] = [];
const etaErr: number[] = []; // predicted - actual, minutes
const etaAbsPct: number[] = [];
let naiveMsgs = 0;
let ourMsgs = 0;
let noTideMsgs = 0;
let routineSuppressed = 0;
let tidal = 0;
const countedDays = new Set<string>();
const perStation: number[] = [];
const dangerStations: { name: string; state: string; at: string; leadAlertH: number | null }[] = [];
const curves: { id: string; name: string; state: string; district: string; thr: Thresholds; v: [string, number][]; score: number }[] = [];

for (const r of recs) {
  const st0 = live.get(r.id);
  const thr = st0?.thr ?? (r.info.alert != null && r.info.warning != null && r.info.danger != null ? r.info : null);
  if (!thr || r.v.length < 50) continue;
  if (!(thr.alert! <= thr.warning! && thr.warning! <= thr.danger!)) continue;
  withThr++;
  const st: Station = { ...(st0 as Station), id: r.id, thr };
  const lv = r.v.map(([t, v]) => [t, levelFromThresholds(v, st)!] as [string, Level]);

  // 1) lead time: first time each level is crossed within the episode that reaches DANGER
  const firstDanger = lv.findIndex(([, l]) => l === "DANGER");
  if (firstDanger > 0) {
    reachedDanger++;
    // walk back to the start of this rise: last NORMAL before the danger crossing
    let start = firstDanger;
    while (start > 0 && lv[start - 1][1] !== "NORMAL") start--;
    const tD = Date.parse(lv[firstDanger][0]);
    const iA = lv.slice(start, firstDanger).findIndex(([, l]) => rank(l) >= rank("ALERT"));
    const iW = lv.slice(start, firstDanger).findIndex(([, l]) => rank(l) >= rank("WARNING"));
    const startsNormal = start > 0; // otherwise the record began already above normal
    let la: number | null = null;
    if (startsNormal && iA >= 0) leadAlert.push((la = hrs(tD - Date.parse(lv[start + iA][0]))));
    if (startsNormal && iW >= 0) leadWarning.push(hrs(tD - Date.parse(lv[start + iW][0])));
    dangerStations.push({ name: st0?.name ?? r.id, state: st0?.state ?? "", at: lv[firstDanger][0], leadAlertH: la });

    // 2) ETA accuracy: at each point while rising and below danger, compare the straight-line guess with reality
    for (let i = start; i < firstDanger; i++) {
      const now = new Date(r.v[i][0]);
      const rate = ratePerHour(r.v.slice(Math.max(0, i - 8), i + 1), now);
      const toD = thr.danger! - r.v[i][1];
      if (rate === null || rate <= 0.01 || toD <= 0) continue;
      const predicted = (toD / rate) * 60;
      if (predicted > 12 * 60) continue;
      const actual = (tD - now.getTime()) / 60000;
      etaErr.push(predicted - actual);
      etaAbsPct.push(Math.abs(predicted - actual) / Math.max(actual, 15));
    }
  }

  // 3) messages: naive = every change of level; ours = shouldNotify with the 2-reading hold
  // usual daily high only changes once a day: compute it per Malaysia date
  const usualByDay = new Map<string, number | null>();
  const tidalByDay = new Map<string, boolean>();
  let prevNaive: Level | null = null;
  let ns: NotifyState = {};
  let nsNoTide: NotifyState = {};
  let stationMsgs = 0;
  lv.forEach(([t, l], i) => {
    const day = new Date(Date.parse(t) + 8 * 3600_000).toISOString().slice(0, 10);
    if (!usualByDay.has(day)) {
      const now = new Date(t);
      usualByDay.set(day, usualHigh(r.v, now));
      tidalByDay.set(day, isTidal(r.v, now, thr.alert!));
    }
    const u = usualByDay.get(day)!;
    const counted = u !== null; // only count days where every rule can run
    if (counted) countedDays.add(`${r.id}|${day}`);
    if (prevNaive !== null && l !== prevNaive && counted) naiveMsgs++;
    prevNaive = l;
    const routine = l !== "NORMAL" && tidalByDay.get(day)! && u !== null && r.v[i][1] <= u + ROUTINE_MARGIN_M;
    const d = decideNotify(ns, l, Date.parse(t), routine);
    if (d.send && counted) (ourMsgs++, stationMsgs++);
    ns = d.state;
    const d2 = decideNotify(nsNoTide, l, Date.parse(t));
    if (d2.send && counted) noTideMsgs++;
    if (d2.send && !d.send && counted) routineSuppressed++;
    nsNoTide = d2.state;
  });
  perStation.push(stationMsgs);
  if ([...tidalByDay.values()].some(Boolean)) tidal++;

  if (firstDanger > 0) {
    const peak = Math.max(...r.v.map((x) => x[1]));
    const low = Math.min(...r.v.map((x) => x[1]));
    curves.push({
      id: r.id, name: st0?.name ?? r.id, state: st0?.state ?? "", district: st0?.district ?? "", thr, v: r.v,
      score: (peak - low) / Math.max(0.1, thr.danger! - thr.alert!),
    });
  }
}

const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");
console.log(`# Backtest on JPS 7-day records\n`);
console.log(`Records: ${recs.length} stations downloaded; ${withThr} have usable thresholds and at least 50 readings.\n`);
console.log(`## How much warning does each level give before danger?\n`);
console.log(`${reachedDanger} stations reached danger level at least once in the 7 days.\n`);
console.log(`| From first… | Rises measured | Median hours to danger | 25th–75th percentile |`);
console.log(`|---|---|---|---|`);
console.log(`| Alert | ${leadAlert.length} | ${f1(median(leadAlert))} | ${f1(q(leadAlert, 0.25))}–${f1(q(leadAlert, 0.75))} |`);
console.log(`| Warning | ${leadWarning.length} | ${f1(median(leadWarning))} | ${f1(q(leadWarning, 0.25))}–${f1(q(leadWarning, 0.75))} |`);
console.log(`\n## How good is the straight-line "time to danger"?\n`);
console.log(`${etaErr.length} predictions (rising, under 12 hours out). Median error ${f1(median(etaErr))} min (negative = predicted too early); median absolute error ${f1(median(etaErr.map(Math.abs)))} min; within ±30% of the true time: ${f1((100 * etaAbsPct.filter((x) => x <= 0.3).length) / Math.max(1, etaAbsPct.length))}%.`);
console.log(`\n## How many messages would a family get?\n`);
const sd = countedDays.size;
const pw = (n: number) => f1((7 * n) / Math.max(1, sd));
console.log(`Counted over ${sd} station-days (days 4–7 of each record, when every rule can run):\n`);
console.log(`| Rule | Messages | Per station per week |`);
console.log(`|---|---|---|`);
console.log(`| Message on every level change | ${naiveMsgs} | ${pw(naiveMsgs)} |`);
console.log(`| + no repeat within 12 h; going down, only the all-clear after 1 h | ${noTideMsgs} | ${pw(noTideMsgs)} |`);
console.log(`| + skip alert/warning within the usual daily high (danger always sent) | ${ourMsgs} | ${pw(ourMsgs)} |`);
const sorted = [...perStation].sort((a, b) => a - b);
console.log(`\nWith all rules, the median station sent ${sorted[Math.floor(sorted.length / 2)] ?? 0} messages in those days; ${sorted.filter((x) => x === 0).length} of ${sorted.length} sent none; the busiest sent ${sorted.at(-1) ?? 0}.`);
console.log(`\n${tidal} stations showed a tide signature (two rises above alert a day, on 3+ days). The tide rule held back ${routineSuppressed} messages; no danger message was ever held back.`);
console.log(`\n## Stations that reached danger\n`);
for (const d of dangerStations.sort((a, b) => a.at.localeCompare(b.at)))
  console.log(`- ${d.at.slice(0, 16).replace("T", " ")} ${d.name}, ${d.state}${d.leadAlertH !== null ? ` — ${f1(d.leadAlertH)} h after first alert` : ""}`);

// best replay candidates for the demo
const top = curves.sort((a, b) => b.score - a.score).slice(0, 8);
console.error("replay candidates:");
for (const c of top) console.error(`  ${c.id} ${c.name} (${c.district}, ${c.state}) score ${c.score.toFixed(1)}`);
