// =============================================================================
// What a position actually has to do, in terms the engine can score.
//
// THE COMPLAINT: "a prop's drills are the same as a flanker's". They were. The
// engine read `position` in exactly two places — to pick a ball drill, and to
// print a name in the summary — so a 120kg front-rower whose job is a static
// maximal push and a back-rower who covers 7km a session with repeat sprints
// got byte-identical strength, conditioning and accessory work. The app asked
// for their position on the way in and then trained them as "a rugby player".
//
// Position is not a label on a programme, it is the programme. A prop's
// physical qualities and a flanker's overlap about as much as a shot-putter's
// and a 400m runner's.
//
// HOW THIS IS EXPRESSED. Not as a separate library of position-specific
// exercises — that is how you end up with eleven catalogues to maintain and a
// winger who never squats. The movements are the same; what changes is what the
// selector reaches for first. Each profile is a nudge on movement PATTERN plus
// a short list of movements the position cannot sensibly go without.
//
// Points are on the same scale as the rest of rankSlot: a goal match is 10,
// sport fit is ±5/8, the sprint essentials are +8, a coach's pick is +50. So
// these run ±3 to ±7 — enough to reliably reorder the pool, never enough to
// beat a coach, a pain filter or an exclusion the athlete typed.
// =============================================================================

import type { Pattern } from "./movements";
import type { SportId } from "./exercises";
import { positionList } from "./positions";

export interface PositionProfile {
  /** Points added to any movement with this pattern. Negative demotes. */
  patterns: Partial<Record<Pattern, number>>;
  /**
   * Points for named movements, added on top of the pattern weight.
   *
   * PATTERN IS TOO COARSE FOR CONDITIONING, and that is where a prop and a
   * flanker differ most. Seventeen of the nineteen conditioning movements carry
   * the pattern `conditioning`, so weighting the pattern moves all of them
   * together — a front-rower demoting "conditioning" demotes shuttles and sled
   * pushes along with the marathon-pace long run, and the guard against
   * emptying a slot then puts the lot back. Naming movements is the only way to
   * say "short and heavy, not long and slow".
   */
  movements?: Record<string, number>;
  /**
   * Movements this position should not go a block without, taken before the
   * rotation the same way the sprint essentials are — a scoring bonus can
   * always be rotated out, which is how a 3-day speed block once reached zero
   * hamstring sets.
   */
  essentials: string[];
  /** One line, shown on the programme, saying why it looks like this. */
  note: string;
}

/**
 * Keyed by the exact strings in POSITIONS_BY_SPORT (lib/coach.ts). A test
 * asserts every one of them resolves, so a position renamed there fails the
 * build rather than silently reverting that athlete to generic training.
 */
const PROFILES: Partial<Record<SportId, Record<string, PositionProfile>>> = {
  rugby: {
    // Front row. The scrum is a maximal isometric push through a braced trunk,
    // and the collision work is all short-range. Running volume is the lowest
    // on the pitch, so sprint work is demoted rather than removed — a prop
    // still has to get to the breakdown.
    Prop: {
      patterns: { push_h: 7, squat: 6, hinge: 5, carry: 5, pull_h: 4, sprint: -4 },
      movements: {
        // Short, heavy, repeatable — the shape of a scrum, not of a shuttle.
        sled_push: 8, bike_intervals: 5, rowing_intervals: 4, ski_erg: 4,
        long_run: -8, progression_run: -6, threshold_run: -5, tempo_runs: -4, easy_run: -3,
      },
      essentials: ["scrum_drive", "farmers_carry", "sled_push"],
      note: "Built around the scrum: maximal pushing, a braced trunk and heavy carries, with less running than the back row.",
    },
    Hooker: {
      patterns: { push_h: 6, squat: 5, core: 5, carry: 4, pull_h: 3, sprint: -2 },
      essentials: ["scrum_drive"],
      note: "Scrummaging strength plus the trunk control and shoulder mobility a lineout throw needs.",
    },
    Lock: {
      patterns: { jump: 7, push_h: 5, squat: 5, hinge: 4, carry: 4 },
      essentials: ["vertical_jump", "scrum_drive"],
      note: "Lineout jumping first — vertical power off a short run-up — over scrummaging strength and carries.",
    },
    // Back row. The flanker covers the most ground of any forward and does it
    // in repeated sprints between collisions, which is a completely different
    // engine from the front row's.
    Flanker: {
      patterns: { sprint: 6, cod: 6, conditioning: 5, hinge: 4, carry: 3, push_h: 3 },
      movements: { shuttle_runs: 8, fartlek_run: 5, tempo_runs: 4, long_run: -5, incline_walk: -4 },
      essentials: ["shuttle_runs", "nordic_curl"],
      note: "Repeat-sprint work and change of direction — the back row covers the most ground of any forward, between collisions.",
    },
    "No. 8": {
      patterns: { jump: 5, sprint: 5, carry: 5, squat: 4, push_h: 4, cod: 3 },
      essentials: ["power_clean"],
      note: "Power off the base of the scrum: explosive hips and carrying strength, with the running of a back-rower.",
    },
    "Scrum-half": {
      patterns: { conditioning: 6, cod: 6, footwork: 5, core: 4, sprint: 3, push_h: -3 },
      movements: { shuttle_runs: 7, fartlek_run: 5, tempo_runs: 5, long_run: -4 },
      essentials: ["shuttle_runs"],
      note: "The highest total distance on the pitch, almost all of it at low intensity with constant direction changes.",
    },
    "Fly-half": {
      patterns: { cod: 5, core: 5, hinge: 4, sprint: 4, conditioning: 3 },
      essentials: [],
      note: "Balanced work with the trunk and hip control a kicking game asks for.",
    },
    Centre: {
      patterns: { sprint: 6, squat: 5, push_h: 5, jump: 4, cod: 4 },
      essentials: ["resisted_sprint"],
      note: "Acceleration into contact — speed and the strength to carry it through a tackle.",
    },
    Wing: {
      patterns: { sprint: 7, jump: 5, cod: 4, hinge: 4, push_h: -3 },
      essentials: ["flying_sprints"],
      note: "Top-end speed above everything, with the hamstring work that keeps it available.",
    },
    "Full-back": {
      patterns: { sprint: 6, jump: 5, cod: 4, conditioning: 4 },
      essentials: ["flying_sprints"],
      note: "Counter-attacking speed and the aerial work of fielding a high ball.",
    },
  },

  football: {
    // Keeps almost none of the outfield engine and nearly all of the reactive,
    // lateral and upper-body work — the one position where demoting running is
    // obviously right.
    Goalkeeper: {
      patterns: { jump: 7, cod: 6, footwork: 5, push_v: 5, push_h: 4, sprint: -4 },
      movements: {
        shuttle_runs: 4, skipping: 4,
        long_run: -9, progression_run: -8, threshold_run: -7, tempo_runs: -6, easy_run: -5, recovery_run: -4,
      },
      essentials: ["lateral_shuffle", "box_jumps"],
      note: "Explosive lateral movement and getting off the floor, not the running engine an outfield player needs.",
    },
    "Centre back": {
      patterns: { jump: 6, squat: 5, push_h: 4, hinge: 4, sprint: 3 },
      essentials: ["vertical_jump"],
      note: "Aerial duels and the strength to hold a striker off, with enough speed to cover in behind.",
    },
    // Modern full-backs cover more ground than anyone, and most of the high-
    // speed distance in a match is theirs.
    "Full back": {
      patterns: { sprint: 6, conditioning: 6, cod: 5, hinge: 4 },
      movements: { shuttle_runs: 7, fartlek_run: 5, long_run: -4 },
      essentials: ["shuttle_runs", "flying_sprints"],
      note: "Repeat sprints up and down the touchline — the most high-speed distance of any position.",
    },
    "Defensive mid": {
      patterns: { conditioning: 6, squat: 4, core: 4, cod: 4, push_h: 3 },
      essentials: ["tempo_runs"],
      note: "An aerobic base to cover the middle third, with the strength to win a duel in it.",
    },
    "Central mid": {
      patterns: { conditioning: 7, cod: 4, sprint: 3, core: 3 },
      essentials: ["tempo_runs"],
      note: "The biggest engine on the pitch — total distance is the quality that decides the last twenty minutes.",
    },
    Winger: {
      patterns: { sprint: 7, cod: 6, footwork: 4, hinge: 4 },
      essentials: ["flying_sprints", "t_drill"],
      note: "Maximum speed and the ability to change direction at it — a winger is judged on the first two yards.",
    },
    Striker: {
      patterns: { sprint: 6, squat: 5, jump: 5, push_h: 4 },
      essentials: ["resisted_sprint"],
      note: "Acceleration over short distances, plus the strength to hold the ball up under pressure.",
    },
  },

  basketball: {
    "Point guard": {
      patterns: { cod: 7, footwork: 5, conditioning: 5, sprint: 4 },
      essentials: ["defensive_slides"],
      note: "Change of direction and ball-handling under fatigue, with the engine to run a game.",
    },
    "Shooting guard": {
      patterns: { jump: 6, sprint: 5, cod: 5, core: 3 },
      essentials: ["box_jumps"],
      note: "Getting off the floor quickly and repeatedly, off one foot or two.",
    },
    "Small forward": {
      patterns: { jump: 5, sprint: 5, cod: 5, squat: 4 },
      essentials: ["box_jumps"],
      note: "The all-round set — jump, sprint and change direction, because the position asks for all three.",
    },
    "Power forward": {
      patterns: { jump: 6, squat: 6, push_h: 4, carry: 3 },
      essentials: ["vertical_jump"],
      note: "Rebounding and holding position: vertical power built on heavy lower-body strength.",
    },
    Centre: {
      patterns: { jump: 6, squat: 6, push_h: 5, carry: 4 },
      movements: { sled_push: 6, rowing_intervals: 4, long_run: -7, threshold_run: -5, easy_run: -4 },
      essentials: ["vertical_jump"],
      note: "Strength in the paint and repeatable vertical power, over running volume.",
    },
  },

  running: {
    Sprinter: {
      patterns: { sprint: 8, jump: 6, hinge: 6, squat: 4 },
      movements: {
        long_run: -9, progression_run: -8, threshold_run: -7, easy_run: -6, fartlek_run: -5,
        recovery_run: -3, tempo_runs: -3,
      },
      essentials: ["flying_sprints", "nordic_curl"],
      note: "Maximum velocity and the posterior chain that produces it — very little steady running.",
    },
    "800m/1500m": {
      patterns: { conditioning: 5, sprint: 5, hinge: 4, jump: 3 },
      essentials: ["vo2_intervals"],
      note: "Both ends at once: the speed to kick and the aerobic power to still have it.",
    },
    "5k/10k": {
      patterns: { conditioning: 7, hinge: 3, core: 3, squat: -2 },
      essentials: ["threshold_run", "vo2_intervals"],
      note: "Threshold and VO2 work, with only enough strength training to stay durable.",
    },
    "Half marathon": {
      patterns: { conditioning: 7, core: 3, squat: -2, jump: -2 },
      essentials: ["long_run", "threshold_run"],
      note: "Aerobic volume and sustained threshold work; the gym is there to keep you running, not to add power.",
    },
    Marathon: {
      patterns: { conditioning: 8, core: 3, squat: -3, jump: -3, sprint: -3 },
      movements: { long_run: 9, progression_run: 7, easy_run: 5, threshold_run: 4, vo2_intervals: -4, shuttle_runs: -6 },
      essentials: ["long_run", "progression_run"],
      note: "Volume, the long run and fuelling practice — almost everything else is a distraction at this distance.",
    },
  },

  weightlifting: {
    Powerlifting: {
      patterns: { squat: 8, hinge: 7, push_h: 7, core: 4, sprint: -4 },
      movements: { incline_walk: 5, bike_intervals: 4, long_run: -8, threshold_run: -6, vo2_intervals: -6, easy_run: -4 },
      essentials: ["back_squat", "deadlift", "bench_press"],
      note: "The three lifts and what supports them; conditioning is there for recovery, not for its own sake.",
    },
    "Olympic lifting": {
      patterns: { jump: 8, squat: 7, hinge: 5, push_v: 5, conditioning: -3 },
      essentials: ["power_clean", "front_squat"],
      note: "Speed under the bar: triple extension, overhead position and the front squat that holds it up.",
    },
    "General strength": {
      patterns: { squat: 4, hinge: 4, push_h: 3, pull_h: 3 },
      essentials: [],
      note: "Balanced barbell strength across every pattern.",
    },
  },
};

/**
 * The profile for an athlete's PRIMARY position.
 *
 * Primary only, deliberately. Someone who plays wing and full-back gets wing
 * training; averaging two profiles produces a programme built for nobody, which
 * is the thing being fixed. Skill work already covers every position they play
 * (see skillForSession) because ball drills are cheap to include and strength
 * blocks are not.
 */
export function positionProfile(
  sport: SportId | undefined | null,
  position: string | string[] | undefined | null
): PositionProfile | null {
  if (!sport) return null;
  const primary = positionList(position)[0];
  if (!primary) return null;
  return PROFILES[sport]?.[primary] ?? null;
}

/** Every position this module has an opinion about, for the tests. */
export function profiledPositions(sport: SportId): string[] {
  return Object.keys(PROFILES[sport] ?? {});
}
