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

type MarkKind = "chevron" | "bar" | "diamond" | "star" | "winged" | "laurel" | "crown";

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
  // The two standing tiers. Wings were the old summit, so these have to read as
  // beyond it at a glance: a laurel is the classical mark of a victor, and only
  // one athlete ever wears the crown.
  Elite: "laurel",
  Apex: "crown",
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

/**
 * A laurel branch, mirrored to make a wreath.
 *
 * Drawn as an arc with leaves hung off it rather than as one filled shape,
 * because a filled wreath turns into a blob at 24px — which is the size this
 * appears at on Home, and the size that decides whether the design works.
 */
function Laurel({ color }: { color: string }) {
  const branch = (dir: 1 | -1) => {
    const leaves = [0.18, 0.42, 0.66, 0.88].map((t, i) => {
      // Along the arc, angled outward so the wreath opens upward like a victor's.
      const x = 32 + dir * (9 + t * 8);
      const y = 44 - t * 17;
      return (
        <ellipse
          key={i}
          cx={x} cy={y} rx={3.1} ry={1.7}
          transform={`rotate(${dir * (58 - t * 26)} ${x} ${y})`}
          fill={color} fillOpacity={0.92} stroke="none"
        />
      );
    });
    return (
      <g key={dir}>
        <path
          d={`M${32 + dir * 7} 47 Q${32 + dir * 15} 40 ${32 + dir * 17} 27`}
          fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeOpacity={0.85}
        />
        {leaves}
      </g>
    );
  };
  return <g>{branch(-1)}{branch(1)}</g>;
}

/** Five points, because three reads as a jester's hat and seven as a scribble. */
function Crown({ color }: { color: string }) {
  return (
    <g fill={color} stroke="none">
      <path d="M22 24 L26 29 L32 21.5 L38 29 L42 24 L42.6 32 L21.4 32 Z" />
      <circle cx="22" cy="22.4" r="1.9" />
      <circle cx="32" cy="19.6" r="2.1" />
      <circle cx="42" cy="22.4" r="1.9" />
    </g>
  );
}

/** Light coming off the emblem. Only the top tier gets it. */
function Rays({ color }: { color: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    const inner = 12.5;
    const outer = i % 2 === 0 ? 18.5 : 16;
    return (
      <line
        key={i}
        x1={(32 + inner * Math.cos(a)).toFixed(2)} y1={(38 + inner * Math.sin(a)).toFixed(2)}
        x2={(32 + outer * Math.cos(a)).toFixed(2)} y2={(38 + outer * Math.sin(a)).toFixed(2)}
        stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeOpacity={0.5}
      />
    );
  });
  return <g>{rays}</g>;
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
  // The two standing tiers get a brighter plate and an outer halo. Ornament
  // alone is not enough at 24px — at that size the difference a viewer actually
  // registers is that the whole badge is glowing.
  const standing = kind === "laurel" || kind === "crown";

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
        {standing && (
          // A soft bloom behind the plate. stdDeviation stays small so it reads
          // as a halo rather than a smear when the badge is scaled down.
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {standing && (
        <path
          d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z"
          fill="none" stroke={color} strokeOpacity="0.5" strokeWidth={2}
          filter={`url(#${id}-glow)`}
        />
      )}

      {/* The plate. Dark underneath so the face reads on a dark page whatever
          the tier colour is — a light tier over a light fill loses the marks. */}
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill="#0b0b0f" />
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill={`url(#${id}-face)`} />
      <path d="M32 3 58 17.5V50.5L32 65 6 50.5V17.5Z" fill="none" stroke={`url(#${id}-rim)`} strokeWidth={3} strokeLinejoin="round" />
      {/* A second, inset edge — this is what reads as bevelled metal rather than
          a flat outline, and it costs one path. */}
      <path d="M32 9 53 20.5V47.5L32 59 11 47.5V20.5Z" fill="none" stroke={color} strokeOpacity="0.28" strokeWidth={1.2} strokeLinejoin="round" />

      {standing ? (
        <>
          {kind === "crown" && <Rays color={color} />}
          <Laurel color={color} />
          {kind === "crown" && <Crown color={color} />}
          <g fill={color} stroke="none">
            <Star x={32} y={kind === "crown" ? 39 : 35} r={kind === "crown" ? 7 : 8} />
          </g>
        </>
      ) : (
        <g fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
          <Marks kind={kind} count={count} y={kind === "chevron" ? 33 : 34} />
        </g>
      )}

      {/* Wings, top tier only. The ladder's last promotion should look like one. */}
      {kind === "winged" && (
        <g fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" opacity="0.9">
          <path d="M20 45c-4.5 0-7.5 1.6-9.5 3.6M20 49.5c-3.4 0-5.8 1.2-7.4 2.8" />
          <path d="M44 45c4.5 0 7.5 1.6 9.5 3.6M44 49.5c3.4 0 5.8 1.2 7.4 2.8" />
        </g>
      )}
      {/* The base bar. Present on every tier so the set reads as one family. */}
      {/* The base bar. On every tier so the set reads as one family — dropped
          lower on the standing tiers so it closes the wreath instead of cutting
          through it. */}
      <path
        d={standing ? "M26 51h12" : "M23 45h18"}
        stroke={color} strokeOpacity="0.75" strokeWidth={2.4} strokeLinecap="round"
      />
    </svg>
  );
}
