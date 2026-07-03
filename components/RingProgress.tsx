// Circular progress ring (SVG). Used for program completion / progress-to-target.
export function RingProgress({
  pct,
  color = "#a3e635",
  size = 84,
  stroke = 8,
  label,
  sub,
}: {
  pct: number; // 0..100
  color?: string;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circ * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-lg font-extrabold leading-none" style={{ color }}>{label ?? `${Math.round(clamped)}%`}</div>
        {sub && <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}
