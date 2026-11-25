"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "@/components/Gauge";
import replay from "@/data/replay.json";
import { LANGS } from "@/lib/messages";
import type { Lang, Level, StationStatus } from "@/lib/types";
import { LEVEL_WORD, myt } from "@/lib/ui";

type Frame = { t: string; v: number; lv: string };
type Sent = { t: string; level: string; text: Record<Lang, string> };
const R = replay as unknown as {
  station: { id: string; name: string; district: string; state: string; river: string; thr: StationStatus["station"]["thr"] };
  frames: Frame[];
  sent: Sent[];
};

export default function Replay() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lang, setLang] = useState<Lang>("ms");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = R.frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setI((x) => (x >= last ? (setPlaying(false), x) : x + 1)), 180);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, last]);

  const f = R.frames[i];
  const now = Date.parse(f.t);
  const arrived = R.sent.filter((s) => Date.parse(s.t) <= now);
  const status: StationStatus = useMemo(
    () => ({
      station: {
        id: R.station.id, name: R.station.name, district: R.station.district, state: R.station.state,
        basin: "", river: R.station.river, lat: null, lon: null, level: f.v, updated: f.t, trend: null, jps: null,
        thr: R.station.thr, rain: null,
      },
      trust: { trust: "live", reason: "fresh", ageMinutes: 0 },
      level: f.lv as Level, levelSource: "thresholds", disagrees: false, toDanger: null,
      ratePerHour: null, etaDangerMin: null, usualHigh: null, routine: false,
    }),
    [f],
  );

  const firstAlert = R.sent.find((s) => s.level === "ALERT" && Date.parse(s.t) > Date.parse(R.sent[0].t));
  const danger = R.sent.find((s) => s.level === "DANGER");
  const leadH = firstAlert && danger ? (Date.parse(danger.t) - Date.parse(firstAlert.t)) / 3600_000 : null;

  return (
    <>
      <h1>Replay a flood</h1>
      <p style={{ fontSize: "var(--step-1)", maxWidth: "40rem" }}>
        Sg. Langat at Bukit Changgang, Kuala Langat, Selangor, 23–25 November 2026. These are JPS&apos;s real readings,
        run through JagaBanjir&apos;s rules one at a time. The messages on the right are exactly what a family watching this
        gauge would have received, and when.
      </p>

      <div className="rp">
        <div>
          <p className={`lv-${f.lv} clock`}>
            <span className="dot" aria-hidden />
            <span>
              <strong>{myt(f.t)}</strong> — {f.v.toFixed(2)} m, {LEVEL_WORD[f.lv as Level].en}
            </span>
          </p>
          <Gauge s={status} height={380} />
          <div className="row" style={{ marginTop: "1rem", alignItems: "center" }}>
            <button className="btn" onClick={() => (i >= last ? (setI(0), setPlaying(true)) : setPlaying(!playing))}>
              {playing ? "Pause" : i >= last ? "Play again" : i === 0 ? "Play" : "Resume"}
            </button>
            <label className="sr" htmlFor="scrub">Time</label>
            <input id="scrub" type="range" min={0} max={last} value={i} onChange={(e) => (setPlaying(false), setI(+e.target.value))} style={{ flex: "1 1 10rem", accentColor: "var(--river)" }} />
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: ".8rem", alignItems: "center" }}>
            <span className="small">Messages in</span>
            {LANGS.map((l) => (
              <button key={l.code} className={`lang ${l.code === lang ? "on" : ""}`} onClick={() => setLang(l.code)} aria-pressed={l.code === lang}>
                {l.native}
              </button>
            ))}
          </div>
          <div className="phone" aria-live="polite">
            {arrived.length === 0 && <p className="small muted">No messages yet. The river is normal.</p>}
            {[...arrived].reverse().map((s) => (
              <div key={s.t} style={{ marginBottom: "1rem" }}>
                <div className="small muted" style={{ marginBottom: ".2rem" }}>{myt(s.t)}</div>
                <div className="msg" lang={lang}>{s.text[lang]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section style={{ maxWidth: "var(--measure)", marginTop: "2.5rem" }}>
        <h2>What this shows</h2>
        <p>
          Over {Math.round((Date.parse(R.frames[last].t) - Date.parse(R.frames[0].t)) / 3600_000)} hours the gauge took{" "}
          {R.frames.length} readings. The family would have received {R.sent.length} messages.
          {leadH !== null && ` The evening alert came ${Math.floor(leadH)} hours ${Math.round((leadH % 1) * 60)} minutes before the river reached danger level.`}{" "}
          Once at danger, the river stayed there, and no further messages were sent until it drops.
        </p>
        <p className="small muted">
          JPS sends gaps (missing readings) for this gauge; the replay skips them. Readings: JPS Public InfoBanjir 7-day record,
          downloaded 25 November 2026.
        </p>
      </section>

      <style>{`
        .rp { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 2.5rem; align-items: start; }
        @media (max-width: 760px) { .rp { grid-template-columns: 1fr; } }
        .clock { display: flex; gap: .6rem; align-items: center; font-size: var(--step-0); margin: 0 0 .8rem; }
        .phone { background: #e9e3da; border-radius: 1rem; padding: 1rem; min-height: 24rem; max-height: 34rem; overflow: auto; max-width: 32rem; }
        .lang { font: inherit; border: 2px solid var(--line); background: var(--paper); border-radius: .5rem; padding: .35rem .7rem; cursor: pointer; min-height: 2.5rem; }
        .lang.on { border-color: var(--ink); font-weight: 700; }
      `}</style>
    </>
  );
}
