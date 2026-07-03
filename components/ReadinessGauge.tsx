import type { ReadinessStatus } from "@/lib/types";

const COLORS: Record<ReadinessStatus, string> = {
  Green: "#34d399",
  Yellow: "#fbbf24",
  Red: "#fb5d6b",
};

// Semicircular gauge: needle sweeps 0 (left) -> 100 (right), dark theme + glow.
export function ReadinessGauge({ score, status }: { score: number; status: ReadinessStatus }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = -90 + (clamped / 100) * 180;
  const color = COLORS[status];
  const cx = 100, cy = 100, r = 80;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 124" className="w-64" role="img" aria-label={`Readiness ${status}, ${clamped} of 100`}>
        <defs>
          <linearGradient id="gaugeFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d={arc(cx, cy, r, -90, 90)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
        <path d={arc(cx, cy, r, -90, angle)} fill="none" stroke="url(#gaugeFill)" strokeWidth="14" strokeLinecap="round" filter="url(#gaugeGlow)" />

        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx + r - 8} y2={cy} stroke={color} strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="6" fill={color} />
      </svg>

      <div className="-mt-5 text-center">
        <div className="text-5xl font-extrabold tabular-nums" style={{ color }}>{clamped}</div>
        <div className="mt-0.5 text-xs font-bold uppercase tracking-[0.2em]" style={{ color }}>{status}</div>
      </div>
    </div>
  );
}

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
