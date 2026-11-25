import type { StationStatus } from "@/lib/types";
import { LEVEL_WORD, TRUST_WORD, isTrusted, m, trustSentence } from "@/lib/ui";

export function TrustChip({ s }: { s: StationStatus }) {
  return <span className={`chip trust-${s.trust.trust}`}>{TRUST_WORD[s.trust.trust]}</span>;
}

export function LevelCell({ s }: { s: StationStatus }) {
  const ok = isTrusted(s);
  const lv = ok && s.level ? s.level : "UNKNOWN";
  return (
    <span className={`lv-${lv}`} style={{ display: "inline-flex", gap: ".4rem", alignItems: "center" }}>
      <span className="dot" aria-hidden />
      {ok && s.level ? LEVEL_WORD[s.level].en : "—"}
    </span>
  );
}

/** Text shared by the setup list and the watch page. */
export function StationText({ s, km }: { s: StationStatus; km?: number }) {
  const st = s.station;
  return (
    <>
      <div className="name">{st.name}</div>
      <div className="meta">
        {st.river ? `${st.river}, ` : ""}
        {st.district}
        {km !== undefined ? ` — ${km} km away` : ""}
      </div>
      <div className="meta" style={{ marginTop: ".3rem", display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <TrustChip s={s} /> <span>{trustSentence(s.trust)}</span>
      </div>
      {isTrusted(s) && s.levelSource === "jps" && (
        <div className="meta">JPS has not published this station&apos;s thresholds, so the level shown is JPS&apos;s own label.</div>
      )}
      {s.usualHigh !== null && st.thr?.alert != null && s.usualHigh >= st.thr.alert && (
        <div className="meta">
          Tidal or regulated: on most days this gauge already reaches {s.usualHigh.toFixed(2)} m. Alert and warning at that
          height are treated as routine; danger is always sent, so expect messages around high tide in king-tide season.
        </div>
      )}
      {s.routine && <div className="meta">Right now it is within its usual daily high.</div>}
      {s.disagrees &&<div className="meta">Our reading of the thresholds differs from JPS&apos;s label here; we show the more cautious one.</div>}
    </>
  );
}

export function LevelNumber({ s }: { s: StationStatus }) {
  return (
    <div className="lvl">
      {m(s.station.level)}
      <div className="small muted" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>
        <LevelCell s={s} />
      </div>
    </div>
  );
}
