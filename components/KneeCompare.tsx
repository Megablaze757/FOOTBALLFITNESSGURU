// Front-view knee-tracking comparison: ideal alignment vs the athlete's, with
// the knees pulled medially in proportion to measured valgus. Pure SVG.
export function KneeCompare({ valgusLeft, valgusRight }: { valgusLeft: number; valgusRight: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Panel label="Ideal" color="#34d399" left={0} right={0} />
      <Panel label="You" color="#e3b53f" left={valgusLeft} right={valgusRight} muted />
    </div>
  );
}

function Panel({ label, color, left, right, muted }: { label: string; color: string; left: number; right: number; muted?: boolean }) {
  const S = 0.8; // px per degree of valgus (medial pull)
  const lKneeX = 36 + Math.min(22, left * S);
  const rKneeX = 84 - Math.min(22, right * S);
  const stroke = muted && (left > 8 || right > 8) ? "#fb5d6b" : color;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <svg viewBox="0 0 120 150" className="mx-auto h-40 w-full" role="img" aria-label={`${label} knee tracking`}>
        {/* pelvis */}
        <line x1={40} y1={22} x2={80} y2={22} stroke="#94a3b8" strokeWidth={4} strokeLinecap="round" />
        {/* left leg */}
        <Leg hipX={40} kneeX={lKneeX} ankleX={35} stroke={stroke} />
        {/* right leg */}
        <Leg hipX={80} kneeX={rKneeX} ankleX={85} stroke={stroke} />
        {/* target lines over the feet */}
        <line x1={35} y1={22} x2={35} y2={128} stroke="#ffffff" strokeOpacity={0.12} strokeDasharray="3 4" strokeWidth={2} />
        <line x1={85} y1={22} x2={85} y2={128} stroke="#ffffff" strokeOpacity={0.12} strokeDasharray="3 4" strokeWidth={2} />
      </svg>
      <div className="mt-1 text-center text-xs font-semibold" style={{ color: stroke }}>{label}</div>
    </div>
  );
}

function Leg({ hipX, kneeX, ankleX, stroke }: { hipX: number; kneeX: number; ankleX: number; stroke: string }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
      <line x1={hipX} y1={22} x2={kneeX} y2={76} />
      <line x1={kneeX} y1={76} x2={ankleX} y2={128} />
      <circle cx={kneeX} cy={76} r={5} fill={stroke} stroke="none" />
    </g>
  );
}
