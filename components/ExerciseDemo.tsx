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

const BENCH_PRESS_POSE: { a: Joints; b: Joints } = {
  a: {
    head: [25, 65], neck: [34, 70], hip: [61, 83],
    lHand: [31, 49], rHand: [48, 53],
    lKnee: [72, 96], rKnee: [76, 96],
    lAnkle: [84, 118], rAnkle: [91, 116],
  },
  b: {
    head: [25, 65], neck: [34, 70], hip: [61, 83],
    lHand: [31, 25], rHand: [45, 28],
    lKnee: [72, 96], rKnee: [76, 96],
    lAnkle: [84, 118], rAnkle: [91, 116],
  },
};

function poseFor(pattern: DemoPattern, name?: string): { pose: { a: Joints; b: Joints }; bench: boolean } {
  const bench = pattern === "press" && /bench|chest press|floor press|pec|\bfly\b|flyes|flies/i.test(name ?? "");
  return { pose: bench ? BENCH_PRESS_POSE : (POSES[pattern] ?? POSES.squat), bench };
}

type MuscleZone = "chest" | "back" | "shoulders" | "arms" | "core" | "hips" | "upperLegs" | "calves";
type Activation = "primary" | "secondary";

function activationZones(muscles: readonly string[]): Partial<Record<MuscleZone, Activation>> {
  const zones: Partial<Record<MuscleZone, Activation>> = {};
  const mark = (zone: MuscleZone, level: Activation) => {
    if (zones[zone] !== "primary") zones[zone] = level;
  };

  muscles.forEach((raw, index) => {
    const muscle = raw.toLowerCase();
    const level: Activation = index === 0 ? "primary" : "secondary";
    if (/whole body|full body/.test(muscle)) {
      (["chest", "back", "shoulders", "arms", "core", "hips", "upperLegs", "calves"] as MuscleZone[])
        .forEach((zone) => mark(zone, level));
      return;
    }
    if (/cardio|\blegs?\b/.test(muscle)) {
      (["core", "hips", "upperLegs", "calves"] as MuscleZone[]).forEach((zone) => mark(zone, level));
    }
    if (/chest|pec/.test(muscle)) mark("chest", level);
    if (/back|lat|trap|spine/.test(muscle)) mark("back", level);
    if (/shoulder|delt|rotator cuff/.test(muscle)) mark("shoulders", level);
    if (/bicep|tricep|forearm|grip|hands?/.test(muscle)) mark("arms", level);
    if (/core|ab|oblique/.test(muscle)) mark("core", level);
    if (/glute|adductor|groin|hip flexor|hip rotator/.test(muscle)) mark("hips", level);
    if (/quad|hamstring|vmo|patellar|adductor|hip flexor/.test(muscle)) mark("upperLegs", level);
    if (/calf|calves|achilles|ankle/.test(muscle)) mark("calves", level);
  });
  return zones;
}

function strongest(...levels: (Activation | undefined)[]): Activation | undefined {
  return levels.includes("primary") ? "primary" : levels.includes("secondary") ? "secondary" : undefined;
}

const activationColour = (level: Activation) => level === "primary" ? "#ef4444" : "#f59e0b";

function Segment({ from, to, width, activation }: {
  from: XY;
  to: XY;
  width: number;
  activation?: Activation;
}) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#263241" strokeWidth={width + 3} strokeLinecap="round" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="url(#figure-surface)" strokeWidth={width} strokeLinecap="round" />
      <line x1={from[0] - 1} y1={from[1]} x2={to[0] - 1} y2={to[1]} stroke="#ffffff" strokeOpacity={0.24} strokeWidth={1.5} strokeLinecap="round" />
      {activation && (
        <line
          x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}
          stroke={activationColour(activation)} strokeWidth={Math.max(4, width - 3)}
          strokeLinecap="round" strokeOpacity={activation === "primary" ? 0.95 : 0.72}
          filter="url(#activation-glow)"
        />
      )}
    </g>
  );
}

/** One still frame of a movement, drawn as a shaded anatomical mannequin. */
function Figure({ j, pattern, implement, muscles, bench = false, className, label }: {
  j: Joints;
  pattern: DemoPattern;
  implement: Implement;
  muscles: readonly string[];
  bench?: boolean;
  className: string;
  label: string;
}) {
  const zones = activationZones(muscles);
  const dx = j.hip[0] - j.neck[0];
  const dy = j.hip[1] - j.neck[1];
  const torsoLength = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / torsoLength;
  const py = dx / torsoLength;
  const point = (origin: XY, offset: number): XY => [origin[0] + px * offset, origin[1] + py * offset];
  const lShoulder = point(j.neck, 9);
  const rShoulder = point(j.neck, -9);
  const lHip = point(j.hip, 6);
  const rHip = point(j.hip, -6);
  const torsoPath = `M ${lShoulder[0]} ${lShoulder[1]} Q ${point(j.neck, 12)[0]} ${point(j.neck, 12)[1]} ${lHip[0]} ${lHip[1]} Q ${j.hip[0]} ${j.hip[1] + 3} ${rHip[0]} ${rHip[1]} Q ${point(j.neck, -12)[0]} ${point(j.neck, -12)[1]} ${rShoulder[0]} ${rShoulder[1]} Z`;
  const torsoAngle = Math.atan2(dy, dx) * 180 / Math.PI - 90;
  const chestCentre: XY = [j.neck[0] + dx * 0.34, j.neck[1] + dy * 0.34];
  const coreCentre: XY = [j.neck[0] + dx * 0.7, j.neck[1] + dy * 0.7];
  const torsoActivation = strongest(zones.chest, zones.back);
  const armActivation = strongest(zones.shoulders, zones.arms);
  const upperLegActivation = strongest(zones.upperLegs, zones.hips);

  const handMid: XY = [(j.lHand[0] + j.rHand[0]) / 2, (j.lHand[1] + j.rHand[1]) / 2 - 2];
  const bar: XY = implement === "barbell_back" ? j.neck : handMid;
  const groundY = Math.min(125, Math.max(j.lAnkle[1], j.rAnkle[1]) + 5);

  return (
    <svg
      viewBox="0 0 100 130"
      className={className}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="figure-surface" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="0.42" stopColor="#94a3b8" />
          <stop offset="0.72" stopColor="#64748b" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <radialGradient id="figure-head" cx="32%" cy="24%" r="72%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#aeb9c7" />
          <stop offset="1" stopColor="#445164" />
        </radialGradient>
        <filter id="figure-shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.5" />
        </filter>
        <filter id="activation-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <ellipse cx={(j.lAnkle[0] + j.rAnkle[0]) / 2} cy={groundY} rx={25} ry={3.5} fill="#0f172a" opacity={0.16} />
      {pattern === "pull" ? (
        <line x1={24} y1={8} x2={76} y2={8} stroke="#475569" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
      ) : null}

      {/* Box for box jumps / depth drops */}
      {implement === "box" && (
        <rect x={62} y={104} width={30} height={20} rx={2} fill="#cbd5e1" stroke="#64748b" strokeWidth={2} />
      )}
      {bench && (
        <g opacity={0.82}>
          <line x1={17} y1={80} x2={68} y2={97} stroke="#475569" strokeWidth={6} strokeLinecap="round" />
          <line x1={61} y1={95} x2={58} y2={119} stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
          <line x1={31} y1={84} x2={28} y2={111} stroke="#64748b" strokeWidth={3} strokeLinecap="round" />
        </g>
      )}

      <g filter="url(#figure-shadow)">
        <Segment from={lHip} to={j.lKnee} width={11} activation={upperLegActivation} />
        <Segment from={rHip} to={j.rKnee} width={11} activation={upperLegActivation} />
        <Segment from={j.lKnee} to={j.lAnkle} width={8} activation={zones.calves} />
        <Segment from={j.rKnee} to={j.rAnkle} width={8} activation={zones.calves} />

        <path d={torsoPath} fill="url(#figure-surface)" stroke="#263241" strokeWidth={2.5} strokeLinejoin="round" />
        <path d={torsoPath} fill="none" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={1.2} />
        {torsoActivation && (
          <ellipse
            cx={chestCentre[0]} cy={chestCentre[1]} rx={8.5} ry={6.5}
            transform={`rotate(${torsoAngle} ${chestCentre[0]} ${chestCentre[1]})`}
            fill={activationColour(torsoActivation)} opacity={torsoActivation === "primary" ? 0.92 : 0.7}
            filter="url(#activation-glow)"
          />
        )}
        {zones.core && (
          <ellipse
            cx={coreCentre[0]} cy={coreCentre[1]} rx={6.5} ry={8}
            transform={`rotate(${torsoAngle} ${coreCentre[0]} ${coreCentre[1]})`}
            fill={activationColour(zones.core)} opacity={zones.core === "primary" ? 0.92 : 0.68}
            filter="url(#activation-glow)"
          />
        )}
        {zones.hips && (
          <ellipse cx={j.hip[0]} cy={j.hip[1]} rx={8} ry={5.5} fill={activationColour(zones.hips)} opacity={zones.hips === "primary" ? 0.92 : 0.68} filter="url(#activation-glow)" />
        )}

        <Segment from={lShoulder} to={j.lHand} width={8} activation={armActivation} />
        <Segment from={rShoulder} to={j.rHand} width={8} activation={armActivation} />
        {zones.shoulders && (
          <>
            <circle cx={lShoulder[0]} cy={lShoulder[1]} r={5.5} fill={activationColour(zones.shoulders)} opacity={0.9} filter="url(#activation-glow)" />
            <circle cx={rShoulder[0]} cy={rShoulder[1]} r={5.5} fill={activationColour(zones.shoulders)} opacity={0.9} filter="url(#activation-glow)" />
          </>
        )}

        <Segment from={j.head} to={j.neck} width={6} />
        <circle cx={j.head[0]} cy={j.head[1]} r={8.5} fill="url(#figure-head)" stroke="#263241" strokeWidth={2.2} />

        {j.ball && <circle cx={j.ball[0]} cy={j.ball[1]} r={7} fill="#e9b949" stroke="#7c5c11" strokeWidth={2} />}

        {/* Barbell — a bar with plates */}
        {(implement === "barbell_back" || implement === "barbell_hands") && (
          <>
            <line x1={bar[0] - 18} y1={bar[1]} x2={bar[0] + 18} y2={bar[1]} stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
            {[-16, 16].map((dx) => (
              <rect key={dx} x={bar[0] + dx - 2.5} y={bar[1] - 7} width={5} height={14} rx={1.5} fill="#334155" stroke="#0f172a" strokeWidth={1} />
            ))}
          </>
        )}

        {/* Dumbbells at each hand */}
        {implement === "dumbbells" && ([j.lHand, j.rHand] as const).map((p, i) => (
          <g key={i}>
            <line x1={p[0] - 5} y1={p[1]} x2={p[0] + 5} y2={p[1]} stroke="#1e293b" strokeWidth={2.5} />
            <rect x={p[0] - 6} y={p[1] - 4} width={3} height={8} rx={1} fill="#334155" />
            <rect x={p[0] + 3} y={p[1] - 4} width={3} height={8} rx={1} fill="#334155" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * A single frame — the start position. Used for list thumbnails, where the
 * movement is identified by name and the picture only has to be recognisable.
 */
export function ExerciseDemo({ pattern, implement = "none", muscles = [], name, className = "" }: {
  pattern: DemoPattern; implement?: Implement; muscles?: readonly string[]; name?: string; className?: string;
}) {
  const { pose, bench } = poseFor(pattern, name);
  return <Figure j={pose.a} pattern={pattern} implement={implement} muscles={muscles} bench={bench} className={className} label={`${name ?? pattern} start position`} />;
}

/**
 * Both key positions, labelled. This is what someone learning the movement
 * needs: where you begin, where you finish, and nothing invented in between.
 */
export function ExerciseSteps({ pattern, implement = "none", muscles = [], name, className = "" }: {
  pattern: DemoPattern; implement?: Implement; muscles?: readonly string[]; name?: string; className?: string;
}) {
  const { pose, bench } = poseFor(pattern, name);
  const frames: { j: Joints; marker: string; label: string }[] = [
    { j: pose.a, marker: "A", label: "Start" },
    { j: pose.b, marker: "B", label: "Finish" },
  ];
  return (
    // The light coaching-board treatment deliberately separates this from the
    // dark app chrome. The shaded mannequin carries the actual muscle data:
    // red is the primary mover and amber is assistance, in both key positions.
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-slate-100 p-2 sm:p-3 ${className}`}>
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 sm:gap-3">
        {frames.map(({ j, marker, label }) => (
          <div key={label} className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden rounded-xl bg-gradient-to-br from-white to-slate-200 px-2 pb-2 pt-8 shadow-sm">
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-pitch-400 text-[11px] font-black text-ink-900 shadow-sm" aria-hidden>
              {marker}
            </span>
            <Figure
              j={j}
              pattern={pattern}
              implement={implement}
              muscles={muscles}
              bench={bench}
              className="min-h-0 w-full flex-1"
              label={`${name ?? pattern} ${label.toLowerCase()} position`}
            />
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {label}
            </span>
          </div>
        ))}
      </div>
      {muscles.length > 0 && (
        <div className="flex min-w-0 shrink-0 items-center justify-center gap-3 overflow-hidden px-1 pt-2 text-[9px] font-bold uppercase tracking-wide text-slate-600 sm:text-[10px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_7px_rgba(239,68,68,0.65)]" />
            <span className="truncate">{muscles[0]}</span>
          </span>
          {muscles.length > 1 && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_7px_rgba(245,158,11,0.55)]" />
              <span className="truncate">{muscles.slice(1, 4).join(" · ")}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
