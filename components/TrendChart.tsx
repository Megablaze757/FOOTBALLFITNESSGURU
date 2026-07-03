import type { TrendPoint } from "@/lib/trends";

// Multi-series line chart over the check-in window. Pain and sleep share a 0-10
// left scale; readiness (0-100) is mapped onto the same axis (÷10) and drawn as
// the trend line. Pure SVG, no chart dependency.
const SERIES = [
  { key: "maxPain", label: "Pain", color: "#fb5d6b", scale: 10 },
  { key: "sleep", label: "Sleep", color: "#38bdf8", scale: 10 },
  { key: "readinessScore", label: "Readiness", color: "#a3e635", scale: 100 },
] as const;

const W = 320;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 24 };

export function TrendChart({ series }: { series: TrendPoint[] }) {
  if (series.length < 2) {
    return (
      <p className="rounded-2xl bg-white/[0.04] px-4 py-8 text-center text-sm text-slate-500">
        Log at least two check-ins to see trends.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = series.length;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / 10) * innerH; // shared 0-10 axis

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Recovery trends">
        {/* y gridlines at 0,5,10 */}
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line x1={PAD.left} y1={y(g)} x2={W - PAD.right} y2={y(g)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <text x={PAD.left - 4} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
              {g}
            </text>
          </g>
        ))}

        {SERIES.map((s) => {
          const d = series
            .map((p, i) => {
              const raw = (p as unknown as Record<string, number | null>)[s.key];
              if (raw == null) return null;
              const v = (raw / s.scale) * 10; // normalise to 0-10
              return `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
            })
            .filter(Boolean)
            .join(" ");
          return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
        })}

        {/* sparse date labels: first, middle, last */}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#94a3b8">
            {series[i].date.slice(5)}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex justify-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
