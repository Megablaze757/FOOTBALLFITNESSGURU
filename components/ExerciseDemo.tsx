import type { DemoPattern } from "@/lib/exercises";

// Asset-free animated demonstration: ONE stick figure whose joints are tweened
// (SVG SMIL) between the two key positions of a movement, on a loop — so the
// limbs actually move rather than crossfading. viewBox is 100×130.
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

const POSES: Record<DemoPattern, { a: Joints; b: Joints; dur: number }> = {
  squat: {
    a: STAND,
    b: { head: [50, 30], neck: [50, 44], hip: [50, 78], lHand: [43, 52], rHand: [57, 52],
      lKnee: [37, 90], rKnee: [63, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    dur: 2.4,
  },
  hinge: {
    a: STAND,
    b: { head: [30, 46], neck: [40, 48], hip: [56, 60], lHand: [26, 82], rHand: [30, 84],
      lKnee: [52, 90], rKnee: [60, 90], lAnkle: [52, 118], rAnkle: [60, 118] },
    dur: 2.6,
  },
  lunge: {
    a: STAND,
    b: { head: [50, 22], neck: [50, 34], hip: [50, 70], lHand: [45, 66], rHand: [55, 66],
      lKnee: [38, 96], rKnee: [66, 100], lAnkle: [38, 120], rAnkle: [80, 118] },
    dur: 2.4,
  },
  jump: {
    a: { head: [50, 34], neck: [50, 47], hip: [50, 78], lHand: [38, 74], rHand: [62, 74],
      lKnee: [40, 96], rKnee: [60, 96], lAnkle: [44, 118], rAnkle: [56, 118] },
    b: { head: [50, 4], neck: [50, 18], hip: [50, 50], lHand: [40, 2], rHand: [60, 2],
      lKnee: [47, 76], rKnee: [53, 76], lAnkle: [47, 100], rAnkle: [53, 100] },
    dur: 1.4,
  },
  plank: {
    a: { head: [20, 76], neck: [30, 76], hip: [62, 74], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 73], rKnee: [80, 73], lAnkle: [96, 72], rAnkle: [96, 72] },
    b: { head: [20, 72], neck: [30, 72], hip: [62, 70], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 69], rKnee: [80, 69], lAnkle: [96, 68], rAnkle: [96, 68] },
    dur: 3.2,
  },
  run: {
    a: { head: [50, 15], neck: [50, 30], hip: [50, 62], lHand: [64, 50], rHand: [38, 70],
      lKnee: [48, 80], rKnee: [56, 96], lAnkle: [46, 96], rAnkle: [66, 114] },
    b: { head: [50, 15], neck: [50, 30], hip: [50, 62], lHand: [38, 70], rHand: [64, 50],
      lKnee: [44, 96], rKnee: [52, 80], lAnkle: [34, 114], rAnkle: [54, 96] },
    dur: 0.8,
  },
  lateral: {
    a: shift({ head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [38, 58], rHand: [62, 58],
      lKnee: [42, 90], rKnee: [60, 90], lAnkle: [38, 116], rAnkle: [64, 116] }, -12),
    b: shift({ head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [38, 58], rHand: [62, 58],
      lKnee: [42, 90], rKnee: [60, 90], lAnkle: [38, 116], rAnkle: [64, 116] }, 12),
    dur: 1.5,
  },
  ball: {
    a: { ...STAND, hip: [50, 66], lKnee: [44, 92], rKnee: [56, 92], lHand: [40, 58], rHand: [62, 56], ball: [38, 122] },
    b: { ...STAND, hip: [50, 66], lKnee: [44, 92], rKnee: [56, 92], lHand: [38, 56], rHand: [60, 58], ball: [62, 122] },
    dur: 1.3,
  },
  bike: {
    a: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [44, 84], rKnee: [58, 92], lAnkle: [40, 100], rAnkle: [62, 108] },
    b: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [58, 92], rKnee: [44, 84], lAnkle: [62, 108], rAnkle: [40, 100] },
    dur: 0.9,
  },
  press: {
    a: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [39, 34], rHand: [61, 34],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    b: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [44, 4], rHand: [56, 4],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    dur: 1.8,
  },
  pull: {
    a: { head: [50, 26], neck: [50, 40], hip: [50, 74], lHand: [42, 8], rHand: [58, 8],
      lKnee: [48, 98], rKnee: [52, 98], lAnkle: [48, 120], rAnkle: [52, 120] },
    b: { head: [50, 12], neck: [50, 26], hip: [50, 60], lHand: [42, 8], rHand: [58, 8],
      lKnee: [48, 84], rKnee: [52, 84], lAnkle: [48, 106], rAnkle: [52, 106] },
    dur: 2.0,
  },
};

const SEGMENTS: [keyof Joints, keyof Joints][] = [
  ["head", "neck"], ["neck", "hip"],
  ["neck", "lHand"], ["neck", "rHand"],
  ["hip", "lKnee"], ["lKnee", "lAnkle"],
  ["hip", "rKnee"], ["rKnee", "rAnkle"],
];

const EASE = "0.42 0 0.58 1";

// values string that goes a -> b -> a so the loop returns to the start smoothly
const cyc = (a: number, b: number) => `${a};${b};${a}`;

function Anim({ attr, a, b, dur }: { attr: string; a: number; b: number; dur: number }) {
  return (
    <animate
      attributeName={attr}
      values={cyc(a, b)}
      keyTimes="0;0.5;1"
      calcMode="spline"
      keySplines={`${EASE};${EASE}`}
      dur={`${dur}s`}
      repeatCount="indefinite"
    />
  );
}

export function ExerciseDemo({ pattern, className = "" }: { pattern: DemoPattern; className?: string }) {
  const pose = POSES[pattern] ?? POSES.squat;
  const { a, b, dur } = pose;

  return (
    <svg
      viewBox="0 0 100 130"
      className={`text-pitch-400 ${className}`}
      role="img"
      aria-label={`${pattern} demonstration`}
    >
      {pattern === "pull" ? (
        <line x1={24} y1={8} x2={76} y2={8} stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} strokeLinecap="round" />
      ) : (
        <line x1={10} y1={124} x2={90} y2={124} stroke="currentColor" strokeOpacity={0.15} strokeWidth={2} />
      )}

      <g fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
        {SEGMENTS.map(([p, q], i) => {
          const [ax1, ay1] = a[p] as XY, [ax2, ay2] = a[q] as XY;
          const [bx1, by1] = b[p] as XY, [bx2, by2] = b[q] as XY;
          return (
            <line key={i} x1={ax1} y1={ay1} x2={ax2} y2={ay2}>
              <Anim attr="x1" a={ax1} b={bx1} dur={dur} />
              <Anim attr="y1" a={ay1} b={by1} dur={dur} />
              <Anim attr="x2" a={ax2} b={bx2} dur={dur} />
              <Anim attr="y2" a={ay2} b={by2} dur={dur} />
            </line>
          );
        })}

        <circle cx={a.head[0]} cy={a.head[1]} r={7} fill="currentColor" stroke="none">
          <Anim attr="cx" a={a.head[0]} b={b.head[0]} dur={dur} />
          <Anim attr="cy" a={a.head[1]} b={b.head[1]} dur={dur} />
        </circle>

        {a.ball && b.ball && (
          <circle cx={a.ball[0]} cy={a.ball[1]} r={6} fill="currentColor" stroke="none" opacity={0.85}>
            <Anim attr="cx" a={a.ball[0]} b={b.ball[0]} dur={dur} />
            <Anim attr="cy" a={a.ball[1]} b={b.ball[1]} dur={dur} />
          </circle>
        )}
      </g>
    </svg>
  );
}
