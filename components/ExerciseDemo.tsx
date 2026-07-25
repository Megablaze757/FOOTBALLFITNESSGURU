import type { DemoPattern, Implement } from "@/lib/exercises";

// Asset-free demonstration: a stick figure in the two key positions of a
// movement, shown as START and FINISH side by side — the way a coaching book
// does it.
//
// This used to tween the joints between those positions with SVG SMIL. Linear
// interpolation between two poses has no notion of a limb having a fixed
// length, so mid-tween the legs stretched and the figure squirmed; every card
// also ran its own infinite animation, which is a lot to ask of a phone
// scrolling a 24-card grid. Two honest still frames read better than a bad
// moving one, and cost nothing to render.
//
// viewBox is 100×130.
type XY = [number, number];
interface Joints {
  head: XY; neck: XY; hip: XY;
  lHand: XY; rHand: XY;
  lKnee: XY; rKnee: XY;
  lAnkle: XY; rAnkle: XY;
  ball?: XY;
}

const STAND: Joints = {
  head: [50, 15], neck: [50, 30], hip: [50, 64],
  lHand: [39, 56], rHand: [61, 56],
  lKnee: [45, 90], rKnee: [55, 90],
  lAnkle: [45, 118], rAnkle: [55, 118],
};

function shift(j: Joints, dx: number): Joints {
  const m = (p: XY): XY => [p[0] + dx, p[1]];
  return {
    head: m(j.head), neck: m(j.neck), hip: m(j.hip),
    lHand: m(j.lHand), rHand: m(j.rHand),
    lKnee: m(j.lKnee), rKnee: m(j.rKnee),
    lAnkle: m(j.lAnkle), rAnkle: m(j.rAnkle),
    ball: j.ball ? m(j.ball) : undefined,
  };
}

const POSES: Record<DemoPattern, { a: Joints; b: Joints }> = {
  squat: {
    a: STAND,
    b: { head: [50, 30], neck: [50, 44], hip: [50, 78], lHand: [43, 52], rHand: [57, 52],
      lKnee: [37, 90], rKnee: [63, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
  },
  hinge: {
    a: STAND,
    b: { head: [30, 46], neck: [40, 48], hip: [56, 60], lHand: [26, 82], rHand: [30, 84],
      lKnee: [52, 90], rKnee: [60, 90], lAnkle: [52, 118], rAnkle: [60, 118] },
  },
  lunge: {
    a: STAND,
    b: { head: [50, 22], neck: [50, 34], hip: [50, 70], lHand: [45, 66], rHand: [55, 66],
      lKnee: [38, 96], rKnee: [66, 100], lAnkle: [38, 120], rAnkle: [80, 118] },
  },
  jump: {
    a: { head: [50, 34], neck: [50, 47], hip: [50, 78], lHand: [38, 74], rHand: [62, 74],
      lKnee: [40, 96], rKnee: [60, 96], lAnkle: [44, 118], rAnkle: [56, 118] },
    b: { head: [50, 4], neck: [50, 18], hip: [50, 50], lHand: [40, 2], rHand: [60, 2],
      lKnee: [47, 76], rKnee: [53, 76], lAnkle: [47, 100], rAnkle: [53, 100] },
  },
  plank: {
    a: { head: [20, 76], neck: [30, 76], hip: [62, 74], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 73], rKnee: [80, 73], lAnkle: [96, 72], rAnkle: [96, 72] },
    b: { head: [20, 72], neck: [30, 72], hip: [62, 70], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 69], rKnee: [80, 69], lAnkle: [96, 68], rAnkle: [96, 68] },
  },
  run: {
    a: { head: [50, 15], neck: [50, 30], hip: [50, 62], lHand: [64, 50], rHand: [38, 70],
      lKnee: [48, 80], rKnee: [56, 96], lAnkle: [46, 96], rAnkle: [66, 114] },
    b: { head: [50, 15], neck: [50, 30], hip: [50, 62], lHand: [38, 70], rHand: [64, 50],
      lKnee: [44, 96], rKnee: [52, 80], lAnkle: [34, 114], rAnkle: [54, 96] },
  },
  lateral: {
    a: shift({ head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [38, 58], rHand: [62, 58],
      lKnee: [42, 90], rKnee: [60, 90], lAnkle: [38, 116], rAnkle: [64, 116] }, -12),
    b: shift({ head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [38, 58], rHand: [62, 58],
      lKnee: [42, 90], rKnee: [60, 90], lAnkle: [38, 116], rAnkle: [64, 116] }, 12),
  },
  ball: {
    a: { ...STAND, hip: [50, 66], lKnee: [44, 92], rKnee: [56, 92], lHand: [40, 58], rHand: [62, 56], ball: [38, 122] },
    b: { ...STAND, hip: [50, 66], lKnee: [44, 92], rKnee: [56, 92], lHand: [38, 56], rHand: [60, 58], ball: [62, 122] },
  },
  bike: {
    a: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [44, 84], rKnee: [58, 92], lAnkle: [40, 100], rAnkle: [62, 108] },
    b: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [58, 92], rKnee: [44, 84], lAnkle: [62, 108], rAnkle: [40, 100] },
  },
  press: {
    a: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [39, 34], rHand: [61, 34],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    b: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [44, 4], rHand: [56, 4],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
  },
  pull: {
    a: { head: [50, 26], neck: [50, 40], hip: [50, 74], lHand: [42, 8], rHand: [58, 8],
      lKnee: [48, 98], rKnee: [52, 98], lAnkle: [48, 120], rAnkle: [52, 120] },
    b: { head: [50, 12], neck: [50, 26], hip: [50, 60], lHand: [42, 8], rHand: [58, 8],
      lKnee: [48, 84], rKnee: [52, 84], lAnkle: [48, 106], rAnkle: [52, 106] },
  },
};

const SEGMENTS: [keyof Joints, keyof Joints][] = [
  ["head", "neck"], ["neck", "hip"],
  ["neck", "lHand"], ["neck", "rHand"],
  ["hip", "lKnee"], ["lKnee", "lAnkle"],
  ["hip", "rKnee"], ["rKnee", "rAnkle"],
];

/** One still frame of a movement. */
function Figure({ j, pattern, implement, className, label }: {
  j: Joints; pattern: DemoPattern; implement: Implement; className: string; label: string;
}) {
  // Where the implement sits: on the back (squats) it rests at the neck; in the
  // hands it sits at the mid-point of the two hands.
  const handMid: XY = [(j.lHand[0] + j.rHand[0]) / 2, (j.lHand[1] + j.rHand[1]) / 2 - 2];
  const bar: XY = implement === "barbell_back" ? j.neck : handMid;

  return (
    <svg viewBox="0 0 100 130" className={`text-pitch-400 ${className}`} role="img" aria-label={label}>
      {pattern === "pull" ? (
        <line x1={24} y1={8} x2={76} y2={8} stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} strokeLinecap="round" />
      ) : (
        <line x1={10} y1={124} x2={90} y2={124} stroke="currentColor" strokeOpacity={0.15} strokeWidth={2} />
      )}

      {/* Box for box jumps / depth drops */}
      {implement === "box" && (
        <rect x={62} y={104} width={30} height={20} rx={2} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={3} />
      )}

      <g fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
        {SEGMENTS.map(([p, q], i) => {
          const [x1, y1] = j[p] as XY, [x2, y2] = j[q] as XY;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}

        <circle cx={j.head[0]} cy={j.head[1]} r={7} fill="currentColor" stroke="none" />

        {j.ball && <circle cx={j.ball[0]} cy={j.ball[1]} r={6} fill="currentColor" stroke="none" opacity={0.85} />}

        {/* Barbell — a bar with plates */}
        {(implement === "barbell_back" || implement === "barbell_hands") && (
          <>
            <line x1={bar[0] - 16} y1={bar[1]} x2={bar[0] + 16} y2={bar[1]} strokeWidth={3} />
            {[-16, 16].map((dx) => (
              <rect key={dx} x={bar[0] + dx - 2} y={bar[1] - 6} width={4} height={12} rx={1} fill="currentColor" stroke="none" />
            ))}
          </>
        )}

        {/* Dumbbells at each hand */}
        {implement === "dumbbells" && ([j.lHand, j.rHand] as const).map((p, i) => (
          <rect key={i} x={p[0] - 4} y={p[1] - 3} width={8} height={6} rx={1} fill="currentColor" stroke="none" />
        ))}
      </g>
    </svg>
  );
}

/**
 * A single frame — the start position. Used for list thumbnails, where the
 * movement is identified by name and the picture only has to be recognisable.
 */
export function ExerciseDemo({ pattern, implement = "none", className = "" }: {
  pattern: DemoPattern; implement?: Implement; className?: string;
}) {
  const pose = POSES[pattern] ?? POSES.squat;
  return <Figure j={pose.a} pattern={pattern} implement={implement} className={className} label={`${pattern} start position`} />;
}

/**
 * Both key positions, labelled. This is what someone learning the movement
 * needs: where you begin, where you finish, and nothing invented in between.
 */
export function ExerciseSteps({ pattern, implement = "none", className = "" }: {
  pattern: DemoPattern; implement?: Implement; className?: string;
}) {
  const pose = POSES[pattern] ?? POSES.squat;
  const frames: { j: Joints; label: string }[] = [
    { j: pose.a, label: "Start" },
    { j: pose.b, label: "Finish" },
  ];
  return (
    <div className={`flex items-stretch justify-center gap-2 ${className}`}>
      {frames.map(({ j, label }, i) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <Figure
            j={j}
            pattern={pattern}
            implement={implement}
            className="h-full w-full flex-1"
            label={`${pattern} ${label.toLowerCase()} position`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {/* An arrow on the second frame reads as "and then this", which is
                the one thing a pair of stills can't say on its own. */}
            {i === 1 ? `→ ${label}` : label}
          </span>
        </div>
      ))}
    </div>
  );
}
