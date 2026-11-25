"use client";
import { useEffect, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { Setup } from "@/components/Setup";
import type { StationStatus, Trust } from "@/lib/types";
import { LEVEL_WORD, ago, m } from "@/lib/ui";

interface Overview {
  fetchedAt: string;
  total: number;
  counts: Record<Trust, number>;
  raisedCount: number;
  falseAlarmCount: number;
  featured: StationStatus | null;
  error?: string;
}

export default function Home() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setOv(j)))
      .catch(() => setErr("Could not load the river data. Check your connection and reload."));
  }, []);

  const f = ov?.featured;
  const trusted = ov ? ov.counts.live + ov.counts.delayed : 0;

  return (
    <>
      <section
        aria-labelledby="hero"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "2rem", alignItems: "center", marginBottom: "3rem" }}
        className="hero"
      >
        <div>
          <h1 id="hero" style={{ fontSize: "var(--step-4)", lineHeight: 1.02, maxWidth: "14ch" }}>
            Know when the river by your parents&apos; house is rising.
          </h1>
          <p style={{ fontSize: "var(--step-1)" }}>
            JagaBanjir watches the JPS river gauge nearest their home and sends you a short message in their language —
            Bahasa Melayu, 中文, தமிழ் or English — ready to forward on WhatsApp or read aloud.
          </p>
          {err && <p className="err">{err}</p>}
          {f && (
            <p className={`notice lv-${f.level}`}>
              <strong>Right now:</strong> {f.station.name} ({f.station.district}, {titleCase(f.station.state)}) reads{" "}
              {m(f.station.level)}, which is <strong>{LEVEL_WORD[f.level!].en}</strong> level
              {f.toDanger !== null ? (f.toDanger <= 0 ? `, ${m(-f.toDanger)} above danger` : `, ${m(f.toDanger)} below danger`) : ""}.
              Reported {ago(f.trust.ageMinutes)}.
            </p>
          )}
          {ov && (
            <p className="small muted">
              Of {ov.total.toLocaleString()} JPS river gauges, {trusted.toLocaleString()} are sending readings we can trust
              right now, and {ov.falseAlarmCount} still show an alarm colour on stale or faulty data.{" "}
              <a href="/sensors">See the sensor check</a>.
            </p>
          )}
          {!ov && !err && <p className="small muted">Loading live river levels from JPS…</p>}
        </div>
        <div className="hero-gauge" style={{ width: 220 }}>
          {f && (
            <figure style={{ margin: 0 }}>
              <Gauge s={f} height={380} />
              <figcaption className="small muted" style={{ marginTop: ".4rem", maxWidth: 220 }}>
                {f.station.name}, live from JPS
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      <Setup />

      <style>{`
        @media (max-width: 720px) {
          .hero { grid-template-columns: 1fr !important; }
          .hero-gauge { justify-self: start; }
          .hero h1 { font-size: var(--step-3) !important; }
        }
      `}</style>
    </>
  );
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
