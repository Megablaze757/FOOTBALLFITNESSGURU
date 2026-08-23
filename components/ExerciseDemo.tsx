import type { DemoPattern, Implement } from "@/lib/exercises";
import { artFor, ART_SOURCES } from "@/lib/exercise-art";

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
  /**
   * ARMS BEND. THEY DID NOT.
   *
   * Legs had a knee from the first version and arms went shoulder-straight-to-
   * hand, so every figure in the app had two rigid poles hanging off it. On a
   * squat that reads as stiff; on a run, where the hands sit on opposite sides
   * of the body, the two straight segments cross the chest and the whole thing
   * reads as somebody falling over rather than running. That is the "they all
   * look like this" — one missing joint, in three hundred pictures.
   *
   * Optional, and derived when absent: `elbowFor` puts it at the midpoint of
   * shoulder-to-hand pushed away from the torso, which is what an arm does. So
   * every pose gains a bend without being rewritten, and the poses where the
   * bend IS the movement — a run's tucked arms, a curl, a row — state it.
   */
  lElbow?: XY; rElbow?: XY;
  lKnee: XY; rKnee: XY;
  lAnkle: XY; rAnkle: XY;
  ball?: XY;
}

/**
 * Where the elbow goes when a pose does not say.
 *
 * Perpendicular to the shoulder-hand line, away from the body's midline, by a
 * fraction of that line's length — a long reach bends a little, a hand near the
 * chest bends a lot, which is roughly what an elbow does. Never zero: a
 * perfectly straight arm is the thing this exists to stop.
 */
function elbowFor(shoulder: XY, hand: XY, awayFrom: number): XY {
  const dx = hand[0] - shoulder[0];
  const dy = hand[1] - shoulder[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const side = shoulder[0] >= awayFrom ? 1 : -1;
  // Perpendicular, pointing outward from the torso.
  const nx = (-dy / length) * side;
  const ny = (dx / length) * side;
  const bend = Math.min(6, 2 + length * 0.16);
  return [shoulder[0] + dx / 2 + nx * bend, shoulder[1] + dy / 2 + ny * bend];
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
    lElbow: j.lElbow ? m(j.lElbow) : undefined,
    rElbow: j.rElbow ? m(j.rElbow) : undefined,
    lKnee: m(j.lKnee), rKnee: m(j.rKnee),
    lAnkle: m(j.lAnkle), rAnkle: m(j.rAnkle),
    ball: j.ball ? m(j.ball) : undefined,
  };
}

/**
 * Which of the two frames IDENTIFIES the movement.
 *
 * THE STILL WAS ALWAYS `a`, AND `a` IS USUALLY SOMEBODY STANDING UP. A squat, a
 * hinge, a lunge, a lateral shuffle and a ball drill all begin from the same
 * neutral stand — so five of the eleven patterns drew the identical picture,
 * and a library grid of three hundred exercises was three hundred copies of one
 * standing figure. That is the "the images look worse than before": not the
 * drawing, the CHOICE of frame. A picture that is the same for every row is
 * decoration, and decoration that takes up a third of a card reads as broken.
 *
 * Stated per pattern rather than guessed, because the answer is not "always the
 * second frame" either: a run is recognisable at either stride, and a jump is
 * only a jump in the air. The animation still plays a → b; this is only which
 * frame stands still.
 */
type PoseKey = "a" | "b";

const POSES: Record<DemoPattern, { a: Joints; b: Joints; still: PoseKey }> = {
  squat: {
    a: STAND,
    b: { head: [50, 30], neck: [50, 44], hip: [50, 78], lHand: [43, 52], rHand: [57, 52],
      lKnee: [37, 90], rKnee: [63, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    // the bottom. Standing up is not a squat.
    still: "b",
  },
  hinge: {
    a: STAND,
    b: { head: [30, 46], neck: [40, 48], hip: [56, 60], lHand: [26, 82], rHand: [30, 84],
      lKnee: [52, 90], rKnee: [60, 90], lAnkle: [52, 118], rAnkle: [60, 118] },
    // hips back, chest down — the only frame that is not a stand.
    still: "b",
  },
  lunge: {
    a: STAND,
    b: { head: [50, 22], neck: [50, 34], hip: [50, 70], lHand: [45, 66], rHand: [55, 66],
      lKnee: [38, 96], rKnee: [66, 100], lAnkle: [38, 120], rAnkle: [80, 118] },
    // split stance at depth.
    still: "b",
  },
  jump: {
    a: { head: [50, 34], neck: [50, 47], hip: [50, 78], lHand: [38, 74], rHand: [62, 74],
      lKnee: [40, 96], rKnee: [60, 96], lAnkle: [44, 118], rAnkle: [56, 118] },
    b: { head: [50, 4], neck: [50, 18], hip: [50, 50], lHand: [40, 2], rHand: [60, 2],
      lKnee: [47, 76], rKnee: [53, 76], lAnkle: [47, 100], rAnkle: [53, 100] },
    // in the air. A jump on the ground is a squat.
    still: "b",
  },
  plank: {
    a: { head: [20, 76], neck: [30, 76], hip: [62, 74], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 73], rKnee: [80, 73], lAnkle: [96, 72], rAnkle: [96, 72] },
    b: { head: [20, 72], neck: [30, 72], hip: [62, 70], lHand: [30, 100], rHand: [30, 100],
      lKnee: [80, 69], rKnee: [80, 69], lAnkle: [96, 68], rAnkle: [96, 68] },
    // both frames are the same hold; either does.
    still: "a",
  },
  run: {
    /**
     * A STRIDE, NOT A PERSON MID-FALL.
     *
     * Running is the pattern the missing elbow ruined most. The hands sit on
     * opposite sides of the body — that is what an arm swing IS — so two
     * straight shoulder-to-hand segments crossed the chest and drew an X over
     * the torso. The figure read as somebody toppling forward, which is what
     * "all these movement exercises look like this" was pointing at.
     *
     * Runners hold about ninety degrees at the elbow and swing from the
     * shoulder, hands travelling from hip to chest and never crossing the
     * midline. So the elbows are stated: tucked in near the ribs, one arm
     * driving forward while the opposite leg does, which is also the thing that
     * makes a still frame read as motion rather than as a stance.
     *
     * Slight forward lean at the head and hips, because upright is walking.
     */
    a: { head: [53, 14], neck: [52, 29], hip: [49, 62],
      lElbow: [60, 46], lHand: [58, 33], rElbow: [40, 48], rHand: [40, 62],
      lKnee: [48, 80], rKnee: [56, 96], lAnkle: [46, 96], rAnkle: [66, 114] },
    b: { head: [53, 14], neck: [52, 29], hip: [49, 62],
      lElbow: [60, 48], lHand: [60, 62], rElbow: [40, 46], rHand: [42, 33],
      lKnee: [44, 96], rKnee: [52, 80], lAnkle: [34, 114], rAnkle: [54, 96] },
    // mid-stride, which is recognisable at either end.
    still: "a",
  },
  lateral: {
    /**
     * A WIDE, LOADED ATHLETIC STANCE — not a stand nudged sideways.
     *
     * This was the same upright figure shifted 12 units left and right, which
     * animates as a shuffle and, held still, is indistinguishable from
     * standing. Sinking the hips, widening the feet past the shoulders and
     * dropping the hands to a ready position is what a shuffle actually looks
     * like at any instant of it.
     */
    a: shift({ head: [50, 26], neck: [50, 40], hip: [50, 72], lHand: [34, 66], rHand: [66, 66],
      lKnee: [32, 94], rKnee: [68, 94], lAnkle: [26, 118], rAnkle: [74, 118] }, -8),
    b: shift({ head: [50, 26], neck: [50, 40], hip: [50, 72], lHand: [34, 66], rHand: [66, 66],
      lKnee: [32, 94], rKnee: [68, 94], lAnkle: [26, 118], rAnkle: [74, 118] }, 8),
    // Either frame; they are one stance mirrored.
    still: "a",
  },
  ball: {
    /**
     * OVER THE BALL, not standing next to one.
     *
     * It was STAND with a ball added at ankle height, so the figure read as a
     * person who happened to have a football nearby. Leaning over it, knees
     * soft, one foot reaching across is the shape of somebody actually
     * touching the thing.
     */
    a: { head: [44, 22], neck: [46, 36], hip: [52, 68], lHand: [34, 60], rHand: [64, 58],
      lKnee: [40, 94], rKnee: [60, 92], lAnkle: [34, 116], rAnkle: [62, 116], ball: [42, 114] },
    b: { head: [56, 22], neck: [54, 36], hip: [48, 68], lHand: [36, 58], rHand: [66, 60],
      lKnee: [40, 92], rKnee: [60, 94], lAnkle: [38, 116], rAnkle: [66, 116], ball: [58, 114] },
    // Either; the two are one touch mirrored.
    still: "a",
  },
  bike: {
    a: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [44, 84], rKnee: [58, 92], lAnkle: [40, 100], rAnkle: [62, 108] },
    b: { head: [44, 28], neck: [50, 40], hip: [52, 72], lHand: [62, 64], rHand: [64, 66],
      lKnee: [58, 92], rKnee: [44, 84], lAnkle: [62, 108], rAnkle: [40, 100] },
    // seated with the cranks turning; both frames are the same shape.
    still: "a",
  },
  press: {
    // Racked at the shoulders the elbows are under the hands and out to the
    // side; overhead they are almost locked. Without them both frames were the
    // same straight arm at two heights.
    a: { head: [50, 16], neck: [50, 30], hip: [50, 64],
      lElbow: [34, 46], lHand: [39, 34], rElbow: [66, 46], rHand: [61, 34],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    b: { head: [50, 16], neck: [50, 30], hip: [50, 64],
      lElbow: [42, 18], lHand: [44, 4], rElbow: [58, 18], rHand: [56, 4],
      lKnee: [45, 90], rKnee: [55, 90], lAnkle: [45, 118], rAnkle: [55, 118] },
    // locked out overhead. Arms at the shoulders is a stand holding something.
    still: "b",
  },
  pull: {
    // Hanging: arms nearly straight, elbows barely off the line. At the top
    // they are bent hard and flared wide, which is the movement — a chin over a
    // bar with straight arms is a person standing on something.
    a: { head: [50, 26], neck: [50, 40], hip: [50, 74],
      lElbow: [43, 24], lHand: [42, 8], rElbow: [57, 24], rHand: [58, 8],
      lKnee: [48, 98], rKnee: [52, 98], lAnkle: [48, 120], rAnkle: [52, 120] },
    b: { head: [50, 12], neck: [50, 26], hip: [50, 60],
      lElbow: [34, 24], lHand: [42, 8], rElbow: [66, 24], rHand: [58, 8],
      lKnee: [48, 84], rKnee: [52, 84], lAnkle: [48, 106], rAnkle: [52, 106] },
    // hanging at full stretch — the position that says pull-up.
    still: "a",
  },
};

const BENCH_PRESS_POSE: { a: Joints; b: Joints; still: PoseKey } = {
  // The bottom of the press. Locked out, a bench press is a person lying down.
  still: "a",
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

function poseFor(pattern: DemoPattern, name?: string): { pose: { a: Joints; b: Joints; still: PoseKey }; bench: boolean } {
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

/**
 * The body when it is not doing anything in particular. One flat slate, so the
 * coloured parts are the only thing the eye is asked to notice.
 */
const LIMB_FILL = "#8fa0b3";
const TORSO_FILL = "#7d90a6";

/**
 * A WORKING MUSCLE, NOT A WOUND.
 *
 * Primary was #ef4444 — the same red the app uses for a red readiness score and
 * for an injury flag — painted over a limb with a glow behind it. Every
 * exercise card looked like a diagram of somebody hurt. These are the app's own
 * gold and its dimmer sibling: the colour already means "this is the bit that
 * matters" everywhere else in the product.
 */
const activationColour = (level: Activation) => level === "primary" ? "#e3b53f" : "#b98c5a";

/**
 * One limb.
 *
 * WAS FOUR STROKES: a dark casing, a diagonal chrome gradient, a white bevel
 * offset by a pixel, and — when the muscle worked — a red line laid over the
 * top with a glow filter. Chrome tubes with a red stripe painted on them. On a
 * card the size of a thumbnail the gradient reads as noise and the red reads as
 * an injury, which is the opposite of what it means.
 *
 * Now two: a dark casing and a flat fill. When a muscle is working, the limb
 * ITSELF takes the colour rather than wearing a stripe — the same way an
 * anatomy chart shades a muscle rather than drawing on it.
 */
function Segment({ from, to, width, activation }: {
  from: XY;
  to: XY;
  width: number;
  activation?: Activation;
}) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#1f2937" strokeWidth={width + 3} strokeLinecap="round" />
      <line
        x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}
        stroke={activation ? activationColour(activation) : LIMB_FILL}
        strokeWidth={width} strokeLinecap="round"
      />
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
  const lElbow = j.lElbow ?? elbowFor(lShoulder, j.lHand, j.neck[0]);
  const rElbow = j.rElbow ?? elbowFor(rShoulder, j.rHand, j.neck[0]);
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
        <filter id="figure-shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.5" />
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

        <path
          d={torsoPath}
          fill={torsoActivation ? activationColour(torsoActivation) : TORSO_FILL}
          stroke="#1f2937" strokeWidth={2.5} strokeLinejoin="round"
        />
        {/* THE BLOBS ARE GONE.
            Three glowing ellipses were floated over the torso for chest, core
            and hips — at thumbnail size they are splodges, and with the glow
            filter behind them they bleed past the body's outline and look like
            bruises. The torso and the limbs now carry the colour themselves,
            which is how an anatomy chart does it: shade the muscle, do not draw
            a light on top of it.

            Core is the one zone with no limb of its own, so it keeps a shape —
            flat, inside the outline, no filter. */}
        {zones.core && !torsoActivation && (
          <ellipse
            cx={coreCentre[0]} cy={coreCentre[1]} rx={6} ry={7.5}
            transform={`rotate(${torsoAngle} ${coreCentre[0]} ${coreCentre[1]})`}
            fill={activationColour(zones.core)} opacity={0.85}
          />
        )}
        {/* Upper arm and forearm, the way the legs have always been drawn.
            A single shoulder-to-hand segment is a pole, and two poles on a
            figure is what made every exercise look like the same exercise. */}
        <Segment from={lShoulder} to={lElbow} width={8} activation={armActivation} />
        <Segment from={lElbow} to={j.lHand} width={7} activation={armActivation} />
        <Segment from={rShoulder} to={rElbow} width={8} activation={armActivation} />
        <Segment from={rElbow} to={j.rHand} width={7} activation={armActivation} />
        {/* Shoulder caps, flat and sized to the joint — they used to be glowing
            discs wider than the arm they sat on. */}
        {zones.shoulders && (
          <>
            <circle cx={lShoulder[0]} cy={lShoulder[1]} r={5} fill={activationColour(zones.shoulders)} stroke="#1f2937" strokeWidth={1.6} />
            <circle cx={rShoulder[0]} cy={rShoulder[1]} r={5} fill={activationColour(zones.shoulders)} stroke="#1f2937" strokeWidth={1.6} />
          </>
        )}

        <Segment from={j.head} to={j.neck} width={6} />
        <circle cx={j.head[0]} cy={j.head[1]} r={8} fill={LIMB_FILL} stroke="#1f2937" strokeWidth={2.2} />

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
  // The frame that IDENTIFIES the movement, not the frame it starts from — see
  // `still` on POSES. Drawing `a` everywhere made a squat, a hinge, a lunge, a
  // shuffle and a ball drill into the same standing figure.
  const still = pose[pose.still];
  return <Figure j={still} pattern={pattern} implement={implement} muscles={muscles} bench={bench} className={className} label={`${name ?? pattern} position`} />;
}

/**
 * Both key positions, labelled. This is what someone learning the movement
 * needs: where you begin, where you finish, and nothing invented in between.
 */
export function ExerciseSteps({ pattern, implement = "none", muscles = [], name, className = "" }: {
  pattern: DemoPattern; implement?: Implement; muscles?: readonly string[]; name?: string; className?: string;
}) {
  /**
   * REAL ARTWORK WHEN WE HAVE IT, the drawn figure when we do not.
   *
   * Two libraries between them cover 56% of the gym catalogue. Everkinetic's
   * illustrations take the classic lifts; photographs from free-exercise-db
   * take the ones nobody drew — cleans, snatches, rack pulls, pistol squats.
   * Nothing covers a cone weave, a Copenhagen plank or a resisted sprint start,
   * so the figure stays and had to be worth keeping.
   *
   * Deliberately not a hard swap of the whole component: the frame, the A/B
   * markers, the light board and the muscle legend are the same either way, so
   * a session with four illustrated lifts and one drawn drill still reads as
   * one set of cards rather than two.
   */
  const art = name ? artFor(name) : null;
  const { pose, bench } = poseFor(pattern, name);
  const frames: { j: Joints; marker: string; label: string; src?: string }[] = [
    { j: pose.a, marker: "A", label: "Start", src: art?.start },
    { j: pose.b, marker: "B", label: "Finish", src: art?.end },
  ];
  return (
    // The light coaching-board treatment deliberately separates this from the
    // dark app chrome. The shaded mannequin carries the actual muscle data:
    // red is the primary mover and amber is assistance, in both key positions.
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-slate-100 p-2 sm:p-3 ${className}`}>
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-2 sm:gap-3">
        {frames.map(({ j, marker, label, src }) => (
          <div key={label} className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden rounded-xl bg-gradient-to-br from-white to-slate-200 px-2 pb-2 pt-8 shadow-sm">
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-pitch-400 text-[11px] font-black text-ink-900 shadow-sm" aria-hidden>
              {marker}
            </span>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- a static
              // SVG in /public with known dimensions; next/image would add a
              // loader and a layout wrapper for no benefit on a 25KB vector.
              <img
                src={src}
                alt={`${name} — ${label.toLowerCase()} position`}
                loading="lazy"
                className="min-h-0 w-full flex-1 object-contain"
              />
            ) : <Figure
              j={j}
              pattern={pattern}
              implement={implement}
              muscles={muscles}
              bench={bench}
              className="min-h-0 w-full flex-1"
              label={`${name ?? pattern} ${label.toLowerCase()} position`}
            />}
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {label}
            </span>
          </div>
        ))}
      </div>
      {/* THE KEY DESCRIBES THE PICTURE ABOVE IT, so it changes with the picture.
          The dots said red-is-primary, amber-is-assisting — which was the drawn
          figure's own palette, and is now gold. On a photographed anatomical
          illustration it describes nothing at all: those are shaded by the
          artist, not by us. A key to colours that are not on screen is worse
          than no key, so the illustrated cards just name the muscles. */}
      {muscles.length > 0 && (
        <div className="flex min-w-0 shrink-0 items-center justify-center gap-3 overflow-hidden px-1 pt-2 text-[9px] font-bold uppercase tracking-wide text-slate-600 sm:text-[10px]">
          <span className="flex min-w-0 items-center gap-1.5">
            {!art && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: activationColour("primary") }} />}
            <span className="truncate">{muscles[0]}</span>
          </span>
          {muscles.length > 1 && (
            <span className="flex min-w-0 items-center gap-1.5">
              {!art && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: activationColour("secondary") }} />}
              <span className="truncate">{muscles.slice(1, 4).join(" · ")}</span>
            </span>
          )}
        </div>
      )}
      {/* REQUIRED BY THE LICENCE, and small on purpose — CC BY-SA asks for
          credit, not for a billboard. Shown only on the cards that actually use
          the artwork. */}
      {art && (
        <div className="shrink-0 px-1 pt-1 text-center text-[8px] uppercase tracking-wide text-slate-400 sm:text-[9px]">
          {ART_SOURCES[art.from].work} · {ART_SOURCES[art.from].licence}
        </div>
      )}
    </div>
  );
}
