// Sensor census: how many JPS water-level stations can be trusted right now.
// Usage: npx tsx scripts/census.ts <jps-feed.json> <ISO now>
import { readFileSync } from "node:fs";
import { normalise, type RawRecord } from "../src/lib/jps";
import { assessStation } from "../src/lib/assess";

const [file, nowIso] = process.argv.slice(2);
const now = new Date(nowIso);
const st = normalise(JSON.parse(readFileSync(file, "utf8")) as RawRecord[]).map((s) => assessStation(s, now));
const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});
const pct = (n: number) => `${((100 * n) / st.length).toFixed(1)}%`;
const trust = count(st, (x) => x.trust.trust);
console.log("stations", st.length);
console.log("trust", Object.fromEntries(Object.entries(trust).map(([k, v]) => [k, `${v} (${pct(v)})`])));
console.log("reasons", count(st, (x) => x.trust.reason));
console.log("with coordinates", st.filter((x) => x.station.lat !== null).length);
console.log("with published thresholds", st.filter((x) => x.station.thr).length);
const both = st.filter((x) => x.levelSource === "thresholds" && x.station.jps && x.station.jps !== "ERROR" && x.trust.trust === "live");
console.log("agreement with JPS label (live, thresholds known)", both.length, "disagree", both.filter((x) => x.disagrees).length);
for (const d of both.filter((x) => x.disagrees)) console.log("  disagree:", d.station.name, d.station.state, d.station.level, d.station.thr, "jps", d.station.jps, "ours", d.level);
const trusted = st.filter((x) => x.trust.trust === "live" || x.trust.trust === "delayed");
console.log("trusted above normal", count(trusted.filter((x) => x.level && x.level !== "NORMAL"), (x) => `${x.level}`));
const untrustedAlarm = st.filter((x) => !(x.trust.trust === "live" || x.trust.trust === "delayed") && x.station.jps && ["ALERT", "WARNING", "DANGER"].includes(x.station.jps));
console.log("UNTRUSTED stations still showing a coloured alarm on the JPS map", untrustedAlarm.length, count(untrustedAlarm, (x) => x.trust.trust));
console.log("trusted share by state");
const states = [...new Set(st.map((x) => x.station.state))].sort();
for (const s of states) { const a = st.filter((x) => x.station.state === s); const t = a.filter((x) => x.trust.trust === "live" || x.trust.trust === "delayed").length; console.log(`  ${s}: ${t}/${a.length}`); }
