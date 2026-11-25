/** 24-hour line of our own logged readings, with the danger level for reference. */
export function Spark({
  points,
  danger,
  warning,
  alert,
  width = 320,
  height = 90,
}: {
  points: [string, number][];
  danger?: number | null;
  warning?: number | null;
  alert?: number | null;
  width?: number;
  height?: number;
}) {
  if (points.length < 2)
    return <p className="small muted">The 24-hour line appears after a few readings have been logged.</p>;
  const ts = points.map((p) => Date.parse(p[0]));
  const vs = points.map((p) => p[1]);
  const refs = [danger, warning, alert].filter((v): v is number => v != null);
  const lo = Math.min(...vs, ...refs.filter((r) => r <= Math.max(...vs) + 1)) - 0.1;
  const hi = Math.max(...vs, ...refs.filter((r) => r <= Math.max(...vs) + 1)) + 0.1;
  const x = (t: number) => ((t - ts[0]) / Math.max(1, ts[ts.length - 1] - ts[0])) * (width - 8) + 4;
  const y = (v: number) => height - 16 - ((v - lo) / Math.max(0.01, hi - lo)) * (height - 24);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const ref = (v: number | null | undefined, c: string) =>
    v != null && v >= lo && v <= hi ? <line x1={0} x2={width} y1={y(v)} y2={y(v)} stroke={c} strokeDasharray="4 3" /> : null;
  const hrs = Math.round((ts[ts.length - 1] - ts[0]) / 3600_000);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} role="img"
        aria-label={`Water level over the last ${hrs} hours, from ${vs[0].toFixed(2)} to ${vs[vs.length - 1].toFixed(2)} metres`}>
        {ref(alert, "var(--alert)")}
        {ref(warning, "var(--warning)")}
        {ref(danger, "var(--danger)")}
        <path d={d} fill="none" stroke="var(--river)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(ts[ts.length - 1])} cy={y(vs[vs.length - 1])} r="4" fill="var(--river)" />
        <text x="4" y={height - 2} fontSize="11" fill="var(--ink-2)">{hrs} h ago</text>
        <text x={width - 4} y={height - 2} fontSize="11" fill="var(--ink-2)" textAnchor="end">now</text>
      </svg>
    </figure>
  );
}
