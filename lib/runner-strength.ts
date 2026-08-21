// =============================================================================
// The strength work a runner's plan was missing entirely.
//
// WHAT WAS MEASURED. A runner on five days a week received five runs and ZERO
// strength sessions — not a light one, none. Every session in the block was a
// single run drill: no warm-up, no lifting, no cool-down.
//
// That is not a defensible runner's programme. Strength training is one of the
// few interventions with good evidence for BOTH fewer running injuries and
// better running economy, and it is in every serious plan. A runner who is only
// ever told to run is a runner who eventually stops running.
//
// WHERE IT GOES, AND WHY THAT IS THE WHOLE DESIGN. On the HARD days. The
// structure that makes a running plan work is polarised — roughly 80% of the
// running easy, the rest genuinely hard — and the fastest way to ruin it is to
// make the easy days moderate. Lifting on an easy day does exactly that: the
// run is easy, the session is not, and the athlete arrives at their next
// quality day tired. Stacking it onto a day that was already hard keeps the
// hard days hard and the easy days easy, which is the entire point.
//
// WHAT IT IS NOT. Not a bodybuilding session bolted onto a run. Two or three
// movements, heavy-ish, low volume: the posterior chain and single-leg work
// that running loads and that running alone does not build, plus the calf and
// hamstring work that the two most common running injuries come from.
//
// Pure + tested.
// =============================================================================

import type { ProgramDrill, ProgramSession } from "./engine";
import { MOVEMENTS } from "./movements";
import { drillSeconds } from "./session-time";

/**
 * The cap the time-budget pass puts on an endurance session, mirrored here.
 *
 * Duplicated rather than imported because lib/session-budget.ts imports the
 * volume model and the time model, and dragging both into the module that adds
 * five drills to a run would be a large dependency for one number. The
 * duplication is a contract: if ENDURANCE_SESSION_MAX_MINUTES moves, this moves.
 */
const ENDURANCE_CAP_MINUTES = 120;

/**
 * The warm-up and cool-down every session with working sets receives.
 *
 * Two prep drills and one stretch, at the fifteen-second changeover preparation
 * actually costs — see lib/session-time.ts.
 */
const SCAFFOLDING_MINUTES = 5;

/**
 * How many strength sessions a running week carries.
 *
 * TWO, OR NONE. A three-day runner got one, on the reasoning that somebody with
 * three days has little time and taking one of them half over for lifting is a
 * worse trade than doing it once. That reasoning does not survive the
 * arithmetic: one session of three sets is three sets a week, which is below
 * the maintenance floor — the dose at which a prescription starts doing
 * anything at all. Prescribing work that cannot work is worse than prescribing
 * none, because the athlete spends the time either way.
 *
 * So a runner training three or more days gets two slots, which puts every
 * movement at six sets a week and leaves at least one day of pure easy running
 * untouched. Two days a week is somebody running twice; there is no third day
 * to put it on and stacking it onto half their running would change what they
 * came for.
 */
export function strengthDaysFor(runDays: number): number {
  return runDays <= 2 ? 0 : 2;
}

/**
 * The movements, in the order they are done.
 *
 * Chosen by what running asks of the body and does not train:
 *
 *   a hinge or squat   the hips and glutes that produce the push-off
 *   single leg         running is a series of single-leg landings, and a
 *                      two-legged squat never asks one leg to hold the pelvis
 *   hamstring          the most-injured muscle in running, and eccentric work
 *                      is the intervention with the best evidence behind it
 *   calf               the second, and the one runners skip
 *   trunk              anti-rotation, because that is what the trunk does at
 *                      footstrike rather than flexing
 *
 * Named against the movement table so the drills carry real cues, real rest and
 * a real progression rather than being invented here.
 */
const RUNNER_LIFTS: { id: string; sets: number; reps: number; why: string }[] = [
  { id: "trap_bar_deadlift", sets: 3, reps: 5, why: "Builds the hip drive that pushes you off the ground, with less low-back cost than a barbell deadlift." },
  { id: "bulgarian_split_squat", sets: 3, reps: 8, why: "Running is a series of single-leg landings. This is the only way to load one at a time." },
  { id: "nordic_hamstring", sets: 3, reps: 6, why: "Eccentric hamstring work — the single best-evidenced way to not tear one." },
  { id: "eccentric_calf_raise", sets: 3, reps: 12, why: "The calf takes more load per stride than anything else, and it is the tissue runners never train." },
  // Three sets, not two. Two across the week's two slots is four sets — below
  // the maintenance floor, so the adductors were being given work that could
  // not do anything. Every movement here has to clear six.
  { id: "copenhagen_plank", sets: 3, reps: 20, why: "Holds the pelvis level at footstrike, which is where a lot of knee pain actually starts." },
];

const BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]));

/**
 * Fallbacks by name, for movements the table happens not to carry under that id.
 *
 * Silently dropping one would leave a runner with a two-exercise "strength
 * session" and no indication anything was missing — the absent-is-not-zero
 * failure this codebase keeps finding. If neither the id nor the name resolves,
 * the drill is built from what we know, which is enough to prescribe it.
 */
const FALLBACK_NAME: Record<string, string> = {
  trap_bar_deadlift: "Conventional deadlift",
  bulgarian_split_squat: "Bulgarian split squat",
  nordic_hamstring: "Nordic hamstring curl",
  eccentric_calf_raise: "Eccentric calf raises",
  copenhagen_plank: "Copenhagen plank",
};

const BY_NAME = new Map(MOVEMENTS.map((m) => [m.name.toLowerCase(), m]));

/**
 * How long the run in this session is, from the prescription the engine wrote.
 *
 * Read back rather than passed in, for the same reason `isHard` is passed in
 * rather than inferred: lib/running.ts holds the number and is deliberately
 * import-free. Zero when there is no run, which sorts a session with no running
 * in it to the front — correct, since that is a day with nothing to protect.
 */
/** The week's long run, which is a role rather than a duration. */
function isLongRun(session: ProgramSession): boolean {
  return /long run/i.test(session.title) || (session.drills ?? []).some((d) => /long run/i.test(d.name));
}

function runMinutes(session: ProgramSession): number {
  for (const d of session.drills ?? []) {
    const m = /(\d{1,3})\s*min/.exec(d.prescription ?? "");
    if (m) return Number(m[1]);
  }
  return 0;
}

function liftDrill(spec: (typeof RUNNER_LIFTS)[number], slot: "primary" | "secondary" | "accessory"): ProgramDrill | null {
  const movement = BY_ID.get(spec.id) ?? BY_NAME.get((FALLBACK_NAME[spec.id] ?? "").toLowerCase());
  if (!movement) return null;
  return {
    name: movement.name,
    sets: spec.sets,
    reps: spec.reps,
    slot,
    rest: movement.dose.rest,
    cue: movement.cue,
    reason: spec.why,
    intensity: "Leave 3 in the tank — this supports the running, it does not compete with it",
    progression: "Add a little weight when all sets are clean. Never chase a maximum in a running block.",
    tempo: movement.tempo,
  };
}

/**
 * The strength block: all five movements, every session, all block.
 *
 * IT USED TO ROTATE FOUR OF THE FIVE and every version of that was worse than
 * not rotating at all:
 *
 *   rotating per session   most movements landed at three sets a week, under
 *                          the maintenance floor — the dose at which a
 *                          prescription stops doing anything
 *   rotating per week      the hinge vanished in week two, taking the glutes
 *                          under maintenance, and no lift survived long enough
 *                          to be progressively loaded
 *   rotating per block     block one had no deadlift at all, and a runner's
 *                          strength block with no hip hinge is missing the
 *                          thing it is mostly for
 *
 * The rotation existed to keep the session short, and the sessions fit without
 * it: five movements is about twenty-five minutes, and a VO2 day plus lifting
 * comes to 95 against the two-hour cap on an endurance session.
 *
 * Variety is not the goal here and never was. Supporting strength is
 * progressive or it is pointless — you cannot add weight to a lift you meet
 * once a block — and the variety a runner's month needs comes from the running,
 * which changes every single session.
 */
export function runnerStrengthDrills(): ProgramDrill[] {
  return RUNNER_LIFTS
    .map((spec, i) => liftDrill(spec, i === 0 ? "primary" : i === 1 ? "secondary" : "accessory"))
    .filter((d): d is ProgramDrill => d !== null);
}

/**
 * Add the strength work to a running week.
 *
 * Chooses the hard days first and falls back to the longest runs when a week
 * has fewer hard days than strength slots — a deload week keeps one quality
 * session, so on that week the second block lands on the longest easy run,
 * which is the least bad remaining option and still not an easy day made
 * moderate for no reason.
 *
 * `isHard` is passed in rather than inferred, because the running engine knows
 * and a name rule would only guess.
 */
export function addRunnerStrength(
  sessions: ProgramSession[],
  isHard: (session: ProgramSession, index: number) => boolean,
): ProgramSession[] {
  const slots = strengthDaysFor(sessions.length);
  if (slots <= 0) return sessions;

  /**
   * How long the strength block takes, so a day can be checked for room.
   *
   * `drillSeconds` rather than arithmetic here, and the difference decides real
   * sessions: the first version charged a rest period after the final set of
   * every movement, which came out at 29 minutes against a true 22. On a
   * 92-minute easy run that overestimate is the whole reason a week loses its
   * second strength session — 92 + 29 is over the two-hour cap and 92 + 22 is
   * not. Estimating a cost twice is the same failure as not estimating it.
   *
   * SCAFFOLDING_MINUTES covers the warm-up and cool-down the checklist adds to
   * any session with working sets in it (lib/program-validate.ts). They are
   * part of what has to fit, and leaving them out would put the day over by
   * exactly the amount nobody counted.
   */
  const strengthMinutes = Math.ceil(
    runnerStrengthDrills().reduce((n, d) => n + drillSeconds(d), 0) / 60
  ) + SCAFFOLDING_MINUTES;

  const ranked = sessions.map((s, i) => ({
    s, i, hard: isHard(s, i), long: isLongRun(s), minutes: runMinutes(s),
    // Does the lifting actually fit on this day? An endurance session is capped
    // at two hours, and prescribing strength onto a day with no room does not
    // produce a longer session — the time-budget pass drops the lifts, and the
    // athlete gets a week whose strength dose is a third of what was intended
    // with nothing anywhere saying why.
    fits: runMinutes(s) + strengthMinutes <= ENDURANCE_CAP_MINUTES,
  }));
  /**
   * Hard days first. Then never the long run. Then the shortest day left.
   *
   * A three-day week has one quality session, so the second strength slot lands
   * on an easy day whatever the rule says, and WHICH easy day is the whole
   * decision. Two versions got it wrong before this one:
   *
   *   by position     put it on an 18km easy run and left a 14km one alone
   *   by duration     put it on the LONG RUN, because the mileage engine had
   *                   made that week's easy run the longer of the two
   *
   * The long run is the single most important session in a runner's week and
   * the last one to arrive at with tired legs — so it is excluded by name
   * rather than by length, because its length is not what makes it the long
   * run. Among what is left, the shortest day.
   */
  /**
   * ROOM IS A FILTER, NOT A PREFERENCE.
   *
   * It was a sort key first, and that is not strong enough: when no day had
   * room the sort still returned two, and the time-budget pass then stripped
   * one session back to a single deadlift with the run itself deleted. The
   * athlete's Tuesday read "Easy run + strength" and contained neither.
   *
   * A three-day runner at 55km a week genuinely cannot fit two full strength
   * sessions inside two-hour days — their easy run alone is 101 minutes. The
   * honest answer is one session that week, not two that get deleted. Whatever
   * survives here is prescribed in full.
   */
  const chosen = new Set(
    ranked
      .filter((r) => r.fits)
      .sort((a, b) =>
        Number(b.hard) - Number(a.hard)
        || Number(a.long) - Number(b.long)
        || a.minutes - b.minutes
        || a.i - b.i)
      .slice(0, slots)
      .map((r) => r.i)
  );

  return sessions.map((session, i) => {
    if (!chosen.has(i)) return session;
    // The same list every time, so the lifts can actually be loaded — see above.
    const drills = runnerStrengthDrills();
    if (!drills.length) return session;
    return {
      ...session,
      title: `${session.title} + strength`,
      // AFTER the run, always. Lifting first leaves the legs unable to hold
      // form at pace, and running form under fatigue is the thing the session
      // was for. The checklist's fatigue order deliberately does not apply
      // across a run and a lift — see lib/program-validate.ts, which orders
      // within the working block and leaves conditioning where it is.
      drills: [...session.drills, ...drills],
    };
  });
}
