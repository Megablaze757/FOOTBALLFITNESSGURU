/**
 * Rank insignia — a hexagonal tier plate with division marks.
 *
 * ON THE REFERENCE. These were asked for after a preview image of a commercial
 * military-insignia asset pack. Nothing here is traced or copied from it: that
 * artwork belongs to whoever sells it, and a watermarked preview is not a
 * licence. What IS borrowed is the visual language — a coloured tier plate,
 * marks that count up within a tier, and a hardware progression from chevrons
 * to stars — and that is centuries-old military convention rather than anyone's
 * intellectual property. Drawn from scratch, so there is nothing to license and
 * nothing to attribute.
 *
 * WHY IT BEATS THE MEDAL EMOJI IT REPLACES. There were three medal glyphs for
 * nine tiers, so six tiers shared a picture with a tier they had nothing to do
 * with, and the colour calibrated for each tier in lib/gamification.ts was
 * thrown away because an emoji cannot be recoloured. Now the plate IS the tier
 * colour and the marks ARE the division, so a rank is legible at a glance and
 * at 24px — which is the size it appears at on Home.
 *
 * THE PROGRESSION IS THE POINT. A ladder where every rung looks the same is not
 * a ladder. The mark changes shape as you climb — chevrons, then bars, then
 * diamonds, then stars, then a star with wings — so moving from Gold to
 * Platinum is visibly a promotion and not just a different colour.
 */
import type { TierName } from "@/lib/gamification";

type MarkKind = "chevron" | "bar" | "diamond" | "star" | "winged";

/** Which hardware a tier wears. Ordered the way the ladder is climbed. */
const MARK_FOR: Record<TierName, MarkKind> = {
  Iron: "chevron",
  Bronze: "chevron",
  Silver: "bar",
  Gold: "bar",
  Platinum: "diamond",
  Emerald: "diamond",
  Diamond: "star",
  Champion: "star",
  Legend: "winged",
};

/** "I" -> 1 … "IV" -> 4. An empty division (the open-ended top tier) shows one. */
function markCount(division: string): number {
  const n = { I: 1, II: 2, III: 3, IV: 4 }[division.trim()];
  return n ?? 1;
}

function Star({ x, y, r }: { x: number; y: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + rr * Math.cos(rad)).toFixed(2)},${(y + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return <polygon points={pts.join(" ")} />;
}

function Marks({ kind, count, y }: { kind: MarkKind; count: number; y: number }) {
  // Laid out from the centre so one mark and four marks are both balanced.
  const gap = kind === "star" || kind === "winged" ? 9 : 8;
  const xs = Array.from({ length: count }, (_, i) => 32 + (i - (count - 1) / 2) * gap);

  if (kind === "chevron") {
    return <>{xs.map((x, i) => <path key={i} d={`M${x - 3.4} ${y - 2} L${x} ${y + 2.2} L${x + 3.4} ${y - 2}`} fill="none" strokeWidth={2.2} />)}</>;
  }
  if (kind === "bar") {
    return <>{xs.map((x, i) => <rect key={i} x={x - 3} y={y - 2.4} width={6} height={4.8} rx={1} />)}</>;
  }
  if (kind === "diamond") {
    return <>{xs.map((x, i) => <path key={i} d={`M${x} ${y - 4} L${x + 3.2} ${y} L${x} ${y + 4} L${x - 3.2} ${y} Z`} />)}</>;
  }
  return <>{xs.map((x, i) => <Star key={i} x={x} y={y} r={4.4} />)}</>;
}

export function RankBadge({
  tier,
  division = "",
  color,
  size = 44,
  className = "",
  title,
}: {
  tier: TierName;
  division?: string;
  color: string;
  size?: number;
  className?: string;
  /** Only when the badge stands alone; beside the rank name it is decorative. */
  title?: string;
}) {
  const kind = MARK_FOR[tier] ?? "chevron";
  const count = markCount(division);
  const id = `rank-${tier}`.toLowerCase();

  return (
    <svg
      width={size}
      height={size * (72 / 64)}
      viewBox="0 0 64 72"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="55%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* The plate. Dark underneath so the face reads on a dark page whatever
          the tier colour is — a light tier over a light fill loses the marks. */}
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill="#0b0b0f" />
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill={`url(#${id}-face)`} />
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill="none" stroke={`url(#${id}-rim)`} strokeWidth={3} strokeLinejoin="round" />
      {/* A second, inset edge — this is what reads as bevelled metal rather than
          a flat outline, and it costs one path. */}
      <path d="M32 9 53 20.5V47.5L32 59 11 47.5V20.5Z" fill="none" stroke={color} strokeOpacity="0.28" strokeWidth={1.2} strokeLinejoin="round" />

      <g fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
        <Marks kind={kind} count={count} y={kind === "chevron" ? 33 : 34} />
      </g>

      {/* Wings, top tier only. The ladder's last promotion should look like one. */}
      {kind === "winged" && (
        <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" opacity="0.9">
          <path d="M20 45c-4.5 0-7.5 1.6-9.5 3.6M20 49.5c-3.4 0-5.8 1.2-7.4 2.8" />
          <path d="M44 45c4.5 0 7.5 1.6 9.5 3.6M44 49.5c3.4 0 5.8 1.2 7.4 2.8" />
        </g>
      )}
      {/* The base bar. Present on every tier so the set reads as one family. */}
      <path d="M23 45h18" stroke={color} strokeOpacity="0.75" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}
