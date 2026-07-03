import type { DayPoint } from "@/lib/history";

// Compact SVG bar chart for a daily series. Dark theme, gradient fill.
export function MiniBars({
  data,
  color = "#a3e635",
  unit = "",
  height = 96,
}: {
  data: DayPoint[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  if (!data.length) {
    return <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-xs text-slate-500">No data yet.</p>;
  }

  const W = 320;
  const PAD = { top: 8, bottom: 16, x: 4 };
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const gap = 2;
  const bw = (W - PAD.x * 2) / n - gap;

  const last = data[data.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="History chart">
        <defs>
          <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = PAD.x + i * (bw + gap);
          const y = PAD.top + innerH - h;
          return <rect key={i} x={x} y={y} width={Math.max(1, bw)} height={Math.max(1, h)} rx={Math.min(3, bw / 2)} fill={`url(#g-${color})`} />;
        })}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-slate-500">
        <span>{data[0].date.slice(5)}</span>
        <span className="font-semibold" style={{ color }}>
          latest {last.value}
          {unit}
        </span>
        <span>{last.date.slice(5)}</span>
      </div>
    </div>
  );
}
