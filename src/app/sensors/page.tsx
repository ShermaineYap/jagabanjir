"use client";
import { useEffect, useState } from "react";
import type { StationStatus, Trust } from "@/lib/types";
import { LEVEL_WORD, TRUST_WORD, ago, m, trustSentence } from "@/lib/ui";

interface Overview {
  fetchedAt: string;
  total: number;
  counts: Record<Trust, number>;
  raised: StationStatus[];
  raisedCount: number;
  falseAlarms: StationStatus[];
  falseAlarmCount: number;
  byState: Record<string, { total: number; trusted: number; raised: number }>;
  error?: string;
}

const ORDER: Trust[] = ["live", "delayed", "suspect", "stale", "broken"];
const BAR: Record<Trust, string> = {
  live: "var(--river)",
  delayed: "#7fa9bd",
  suspect: "#c9a0a0",
  stale: "#b5bbc0",
  broken: "#8a9199",
};

export default function Sensors() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setOv(j)))
      .catch(() => setErr("Could not load the river data."));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!ov) return <p className="muted">Checking every JPS river gauge…</p>;
  const trusted = ov.counts.live + ov.counts.delayed;
  const states = Object.entries(ov.byState).sort((a, b) => a[1].trusted / a[1].total - b[1].trusted / b[1].total);

  return (
    <>
      <h1>Sensor check</h1>
      <p style={{ fontSize: "var(--step-1)" }}>
        Right now {trusted.toLocaleString()} of {ov.total.toLocaleString()} JPS river gauges (
        {Math.round((100 * trusted) / ov.total)}%) are sending a reading recent and plausible enough to act on.
      </p>
      <p className="muted">
        Checked {ago(Math.round((Date.now() - Date.parse(ov.fetchedAt)) / 60000))}. JagaBanjir runs these checks on every
        gauge before it says anything about a house.
      </p>

      <figure style={{ margin: "1.5rem 0 2.5rem", maxWidth: "46rem" }}>
        <div style={{ display: "flex", height: "2.2rem", border: "1.5px solid var(--ink)" }} role="img"
          aria-label={ORDER.map((k) => `${TRUST_WORD[k]} ${ov.counts[k]}`).join(", ")}>
          {ORDER.map((k) => (
            <div key={k} style={{ width: `${(100 * ov.counts[k]) / ov.total}%`, background: BAR[k] }} />
          ))}
        </div>
        <figcaption>
          <dl className="legend">
            {ORDER.map((k) => (
              <div key={k}>
                <dt>
                  <span className="sw" style={{ background: BAR[k] }} aria-hidden /> {TRUST_WORD[k]}
                </dt>
                <dd>
                  <span className="n">{ov.counts[k]}</span> {DEF[k]}
                </dd>
              </div>
            ))}
          </dl>
        </figcaption>
      </figure>

      <section aria-labelledby="fa" style={{ maxWidth: "52rem" }}>
        <h2 id="fa">Alarms you should not trust: {ov.falseAlarmCount}</h2>
        <p>
          These gauges still carry an alert, warning or danger colour on the official map, but their reading is old or
          faulty. JagaBanjir treats them as &ldquo;can&apos;t tell&rdquo;.
        </p>
        <table className="plain">
          <thead>
            <tr>
              <th>Gauge</th>
              <th>State</th>
              <th>Map shows</th>
              <th>Why we don&apos;t trust it</th>
            </tr>
          </thead>
          <tbody>
            {ov.falseAlarms.map((s) => (
              <tr key={s.station.id}>
                <td>{s.station.name}</td>
                <td>{tc(s.station.state)}</td>
                <td>{s.station.jps && s.station.jps !== "ERROR" ? LEVEL_WORD[s.station.jps].en : ""}</td>
                <td>{trustSentence(s.trust)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="up" style={{ maxWidth: "52rem", marginTop: "2.5rem" }}>
        <h2 id="up">Trusted gauges above normal: {ov.raisedCount}</h2>
        <table className="plain">
          <thead>
            <tr>
              <th>Gauge</th>
              <th>District</th>
              <th>Level</th>
              <th style={{ textAlign: "right" }}>Reading</th>
              <th style={{ textAlign: "right" }}>To danger</th>
            </tr>
          </thead>
          <tbody>
            {ov.raised.map((s) => (
              <tr key={s.station.id}>
                <td>{s.station.name}</td>
                <td>
                  {s.station.district}, {tc(s.station.state)}
                </td>
                <td className={`lv-${s.level}`}>
                  <span className="dot" aria-hidden /> {LEVEL_WORD[s.level!].en}
                </td>
                <td className="n">{m(s.station.level)}</td>
                <td className="n">{s.toDanger === null ? "—" : s.toDanger <= 0 ? `+${m(-s.toDanger)}` : m(s.toDanger)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="bs" style={{ maxWidth: "40rem", marginTop: "2.5rem" }}>
        <h2 id="bs">By state, least reliable first</h2>
        <table className="plain">
          <thead>
            <tr>
              <th>State</th>
              <th style={{ textAlign: "right" }}>Trustworthy</th>
              <th style={{ textAlign: "right" }}>Of</th>
              <th style={{ textAlign: "right" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {states.map(([st, b]) => (
              <tr key={st}>
                <td>{tc(st)}</td>
                <td className="n">{b.trusted}</td>
                <td className="n">{b.total}</td>
                <td className="n">{Math.round((100 * b.trusted) / b.total)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ maxWidth: "var(--measure)", marginTop: "2.5rem" }}>
        <h2>About the government open-data API</h2>
        <p>
          Malaysia&apos;s open-data portal also offers this river data as an API (api.data.gov.my/flood-warning). When we
          checked on 25 November 2026, every one of its 561 water-level stations had a last reading of 23 February 2024.
          Apps built on it would show 21-month-old levels. JagaBanjir reads the live JPS feed instead.
        </p>
      </section>

      <style>{`
        .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .6rem 1.5rem; margin: .8rem 0 0; font-size: var(--step--1); }
        .legend dt { font-weight: 700; display: flex; align-items: center; gap: .4rem; }
        .legend dd { margin: 0; color: var(--ink-2); }
        .legend .n { font-family: var(--gauge); font-size: 1.15rem; color: var(--ink); font-weight: 700; }
        .sw { width: .9rem; height: .9rem; display: inline-block; border: 1px solid var(--ink); }
        td .dot { vertical-align: middle; }
      `}</style>
    </>
  );
}

const DEF: Record<Trust, string> = {
  live: "reported in the last 75 minutes",
  delayed: "last report 75 minutes to 6 hours ago",
  suspect: "reading looks impossible (0 m, far below normal, or a 2 m jump)",
  stale: "nothing for more than 6 hours",
  broken: "no level, or JPS marks it faulty",
};

function tc(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
