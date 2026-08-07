// =============================================================================
// Diet notes → a weekly eating schedule.
//
// The meal planner used to read notes only for foods to avoid, so a note like
// "I eat out on Tuesdays" changed nothing and the athlete was still handed a
// Tuesday dinner to cook. That reads as the app not listening, and it makes the
// shopping list wrong too — you buy ingredients for a meal you were never going
// to make.
//
// This parses the scheduling half of a note: which meals, on which days, the
// athlete isn't cooking. Same approach as lib/constraints.ts — a small, honest
// vocabulary that reports back what it understood, rather than pretending to
// understand arbitrary English. Pure + tested.
// =============================================================================

import type { Slot } from "./meal-plan";

/** dayIndex is 0 = Monday, matching the planner's week. */
export interface MealSkip {
  day: number;
  slot: Slot;
  reason: string;
}

export interface DietSchedule {
  skips: MealSkip[];
  /**
   * Day indices (0 = Monday) the athlete trains or plays on.
   *
   * Empty means they didn't say, and the plan stays flat — a guess about which
   * days somebody trains is worse than no guess, because it moves food off a
   * day they might be doing a double session.
   */
  trainingDays: number[];
  /** What the parser understood, shown back to the athlete. */
  summary: string[];
}

export const EMPTY_SCHEDULE: DietSchedule = { skips: [], trainingDays: [], summary: [] };

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DAY_WORDS: { re: RegExp; days: number[] }[] = [
  { re: /\bmon(day)?s?\b/i, days: [0] },
  { re: /\btue(s|sday)?s?\b/i, days: [1] },
  { re: /\bwed(nesday)?s?\b/i, days: [2] },
  { re: /\bthu(r|rs|rsday)?s?\b/i, days: [3] },
  { re: /\bfri(day)?s?\b/i, days: [4] },
  { re: /\bsat(urday)?s?\b/i, days: [5] },
  { re: /\bsun(day)?s?\b/i, days: [6] },
  { re: /\bweekends?\b/i, days: [5, 6] },
  { re: /\bweekdays?\b/i, days: [0, 1, 2, 3, 4] },
];

const SLOT_WORDS: { re: RegExp; slot: Slot }[] = [
  { re: /\bbreakfasts?\b|\bbrekkie\b/i, slot: "Breakfast" },
  { re: /\blunch(es)?\b/i, slot: "Lunch" },
  { re: /\bdinners?\b|\bteas?\b|\bevening meals?\b|\bsuppers?\b/i, slot: "Dinner" },
  { re: /\bsnacks?\b/i, slot: "Snack" },
];

// "I'm not cooking this one" — eating out, ordering in, or at someone else's.
const EATING_OUT = /\beat(ing)? out\b|\bate out\b|\beat food out\b|\bmeal out\b|\bout for (lunch|dinner|tea|breakfast)\b|\btake ?away\b|\btakeout\b|\brestaurant\b|\border(ing)? in\b|\bgo(ing)? out to eat\b|\bat my (mum|mums|mother|parents|nan|nans|girlfriend|boyfriend|partner)'?s?\b/i;

// "I don't eat this meal" — skipping or fasting.
const SKIPPING = /\bskip(s|ping|ped)?\b|\bdon'?t eat\b|\bdo not eat\b|\bnever eat\b|\bno\b|\bwithout\b/i;
const FASTING = /\bfast(ing)?\b|\bintermittent\b|\b16:8\b|\buntil (noon|midday|12)\b/i;

/**
 * "This is a day I do something hard."
 *
 * Deliberately narrow. It has to catch the ways people actually write it —
 * "I train Mon Wed Fri", "gym tuesdays and thursdays", "match on Saturday" —
 * without catching "I train hard so I need more protein", which names no day
 * and would otherwise mark the whole week. That is handled by requiring days:
 * see the `days.length` check at the call site.
 */
const TRAINING = /\btrain(ing|s)?\b|\bgym\b|\bsessions?\b|\bmatch(es|day|days)?\b|\bgames?\b|\bfixtures?\b|\bpractice\b|\bworkouts?\b|\blift(ing|s)?\b|\brun(ning|s)?\b|\bplay(ing|s)?\b/i;
// "no gym on Sundays" is a REST day being named, not a training day.
const NEGATED = /\bno\b|\bnot\b|\bnever\b|\brest\b|\boff\b|\bdon'?t\b|\bdo not\b/i;

function clauses(text: string): string[] {
  return text.split(/[.;\n]|\bbut\b|\band\b|\balso\b/i).map((c) => c.trim()).filter(Boolean);
}

function daysIn(clause: string): number[] {
  const out = new Set<number>();
  for (const { re, days } of DAY_WORDS) if (re.test(clause)) days.forEach((d) => out.add(d));
  return [...out];
}

function slotIn(clause: string): Slot | null {
  for (const { re, slot } of SLOT_WORDS) if (re.test(clause)) return slot;
  return null;
}

function listDays(days: number[]): string {
  const names = days.map((d) => DAY_NAMES[d]);
  if (names.length === 1) return `${names[0]}s`;
  return names.slice(0, -1).map((n) => `${n}s`).join(", ") + ` and ${names[names.length - 1]}s`;
}

/**
 * Parse the scheduling half of a dietary note.
 *
 * "Eating out" with no meal named is read as dinner, which is what people
 * overwhelmingly mean — but the assumption is stated in the summary so the
 * athlete can correct it rather than silently getting the wrong thing.
 */
export function parseSchedule(notes: string | null | undefined): DietSchedule {
  const text = (notes ?? "").trim();
  if (text.length < 3) return { skips: [], trainingDays: [], summary: [] };

  const skips: MealSkip[] = [];
  const summary: string[] = [];
  const seen = new Set<string>();
  const training = new Set<number>();

  const add = (days: number[], slot: Slot, reason: string) => {
    for (const day of days) {
      const key = `${day}:${slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      skips.push({ day, slot, reason });
    }
  };

  /**
   * The intent from the previous clause, so a trailing day list inherits it.
   *
   * `clauses()` splits on "and", which is right for "I love chicken but no
   * fish" and wrong for a list of days. "I eat out on Tuesdays and Thursdays"
   * became "I eat out on Tuesdays" plus a bare "Thursdays" — the second had no
   * eating-out phrase in it, so it was dropped, and Thursday's dinner was
   * planned, shopped for and cooked anyway.
   *
   * That is the most natural way anyone would write it, and it silently cost
   * them a meal's worth of food every week.
   */
  let carried: { out: boolean; fasting: boolean; namedSlot: Slot | null } | null = null;
  /**
   * Training intent carries across "and" for the same reason eating out does.
   *
   * "I train Monday, Wednesday and Friday" splits into three clauses and only
   * the first contains the word "train" — so Friday was silently dropped and
   * the athlete's plan fed them a rest day on a training day. That is the most
   * natural way anyone would write it.
   */
  let carriedTraining = false;

  for (const clause of clauses(text)) {
    let out = EATING_OUT.test(clause);
    let fasting = FASTING.test(clause);
    let namedSlot = slotIn(clause);
    // A bare "no lunch on Fridays" only counts as skipping when a meal is named;
    // otherwise "no dairy" would wipe out someone's whole week.
    let skipping = !out && !fasting && namedSlot !== null && SKIPPING.test(clause);

    const days = daysIn(clause);

    /**
     * A clause that is NOTHING BUT DAYS continues the one before it.
     *
     * Deliberately strict: the clause must contain days and no intent of its
     * own. "I eat out Tuesdays and I skip breakfast" is unaffected, because the
     * second half carries its own meaning and never reaches this.
     */
    if (!out && !fasting && !skipping && days.length > 0 && carried) {
      out = carried.out;
      fasting = carried.fasting;
      namedSlot = carried.namedSlot;
      skipping = !out && !fasting && namedSlot !== null;
    }

    /**
     * Training days are read INDEPENDENTLY of the eating-out logic below.
     *
     * They're a different kind of fact about the same sentence — "I train
     * Tuesdays and Thursdays and eat out on Fridays" says both — so this runs
     * before the `continue` that drops clauses with no meal intent in them.
     */
    const negated = NEGATED.test(clause);
    const saysTraining = TRAINING.test(clause) && !negated;
    // A clause that is nothing but days inherits the previous clause's intent.
    const bareDays = days.length > 0 && !TRAINING.test(clause) && !negated
      && !EATING_OUT.test(clause) && !FASTING.test(clause) && slotIn(clause) === null;
    if (days.length > 0 && (saysTraining || (bareDays && carriedTraining))) {
      for (const d of days) training.add(d);
      carriedTraining = true;
    } else if (negated || (TRAINING.test(clause) && negated)) {
      carriedTraining = false;
    }

    if (!out && !fasting && !skipping) continue;
    carried = { out, fasting, namedSlot };
    const everyDay = days.length === 0;
    const targetDays = everyDay ? [0, 1, 2, 3, 4, 5, 6] : days;
    const slot: Slot = namedSlot ?? (fasting ? "Breakfast" : "Dinner");
    const when = everyDay ? "every day" : listDays(targetDays);

    if (out) {
      add(targetDays, slot, "Eating out");
      summary.push(
        namedSlot
          ? `No ${slot.toLowerCase()} planned on ${when} — you're eating out.`
          : `No dinner planned on ${when} — you said you're eating out (say "eating out at lunch" if you meant a different meal).`
      );
    } else if (fasting) {
      add(targetDays, slot, "Fasting");
      summary.push(`Skipping ${slot.toLowerCase()} ${when} — you're fasting.`);
    } else {
      add(targetDays, slot, "You skip this meal");
      summary.push(`No ${slot.toLowerCase()} planned ${when === "every day" ? "at all" : `on ${when}`}.`);
    }
  }

  const trainingDays = [...training].sort((a, b) => a - b);
  // Naming every day as a training day is the same as naming none: there is
  // nothing to cycle food between.
  const cycled = trainingDays.length > 0 && trainingDays.length < 7 ? trainingDays : [];
  if (cycled.length) {
    summary.push(
      `Training on ${listDays(cycled)} — those days get more food, the rest get a little less.`
    );
  }

  return { skips, trainingDays: cycled, summary };
}

/** Is this meal slot skipped on this day? Returns the reason, or null. */
export function skipReason(schedule: DietSchedule, dayIndex: number, slot: Slot): string | null {
  return schedule.skips.find((s) => s.day === dayIndex && s.slot === slot)?.reason ?? null;
}
