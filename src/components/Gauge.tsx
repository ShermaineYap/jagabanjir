import type { StationStatus } from "@/lib/types";
import { LEVEL_WORD, isTrusted } from "@/lib/ui";

/**
 * A JPS-style river gauge board: the striped staff painted on bridge piers,
 * with the alert / warning / danger bands beside it and the water drawn to the reading.
 */
export function Gauge({ s, height = 360 }: { s: StationStatus; height?: number }) {
  const st = s.station;
  const t = st.thr;
  const level = st.level;
  const trusted = isTrusted(s);
  const refs = [level, t?.normal, t?.alert, t?.warning, t?.danger].filter((v): v is number => v != null);
  if (refs.length === 0) return null;
  let lo = Math.min(...refs);
  let hi = Math.max(...refs);
  const span = Math.max(hi - lo, 1);
  lo = Math.floor((lo - span * 0.35) * 2) / 2;
  hi = Math.ceil((hi + span * 0.25) * 2) / 2;

  const W = 220;
  const H = height;
  const top = 14;
  const bottom = H - 14;
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const staffX = 70;
  const staffW = 34;
  const bandX = staffX + staffW + 6;

  // staff markings every 10 cm, numbers every metre (or 0.5 m on short ranges)
  const step = 0.1;
  const marks: { v: number; major: boolean }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const r = Math.round(v * 10) / 10;
    marks.push({ v: r, major: Math.abs(r - Math.round(r)) < 1e-6 });
  }
  const labelEvery = hi - lo > 6 ? 1 : 0.5;

  const bands =
    t && t.alert != null && t.warning != null && t.danger != null
      ? [
          { from: lo, to: t.alert, c: "var(--normal)", k: "NORMAL" as const },
          { from: t.alert, to: t.warning, c: "var(--alert)", k: "ALERT" as const },
          { from: t.warning, to: t.danger, c: "var(--warning)", k: "WARNING" as const },
          { from: t.danger, to: hi, c: "var(--danger)", k: "DANGER" as const },
        ]
      : [];

  const water = level !== null ? y(Math.max(lo, Math.min(hi, level))) : null;
  const waterFill = trusted ? "var(--river)" : "url(#hatch)";
  const title = `${st.name}: ${level !== null ? level.toFixed(2) + " m" : "no reading"}${
    s.level ? `, ${LEVEL_WORD[s.level].en} level` : ""
  }${trusted ? "" : " (reading not trusted)"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img" aria-label={title}>
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#d8dcdf" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#9aa1a8" strokeWidth="3" />
        </pattern>
        <clipPath id="staffclip">
          <rect x={staffX} y={top} width={staffW} height={bottom - top} rx="2" />
        </clipPath>
      </defs>

      {/* bands */}
      {bands.map((b) => (
        <g key={b.k}>
          <rect
            x={bandX}
            y={y(Math.min(b.to, hi))}
            width={16}
            height={Math.max(0, y(Math.max(b.from, lo)) - y(Math.min(b.to, hi)))}
            fill={b.c}
            opacity={trusted ? 1 : 0.35}
          />
        </g>
      ))}
      {bands.slice(1).map((b) => (
        <g key={`l-${b.k}`}>
          <line x1={staffX - 4} x2={bandX + 22} y1={y(b.from)} y2={y(b.from)} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={bandX + 24} y={y(b.from) + 4} fontSize="12" fill="var(--ink-2)" fontFamily="var(--body)">
            {LEVEL_WORD[b.k].en} {b.from.toFixed(2)}
          </text>
        </g>
      ))}

      {/* staff board */}
      <rect x={staffX} y={top} width={staffW} height={bottom - top} fill="#fff" stroke="var(--ink)" strokeWidth="1.5" rx="2" />
      <g clipPath="url(#staffclip)">
        {marks.map((mk, i) => (
          <rect
            key={i}
            x={staffX}
            y={y(mk.v + step / 2)}
            width={i % 5 < 3 ? staffW * 0.62 : staffW * 0.34}
            height={Math.max(1, y(mk.v) - y(mk.v + step / 2))}
            fill={mk.major ? "var(--danger)" : "var(--ink)"}
          />
        ))}
        {water !== null && (
          <g>
            <rect x={staffX} y={water} width={staffW} height={bottom - water} fill={waterFill} opacity={trusted ? 0.72 : 0.9} />
          </g>
        )}
      </g>
      {marks
        .filter((mk) => Math.abs(mk.v / labelEvery - Math.round(mk.v / labelEvery)) < 1e-6)
        .map((mk) => (
          <text key={`n${mk.v}`} x={staffX - 8} y={y(mk.v) + 4} fontSize="13" textAnchor="end" fill="var(--ink-2)" fontFamily="var(--gauge)">
            {mk.v.toFixed(labelEvery < 1 ? 1 : 0)}
          </text>
        ))}

      {/* water surface beyond the staff */}
      {water !== null && (
        <g>
          <path
            className={trusted ? "wave" : undefined}
            d={`M ${staffX - 30} ${water} q 10 -4 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0`}
            fill="none"
            stroke={trusted ? "var(--river)" : "#8a9199"}
            strokeWidth="2.5"
            strokeDasharray={trusted ? undefined : "5 4"}
          />
        </g>
      )}
    </svg>
  );
}
