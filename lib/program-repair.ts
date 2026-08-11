import { buildBlock, type ProgramPlan, type ProgramSession, type ProgramDrill, type EngineInput } from "./engine";
import { MOVEMENTS, type Slot } from "./movements";

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
  /** Drills whose slot was recovered by name from the movement library. */
  inferred: number;
  /** Sessions added because the backend returned fewer days than were asked for. */
  toppedUp: { week: number; added: number }[];
}

/**
 * Does this plan carry slot labels?
 *
 * A v1 plan, or a model that ignored the schema, returns drills with no `slot`.
 */
function hasSlots(plan: ProgramPlan): boolean {
  return plan.weeks.some((w) => w.sessions.some((s) => s.drills.some((d) => d.slot)));
}

/**
 * Movement name -> the slot it belongs to, from the app's own library.
 *
 * THIS IS THE FIX FOR THE HALF THIS MODULE USED TO GIVE UP ON. The first
 * version bailed the moment a plan carried no slot labels at all: "we cannot
 * tell a warm-up from a main lift, so we do not guess". Perfectly sound
 * reasoning, and it left the reported bug entirely unfixed — a backend that
 * returns bare drills with no slots got NO scaffolding restored, which is the
 * exact case being complained about. The repair only ever worked on plans that
 * were already mostly right.
 *
 * It is not a guess when you can look it up. Every drill the model can sensibly
 * name is in MOVEMENTS, and every movement there already declares its slot —
 * `ankle_rocks` is a warm-up, `couch_stretch` a cool-down, `hill_repeats`
 * conditioning. Matching by name recovers the structure the backend dropped
 * instead of inventing it.
 *
 * Normalised loosely because a model writes "Ankle Rocks" or "ankle rocks
 * (each side)" where the library says "Ankle rocks".
 */
const SLOT_BY_NAME: Map<string, Slot> = new Map(
  MOVEMENTS.map((m) => [normaliseName(m.name), m.slot]),
);

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    // Trailing qualifiers a model adds and the library doesn't carry.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The slot a drill belongs to: its own label if it has one, else looked up.
 *
 * Returns undefined when the name isn't in the library, which is the honest
 * answer for a movement the model invented — and it stays unslotted, so the
 * scaffolding check below treats the session as missing that block and adds a
 * real one rather than assuming the invention covered it.
 */
function slotOf(drill: ProgramDrill): Slot | undefined {
  return drill.slot ?? lookupSlot(drill.name);
}

/**
 * The slot for a movement name, exact first and then by whole phrase.
 *
 * A model writes "Ankle rocks" where the library says "Half-kneeling ankle
 * rocks", and an exact match misses it. Containment closes that gap, but only
 * for names of TWO WORDS OR MORE in the direction being searched — "squat"
 * alone appears inside a dozen movements across four different slots, and
 * matching on it would label a back squat as a warm-up.
 *
 * WHICH WAY THIS SHOULD FAIL, when it fails. A miss means we think the session
 * has no warm-up and add one, so a session that already had it under an
 * unfamiliar name gets a redundant second. A false match means we think a
 * warm-up is present when it isn't and add nothing — which is the original bug,
 * an athlete going into depth drops cold. Redundancy is the cheaper mistake, so
 * this stays deliberately strict and only matches whole phrases.
 */
function lookupSlot(rawName: string): Slot | undefined {
  const name = normaliseName(rawName);
  if (!name) return undefined;

  const exact = SLOT_BY_NAME.get(name);
  if (exact) return exact;

  const words = name.split(" ").length;
  const hits = new Set<Slot>();
  for (const [libName, slot] of SLOT_BY_NAME) {
    const libWords = libName.split(" ").length;
    if (words >= 2 && libName.includes(` ${name} `)) hits.add(slot);
    else if (words >= 2 && (libName.startsWith(`${name} `) || libName.endsWith(` ${name}`))) hits.add(slot);
    else if (libWords >= 2 && (name.includes(` ${libName} `) || name.startsWith(`${libName} `) || name.endsWith(` ${libName}`))) hits.add(slot);
  }
  // Two different slots both claim it, so the name doesn't identify one. Treat
  // it as unknown and let the scaffolding check decide.
  return hits.size === 1 ? [...hits][0] : undefined;
}

/**
 * A plan with every drill's slot filled in where the library knows it.
 *
 * Done once, up front, so the rest of the repair sees one consistent shape and
 * does not have to care whether the backend labelled anything.
 */
function withInferredSlots(plan: ProgramPlan): { plan: ProgramPlan; inferred: number } {
  let inferred = 0;
  const weeks = plan.weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session) => ({
      ...session,
      drills: session.drills.map((d) => {
        if (d.slot) return d;
        const slot = lookupSlot(d.name);
        if (!slot) return d;
        inferred++;
        return { ...d, slot };
      }),
    })),
  }));
  // The original object when there was nothing to infer, so a well-formed plan
  // costs one pass and no allocation — and callers comparing by reference to
  // check "was this touched" still get the right answer.
  return inferred ? { plan: { ...plan, weeks }, inferred } : { plan, inferred: 0 };
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
 * Bring each week up to the number of sessions the athlete actually asked for.
 *
 * A SHORT WEEK IS MISSING TRAINING, NOT MISSING SCAFFOLDING. Someone who sets
 * "5 days" has told us what they can commit to; a backend that returns three is
 * under-delivering by 40%, and unlike an absent warm-up there is nothing
 * cosmetic about it. It also goes completely unnoticed — the only check on the
 * response was that a `plan` key existed, and three well-formed sessions look
 * exactly as valid as five.
 *
 * The missing days come from the local engine, which honours `daysPerWeek` by
 * construction. That keeps whatever the model got right about this athlete and
 * fills the gap rather than throwing the whole plan away for one bad field —
 * the same trade the rest of this module makes.
 *
 * Only ever ADDS. A backend returning MORE sessions than requested is not
 * corrected: it may be deliberate (a deload week structured differently), and
 * deleting training somebody has been given is a worse mistake than leaving an
 * extra day they can skip.
 */
function topUpSessions(
  plan: ProgramPlan,
  input: EngineInput,
  report: RepairReport,
): ProgramPlan {
  const wanted = input.daysPerWeek;
  if (!wanted || wanted < 1) return plan;
  if (plan.weeks.every((w) => w.sessions.length >= wanted)) return plan;

  const local = buildBlock(input);
  return {
    ...plan,
    weeks: plan.weeks.map((week, wi) => {
      const short = wanted - week.sessions.length;
      if (short <= 0) return week;

      // Take the days the model didn't cover from the matching local week, so
      // the added sessions follow the same periodisation as the rest of it.
      const donorWeek = local.weeks[wi] ?? local.weeks[local.weeks.length - 1];
      const extra = (donorWeek?.sessions ?? []).slice(week.sessions.length, wanted);
      if (!extra.length) return week;

      report.toppedUp.push({ week: week.week, added: extra.length });
      return {
        ...week,
        sessions: [
          ...week.sessions,
          // Renumbered to continue the week rather than restart at 1, which
          // would give a week two "day 1"s and break the check-in's day lookup.
          ...extra.map((s, i) => ({ ...s, day: week.sessions.length + i + 1 })),
        ],
      };
    }),
  };
}

/**
 * Ensure every session opens with a warm-up and closes with a cool-down.
 *
 * Returns the plan unchanged when it is already well-formed, so the common case
 * costs one pass and no allocation of a local block.
 */
export function repairPlan(plan: ProgramPlan, input: EngineInput): { plan: ProgramPlan; report: RepairReport } {
  const slotlessInput = !hasSlots(plan);

  // Recover what the library can identify by name BEFORE deciding anything is
  // missing. Without this a session that opens with ankle rocks and closes with
  // a couch stretch — but carries no labels — gets a second warm-up and a
  // second stretch bolted on, which is the failure the original bail-out was
  // written to avoid. Inference is what makes the repair safe on an unlabelled
  // plan rather than a reason to skip it.
  const { plan: inferredPlan, inferred } = withInferredSlots(plan);
  const report: RepairReport = { repaired: [], slotless: slotlessInput, inferred, toppedUp: [] };

  // Days first, then scaffolding — so a session added here gets checked for a
  // warm-up by the same pass as the rest, rather than being trusted because it
  // came from the engine.
  const labelled = topUpSessions(inferredPlan, input, report);

  const missingAnywhere = labelled.weeks.some((w) =>
    w.sessions.some((s) => REQUIRED.some((r) => !s.drills.some((d) => d.slot === r.slot)))
  );
  if (!missingAnywhere) return { plan: labelled, report };


  const donors = donorDrills(input);

  const weeks = labelled.weeks.map((week) => ({
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

  return { plan: { ...labelled, weeks }, report };
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
