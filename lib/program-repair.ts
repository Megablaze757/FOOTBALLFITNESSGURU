import { buildBlock, type ProgramPlan, type ProgramSession, type ProgramDrill, type EngineInput } from "./engine";
import type { Slot } from "./movements";

/**
 * Put the warm-up, conditioning and cool-down back into an AI-generated plan.
 *
 * WHY THIS EXISTS. `/coach` prefers a plan from the Cloudflare Worker and falls
 * back to the on-device engine only when the call fails. The only check on what
 * comes back is `if (!data?.plan) throw` — so any plan-shaped object is shown to
 * the athlete exactly as the model wrote it.
 *
 * That broke in production, and it broke silently: programs that used to open
 * with mobility work and end with a stretch started arriving as a list of lifts.
 * Reported as "before they had warmups stretching running, now they don't". The
 * local engine was never at fault — it still builds A-skips, ankle rocks, hill
 * repeats and a couch stretch into every session. The Worker changed, and the
 * Worker's source is not in this repository, so nothing here could have caught
 * it in review.
 *
 * A MISSING WARM-UP IS NOT A STYLE DIFFERENCE. This is an app whose entire
 * premise is managing injury risk — it computes ACWR, it tracks soreness, it
 * tells people to deload. Sending an athlete into depth drops cold, and
 * finishing with nothing, contradicts the thing the rest of the product is for.
 *
 * WHY REPAIR RATHER THAN REJECT. Throwing the plan away and using the local
 * engine would also be safe, and would lose whatever the model got right about
 * this specific athlete. The main work is the part worth keeping; the scaffolding
 * is the part that is mechanical, well-tested here, and easy to restore. So the
 * AI keeps the middle of the session and the engine supplies the ends.
 */

/**
 * Slots a session must have, and where a replacement goes.
 *
 * CONDITIONING IS IN THIS LIST, and that is the "running" half of the report.
 * Every goal in the local engine's SLOTS table allocates at least one
 * conditioning block — a strength day that ends at the cool-down with no
 * aerobic work in it was itself fixed here once before. So a returned session
 * with no conditioning is missing something the engine considers structural,
 * not something the model chose to leave out.
 *
 * Order matters: the warm-up opens, conditioning goes after the lifting and
 * before the stretch, the cool-down closes.
 */
const REQUIRED: { slot: Slot; where: "start" | "beforeCooldown" | "end" }[] = [
  { slot: "warmup", where: "start" },
  { slot: "conditioning", where: "beforeCooldown" },
  { slot: "cooldown", where: "end" },
];

export interface RepairReport {
  /** Sessions that were missing something, and what. */
  repaired: { day: number; added: Slot[] }[];
  /** True when the incoming plan had no slot information at all. */
  slotless: boolean;
}

/**
 * Does this plan carry slot labels?
 *
 * A v1 plan, or a model that ignored the schema, returns drills with no `slot`.
 * We cannot tell a warm-up from a main lift in that case, so we do not guess —
 * guessing wrongly would bolt a second warm-up onto a session that already had
 * one. Instead the caller is told, and treats the plan as unstructured.
 */
function hasSlots(plan: ProgramPlan): boolean {
  return plan.weeks.some((w) => w.sessions.some((s) => s.drills.some((d) => d.slot)));
}

/**
 * A donor session from the local engine, for the same goal and sport.
 *
 * Built once per repair rather than per session: `buildBlock` is deterministic
 * for a given input, and calling it forty times to pull two drills out would be
 * wasteful for no variation gain.
 */
function donorDrills(input: EngineInput): Record<Slot, ProgramDrill[]> {
  const out = {} as Record<Slot, ProgramDrill[]>;
  const local = buildBlock(input);
  for (const week of local.weeks) {
    for (const session of week.sessions) {
      for (const d of session.drills) {
        if (!d.slot) continue;
        (out[d.slot] ??= []).push(d);
      }
    }
  }
  return out;
}

/**
 * Ensure every session opens with a warm-up and closes with a cool-down.
 *
 * Returns the plan unchanged when it is already well-formed, so the common case
 * costs one pass and no allocation of a local block.
 */
export function repairPlan(plan: ProgramPlan, input: EngineInput): { plan: ProgramPlan; report: RepairReport } {
  const report: RepairReport = { repaired: [], slotless: false };

  if (!hasSlots(plan)) {
    // No slot information anywhere — see `hasSlots`. Nothing safe to do.
    report.slotless = true;
    return { plan, report };
  }

  const missingAnywhere = plan.weeks.some((w) =>
    w.sessions.some((s) => REQUIRED.some((r) => !s.drills.some((d) => d.slot === r.slot)))
  );
  if (!missingAnywhere) return { plan, report };

  const donors = donorDrills(input);

  const weeks = plan.weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session, i) => {
      const added: Slot[] = [];
      let drills = session.drills;

      for (const { slot, where } of REQUIRED) {
        if (drills.some((d) => d.slot === slot)) continue;
        const pool = donors[slot] ?? [];
        if (!pool.length) continue;
        // Rotated by session index so four sessions in a week don't all open
        // with the same two drills — the local engine varies these and a repair
        // that didn't would look obviously bolted on.
        const pick = pool[(i + week.week) % pool.length];
        const label = slot === "warmup" ? "warm-up" : slot === "cooldown" ? "cool-down" : "conditioning";
        const tagged: ProgramDrill = {
          ...pick,
          reason: `${pick.reason} (added — the generated session had no ${label})`,
        };
        if (where === "start") {
          drills = [tagged, ...drills];
        } else if (where === "end") {
          drills = [...drills, tagged];
        } else {
          // Before the cool-down if there is one, otherwise at the end. The
          // cool-down may have been added a moment ago in this same loop, which
          // is why this reads the current array rather than the original.
          const at = drills.findIndex((d) => d.slot === "cooldown");
          drills = at === -1
            ? [...drills, tagged]
            : [...drills.slice(0, at), tagged, ...drills.slice(at)];
        }
        added.push(slot);
      }

      if (added.length) report.repaired.push({ day: session.day, added });
      return { ...session, drills } satisfies ProgramSession;
    }),
  }));

  return { plan: { ...plan, weeks }, report };
}

/**
 * Whether a plan looks structurally complete.
 *
 * Separate from `repairPlan` so callers can log or surface the problem without
 * changing anything — used by the tests, and available if we ever want to tell
 * an admin that the backend is returning malformed plans.
 */
export function planStructureIssues(plan: ProgramPlan): string[] {
  const issues: string[] = [];
  if (!hasSlots(plan)) return ["no drill in the plan carries a slot label"];
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      for (const { slot } of REQUIRED) {
        if (!s.drills.some((d) => d.slot === slot)) {
          issues.push(`week ${w.week} day ${s.day}: no ${slot}`);
        }
      }
    }
  }
  return issues;
}
