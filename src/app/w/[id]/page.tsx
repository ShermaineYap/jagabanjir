"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Gauge } from "@/components/Gauge";
import { Spark } from "@/components/Spark";
import { LevelNumber, StationText } from "@/components/StationRow";
import { LANGS, forSpeech } from "@/lib/messages";
import type { HouseStatus, Lang } from "@/lib/types";
import { LEVEL_WORD, ago, isTrusted, m, myt } from "@/lib/ui";

interface WatchView {
  watch: { id: string; label: string; lat: number; lon: number; lang: Lang; telegram: boolean };
  fetchedAt: string;
  house: HouseStatus;
  message: string;
  checked: boolean;
  history: Record<string, [string, number][]>;
  telegram: { bot: string } | null;
  error?: string;
}

const LOCAL_WORD: Record<Lang, Record<string, string>> = {
  ms: { NORMAL: "Normal", ALERT: "Waspada", WARNING: "Amaran", DANGER: "Bahaya", UNKNOWN: "Tidak pasti" },
  zh: { NORMAL: "正常", ALERT: "警戒", WARNING: "警告", DANGER: "危险", UNKNOWN: "无法确认" },
  ta: { NORMAL: "இயல்பு", ALERT: "விழிப்பு", WARNING: "எச்சரிக்கை", DANGER: "அபாயம்", UNKNOWN: "உறுதியில்லை" },
  en: { NORMAL: "Normal", ALERT: "Alert", WARNING: "Warning", DANGER: "Danger", UNKNOWN: "Can't tell" },
};

const ADVICE: Record<string, string> = {
  NORMAL: "The river is within its normal range. Nothing to do.",
  ALERT: "The river is up. A good time to call and check they have documents, medicine and a charged phone ready.",
  WARNING: "The river is close to danger level. Help them get ready to leave: power off if water enters, car to high ground.",
  DANGER: "The river is at danger level. They should move to a relief centre (PPS) or high ground now. In an emergency, call 999.",
  UNKNOWN: "None of the chosen gauges is sending usable data, so we will not guess. Call them or a neighbour if it is raining hard.",
};

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [v, setV] = useState<WatchView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/watch/${id}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : (setErr(null), setV(j))))
      .catch(() => setErr("Could not load. Check your connection."));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (err && !v) return <p className="err">{err}</p>;
  if (!v) return <p className="muted">Loading the river gauges…</p>;

  const lang = v.watch.lang;
  const level = v.house.level;
  const deciding =
    v.house.statuses.find((s) => s.station.id === v.house.decidingId) ??
    v.house.statuses.find((s) => s.station.level !== null) ??
    v.house.statuses[0];
  const speechLang = LANGS.find((l) => l.code === lang)!.speech;

  function speak() {
    const synth = window.speechSynthesis;
    if (!synth) return setVoiceNote("This browser cannot read aloud.");
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const voices = synth.getVoices();
    const voice =
      voices.find((x) => x.lang === speechLang) ?? voices.find((x) => x.lang.startsWith(speechLang.slice(0, 2)));
    if (!voice && lang !== "en")
      setVoiceNote(
        `This phone has no ${LANGS.find((l) => l.code === lang)!.name} voice installed, so it may read badly. Install one in your phone's text-to-speech settings.`,
      );
    else setVoiceNote(null);
    const u = new SpeechSynthesisUtterance(forSpeech(v!.message));
    u.lang = speechLang;
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }

  async function setLang(l: Lang) {
    await fetch(`/api/watch/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: l }) });
    load();
  }

  async function remove() {
    if (!confirm("Stop watching this house and delete this link? Telegram alerts will stop too.")) return;
    await fetch(`/api/watch/${id}`, { method: "DELETE" });
    location.href = "/";
  }

  const hist = deciding ? v.history[deciding.station.id] ?? [] : [];

  return (
    <article className={`lv-${level}`}>
      <p className="small muted" style={{ marginBottom: ".3rem" }}>
        Watching
      </p>
      <h1 style={{ marginBottom: ".2rem" }}>{v.watch.label}</h1>

      <div className="status">
        <div className="badge">
          <span className="dot" style={{ width: "1.4rem", height: "1.4rem" }} aria-hidden />
          <div>
            <div className="word">{LOCAL_WORD[lang][level]}</div>
            {lang !== "en" && <div className="small muted">{LEVEL_WORD[level].en}</div>}
          </div>
        </div>
        <p style={{ margin: 0 }}>{ADVICE[level]}</p>
      </div>

      <div className="grid">
        <section aria-labelledby="msg-h">
          <h2 id="msg-h">Message for the family</h2>
          <div className="msg" lang={lang}>
            {v.message}
          </div>
          <p className="small muted" style={{ marginTop: ".5rem" }}>
            {v.checked
              ? "Checked: every number in this message matches the JPS reading."
              : "This message failed its number check and will not be sent."}
          </p>
          <div className="row" style={{ marginTop: ".8rem" }}>
            <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(v.message)}`} target="_blank" rel="noreferrer">
              Forward on WhatsApp
            </a>
            <button className="btn ghost" onClick={speak} aria-pressed={speaking}>
              {speaking ? "Stop reading" : "Read aloud"}
            </button>
            <button
              className="btn ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(v.message);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
          {voiceNote && <p className="small" style={{ marginTop: ".5rem" }}>{voiceNote}</p>}
          <div className="row" style={{ marginTop: "1rem", alignItems: "center" }}>
            <span className="small">Language:</span>
            {LANGS.map((l) => (
              <button key={l.code} className={`lang ${l.code === lang ? "on" : ""}`} onClick={() => setLang(l.code)} aria-pressed={l.code === lang}>
                {l.native}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: "2rem" }}>Get told when it changes</h3>
          {v.watch.telegram ? (
            <p>Telegram alerts are on for this house. Send /stop to the bot to turn them off.</p>
          ) : v.telegram ? (
            <>
              <p className="small">
                You&apos;ll get one message when the level goes up, and one when it is back to normal. No repeats.
              </p>
              <a className="btn tg" href={`https://t.me/${v.telegram.bot}?start=${v.watch.id}`} target="_blank" rel="noreferrer">
                Get alerts on Telegram
              </a>
            </>
          ) : (
            <p className="small muted">Alerts are not switched on for this site yet. Bookmark this page; it refreshes every 5 minutes.</p>
          )}
        </section>

        {deciding && (
          <section aria-labelledby="gauge-h" className="gauge-col">
            <h2 id="gauge-h" className="sr">
              River gauge
            </h2>
            <Gauge s={deciding} height={360} />
            <p className="small" style={{ marginTop: ".5rem" }}>
              <strong>{deciding.station.name}</strong>
              <br />
              {m(deciding.station.level)} at {myt(deciding.station.updated)}
              {deciding.station.trend ? `, ${deciding.station.trend}` : ""}
              {deciding.toDanger !== null && isTrusted(deciding) && (
                <>
                  <br />
                  {deciding.toDanger > 0 ? `${m(deciding.toDanger)} below danger level` : `${m(-deciding.toDanger)} above danger level`}
                </>
              )}
              {deciding.ratePerHour !== null && isTrusted(deciding) && (
                <>
                  <br />
                  {deciding.ratePerHour >= 0 ? "Rising" : "Falling"} {Math.abs(deciding.ratePerHour).toFixed(2)} m per hour
                  {deciding.etaDangerMin !== null && deciding.etaDangerMin < 24 * 60
                    ? `; at this rate it would reach danger in about ${fmtEta(deciding.etaDangerMin)} (a rough guide, not a forecast)`
                    : ""}
                </>
              )}
            </p>
            <Spark points={hist} danger={deciding.station.thr?.danger} warning={deciding.station.thr?.warning} alert={deciding.station.thr?.alert} width={260} />
          </section>
        )}
      </div>

      <section aria-labelledby="st-h" style={{ marginTop: "2.5rem", maxWidth: "46rem" }}>
        <h2 id="st-h">Gauges being watched</h2>
        <ul className="stations">
          {v.house.statuses.map((s) => (
            <li key={s.station.id}>
              <div className="r">
                <span className={`lv-${isTrusted(s) && s.level ? s.level : "UNKNOWN"}`}>
                  <span className="dot" aria-hidden style={{ marginTop: ".45rem" }} />
                </span>
                <div>
                  <StationText s={s} />
                </div>
                <LevelNumber s={s} />
              </div>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ marginTop: ".8rem" }}>
          Data from JPS Public InfoBanjir, checked {ago(Math.round((Date.now() - Date.parse(v.fetchedAt)) / 60000))}. The house
          takes the highest level among gauges with trustworthy data; if none is trustworthy it says &ldquo;can&apos;t
          tell&rdquo;, never &ldquo;normal&rdquo;.
        </p>
        <div className="row" style={{ marginTop: "1.2rem" }}>
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(location.href)}>
            Copy link to this page
          </button>
          <button className="btn ghost" onClick={remove}>
            Stop watching
          </button>
        </div>
      </section>

      <style>{`
        .status { display: flex; gap: 1.2rem; align-items: center; flex-wrap: wrap; margin: 1rem 0 2rem; padding: 1rem 1.2rem; background: var(--paper); border-left: 8px solid var(--lv); max-width: 46rem; }
        .badge { display: flex; gap: .8rem; align-items: center; }
        .word { font-family: var(--gauge); font-weight: 700; font-size: var(--step-3); line-height: 1; }
        .grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 2.5rem; align-items: start; }
        @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
        .lang { font: inherit; border: 2px solid var(--line); background: var(--paper); border-radius: .5rem; padding: .35rem .7rem; cursor: pointer; min-height: 2.5rem; }
        .lang.on { border-color: var(--ink); font-weight: 700; }
      `}</style>
    </article>
  );
}

function fmtEta(min: number) {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const r = Math.round((min % 60) / 15) * 15;
  return r ? `${h} h ${r} min` : `${h} h`;
}
