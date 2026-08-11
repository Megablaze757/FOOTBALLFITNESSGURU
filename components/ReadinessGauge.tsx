import type { ReadinessStatus } from "@/lib/types";
import { gaugeAngle, arc, GAUGE_START_DEG, GAUGE_END_DEG } from "@/lib/gauge";

const COLORS: Record<ReadinessStatus, string> = {
  Green: "#34d399",
  Yellow: "#fbbf24",
  Red: "#fb5d6b",
};

/**
 * Semicircular gauge: needle sweeps 0 (left) -> 100 (right), dark theme + glow.
 *
 * THE SWEEP USED TO BE A QUARTER-TURN OUT, and the comment above was the giveaway
 * — it described the intent while the code did something else. `-90 + pct * 180`
 * runs from straight UP at 0, through right at 50, to straight DOWN at 100: a
 * right-facing semicircle, not the speedometer this is meant to be.
 *
 * In SVG angles, 0° points right and positive turns clockwise (y grows
 * downward), so left->top->right is 180° -> 270° -> 360°.
 *
 * Half of it was also invisible. The viewBox is 124 tall and the geometry ran to
 * y=180, so everything past a score of ~53 was clipped off the bottom. A typical
 * readiness of 81 put the needle tip at (140, 159) — outside the canvas, pointing
 * down and to the right, straight through where the number is drawn. That is the
 * "line overlaps the number" this fixes; the needle was never overlapping the
 * digits so much as escaping the gauge entirely.
 */
export function ReadinessGauge({ score, status }: { score: number; status: ReadinessStatus }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = gaugeAngle(clamped);
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

        <path d={arc(cx, cy, r, GAUGE_START_DEG, GAUGE_END_DEG)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
        <path d={arc(cx, cy, r, GAUGE_START_DEG, angle)} fill="none" stroke="url(#gaugeFill)" strokeWidth="14" strokeLinecap="round" filter="url(#gaugeGlow)" />

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

// arc() and polar() moved to lib/gauge.ts — see the note there. They were
// unreachable by the test suite while they lived in this file, which is how the
// sweep stayed a quarter-turn out for as long as it did.
