import type { DemoPattern } from "@/lib/exercises";

// Asset-free animated demonstration: a stick figure that crossfades between the
// two key positions of a movement, on a loop. viewBox is 100×130.
type XY = [number, number];
interface Joints {
  head: XY; neck: XY; hip: XY;
  lHand: XY; rHand: XY;
  lKnee: XY; rKnee: XY;
  lAnkle: XY; rAnkle: XY;
  ball?: XY;
}

const STAND: Joints = {
  head: [50, 16], neck: [50, 30], hip: [50, 64],
  lHand: [38, 58], rHand: [62, 58],
  lKnee: [44, 90], rKnee: [56, 90],
  lAnkle: [44, 118], rAnkle: [56, 118],
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

const POSES: Record<DemoPattern, { a: Joints; b: Joints; dur?: string }> = {
  squat: {
    a: STAND,
    b: { head: [50, 32], neck: [50, 46], hip: [50, 80], lHand: [42, 60], rHand: [58, 60],
      lKnee: [38, 92], rKnee: [62, 92], lAnkle: [44, 118], rAnkle: [56, 118] },
    dur: "2s",
  },
  hinge: {
    a: STAND,
    b: { head: [38, 44], neck: [45, 46], hip: [54, 62], lHand: [40, 88], rHand: [46, 88],
      lKnee: [52, 90], rKnee: [58, 90], lAnkle: [52, 118], rAnkle: [58, 118] },
    dur: "2.2s",
  },
  lunge: {
    a: STAND,
    b: { head: [50, 20], neck: [50, 32], hip: [50, 72], lHand: [44, 70], rHand: [56, 70],
      lKnee: [40, 96], rKnee: [64, 102], lAnkle: [40, 118], rAnkle: [74, 120] },
    dur: "2.2s",
  },
  jump: {
    a: { head: [50, 30], neck: [50, 44], hip: [50, 76], lHand: [40, 72], rHand: [60, 72],
      lKnee: [40, 96], rKnee: [60, 96], lAnkle: [44, 118], rAnkle: [56, 118] },
    b: { head: [50, 6], neck: [50, 20], hip: [50, 52], lHand: [40, 4], rHand: [60, 4],
      lKnee: [47, 78], rKnee: [53, 78], lAnkle: [47, 102], rAnkle: [53, 102] },
    dur: "1.3s",
  },
  plank: {
    a: { head: [22, 74], neck: [32, 76], hip: [64, 74], lHand: [32, 98], rHand: [32, 98],
      lKnee: [80, 74], rKnee: [80, 74], lAnkle: [94, 74], rAnkle: [94, 74] },
    b: { head: [22, 70], neck: [32, 72], hip: [64, 70], lHand: [32, 98], rHand: [32, 98],
      lKnee: [80, 70], rKnee: [80, 70], lAnkle: [94, 70], rAnkle: [94, 70] },
    dur: "3s",
  },
  run: {
    a: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [62, 54], rHand: [40, 72],
      lKnee: [46, 84], rKnee: [58, 96], lAnkle: [44, 100], rAnkle: [64, 116] },
    b: { head: [50, 16], neck: [50, 30], hip: [50, 64], lHand: [40, 72], rHand: [62, 54],
      lKnee: [42, 96], rKnee: [54, 84], lAnkle: [36, 116], rAnkle: [56, 100] },
    dur: "0.9s",
  },
  lateral: {
    a: shift({ head: [50, 18], neck: [50, 32], hip: [50, 66], lHand: [40, 60], rHand: [60, 60],
      lKnee: [42, 92], rKnee: [60, 92], lAnkle: [38, 118], rAnkle: [62, 118] }, -8),
    b: shift({ head: [50, 18], neck: [50, 32], hip: [50, 66], lHand: [40, 60], rHand: [60, 60],
      lKnee: [42, 92], rKnee: [60, 92], lAnkle: [38, 118], rAnkle: [62, 118] }, 8),
    dur: "1.4s",
  },
  ball: {
    a: { ...STAND, lHand: [40, 60], rHand: [62, 58], ball: [40, 122] },
    b: { ...STAND, rHand: [60, 60], lHand: [38, 58], ball: [60, 122] },
    dur: "1.2s",
  },
  bike: {
    a: { head: [46, 28], neck: [50, 40], hip: [50, 72], lHand: [62, 66], rHand: [64, 68],
      lKnee: [44, 86], rKnee: [58, 94], lAnkle: [40, 104], rAnkle: [60, 112] },
    b: { head: [46, 28], neck: [50, 40], hip: [50, 72], lHand: [62, 66], rHand: [64, 68],
      lKnee: [58, 92], rKnee: [44, 88], lAnkle: [60, 110], rAnkle: [40, 106] },
    dur: "0.9s",
  },
};

function Figure({ j, className }: { j: Joints; className?: string }) {
  const L = (a: XY, b: XY, key: string) => (
    <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
  );
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={j.head[0]} cy={j.head[1]} r={7} fill="currentColor" stroke="none" />
      {L(j.head, j.neck, "hn")}
      {L(j.neck, j.hip, "sp")}
      {L(j.neck, j.lHand, "la")}
      {L(j.neck, j.rHand, "ra")}
      {L(j.hip, j.lKnee, "lt")}
      {L(j.lKnee, j.lAnkle, "ls")}
      {L(j.hip, j.rKnee, "rt")}
      {L(j.rKnee, j.rAnkle, "rs")}
      {j.ball && <circle cx={j.ball[0]} cy={j.ball[1]} r={6} fill="currentColor" stroke="none" opacity={0.85} />}
    </g>
  );
}

export function ExerciseDemo({ pattern, className = "" }: { pattern: DemoPattern; className?: string }) {
  const pose = POSES[pattern] ?? POSES.squat;
  return (
    <svg
      viewBox="0 0 100 130"
      className={`text-pitch-400 ${className}`}
      style={{ "--demo-dur": pose.dur ?? "1.7s" } as React.CSSProperties}
      role="img"
      aria-label={`${pattern} demonstration`}
    >
      {/* ground line */}
      <line x1={10} y1={124} x2={90} y2={124} stroke="currentColor" strokeOpacity={0.15} strokeWidth={2} />
      <Figure j={pose.a} />
      <Figure j={pose.b} className="demo-poseB" />
    </svg>
  );
}
