/**
 * Fixing or removing a weight that has already been recorded.
 *
 * WHY IT NEEDS A MODULE AND NOT A DELETE BUTTON. A weight lives in one of two
 * tables depending on where it was typed — `body_logs` if they weighed in on
 * the Body page, `daily_check_ins` if they answered the question in the daily
 * log — and the right way to remove it is different in each, in a way that is
 * easy to get catastrophically wrong.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DELETING A WEIGHT MUST NEVER DELETE THE DAY.
 *
 * The obvious implementation of "delete this entry" is to delete the row it
 * came from. For a check-in weight that row also holds their sleep, soreness,
 * mood, readiness and the session they logged — so tapping the bin next to a
 * mistyped weight would silently destroy a day of training history, and the
 * athlete would have no idea until a streak broke.
 *
 * So a check-in weight is NULLED, never deleted, and there is no code path in
 * this module that can issue a delete against daily_check_ins. A weigh-in row
 * is deleted only when the weight was the only thing on it — if there is a body
 * fat reading or a progress photo, that row is nulled too.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, so the rule can be tested rather than trusted. The caller executes
 * whatever comes back.
 */

import type { Bodyweight } from "@/lib/bodyweight";

/** A weight a human could plausibly be. */
export const MIN_KG = 20;
export const MAX_KG = 400;

/**
 * A change big enough to be worth asking about.
 *
 * The two mistakes people actually make are a slipped decimal point (8.5 for
 * 85) and a stray digit (855). Both land far outside a fortnight of real
 * change, and both are inside the plausible range, so a range check alone
 * never sees them. This is a confirmation, not a refusal — somebody coming
 * back after six months off genuinely has moved twelve kilos.
 */
export const SURPRISE_KG = 10;

/**
 * `userId` is in every mutation, and it is not redundant.
 *
 * RLS already scopes these tables to the owner, so a bare date filter works
 * today. It works because of a policy, and policies get added: `body_logs`
 * already carries a coach read and has carried an admin read, and the day
 * somebody widens one of those to `for all`, an update matched on date alone
 * starts editing other people's weights. Naming the owner costs one clause and
 * removes the whole class.
 */
export type Mutation =
  | {
      action: "update";
      table: "body_logs" | "daily_check_ins";
      dateColumn: "log_date" | "check_in_date";
      date: string;
      userId: string;
      patch: { weight_kg: number | null };
    }
  | { action: "delete"; table: "body_logs"; dateColumn: "log_date"; date: string; userId: string }
  | { action: "refuse"; reason: string };

/** What else is on the row a weigh-in came from. */
export interface RowContext {
  /** True when the body_logs row also holds a body fat reading or a photo. */
  hasOtherBodyData?: boolean;
}

function target(entry: Bodyweight, userId: string):
  | { table: "body_logs"; dateColumn: "log_date"; date: string; userId: string }
  | { table: "daily_check_ins"; dateColumn: "check_in_date"; date: string; userId: string }
  | null {
  if (!entry.date || !userId) return null;
  return entry.source === "weigh-in"
    ? { table: "body_logs", dateColumn: "log_date", date: entry.date, userId }
    : entry.source === "check-in"
      ? { table: "daily_check_ins", dateColumn: "check_in_date", date: entry.date, userId }
      : null;
}

/** Is this a number we will store at all? Returns the complaint, or null. */
export function weightError(kg: number): string | null {
  if (!Number.isFinite(kg)) return "Enter a number.";
  if (kg <= 0) return "A weight has to be more than zero.";
  if (kg < MIN_KG) return `That looks too low — did you mean ${(kg * 10).toFixed(1)} kg?`;
  if (kg > MAX_KG) return "That looks too high. Check the number.";
  return null;
}

/**
 * Worth a "are you sure?", given what they weighed last time.
 *
 * Null when there is nothing to compare against — the first entry cannot be
 * surprising.
 */
export function surpriseAgainst(kg: number, previousKg: number | null | undefined): string | null {
  if (typeof previousKg !== "number" || !Number.isFinite(previousKg)) return null;
  const gap = Math.abs(kg - previousKg);
  if (gap < SURPRISE_KG) return null;
  return `That is ${gap.toFixed(1)} kg away from your last entry of ${previousKg} kg. Save it anyway?`;
}

/** Change an existing entry to a new weight. */
export function editWeight(entry: Bodyweight, kg: number, userId: string): Mutation {
  const err = weightError(kg);
  if (err) return { action: "refuse", reason: err };

  const t = target(entry, userId);
  if (!t) {
    /**
     * The profile fallback carries no date, so there is no row to address —
     * and it only ever answers when nothing dated exists. Editing it here
     * would mean guessing which of two tables to write a new row into, on a
     * page about correcting history.
     */
    return { action: "refuse", reason: "That weight came from your profile and is edited there." };
  }

  return { action: "update", ...t, patch: { weight_kg: Math.round(kg * 10) / 10 } };
}

/**
 * Remove an entry, keeping everything else that shares its row.
 *
 * See the header: this is the function that must never issue a delete against
 * daily_check_ins, and the type signature makes that impossible rather than
 * merely unlikely — Mutation's delete arm only admits body_logs.
 */
export function deleteWeight(entry: Bodyweight, userId: string, ctx: RowContext = {}): Mutation {
  const t = target(entry, userId);
  if (!t) return { action: "refuse", reason: "That weight came from your profile and is edited there." };

  if (t.table === "daily_check_ins") {
    // Nulled. The row is a day of training history that happens to carry a
    // weight, not a weight that happens to have a date.
    return { action: "update", ...t, patch: { weight_kg: null } };
  }

  return ctx.hasOtherBodyData
    ? { action: "update", ...t, patch: { weight_kg: null } }
    : { action: "delete", ...t };
}

/** What the button should warn about before it runs. Empty when it is routine. */
export function deleteWarning(entry: Bodyweight, userId: string, ctx: RowContext = {}): string {
  const plan = deleteWeight(entry, userId, ctx);
  if (plan.action === "refuse") return plan.reason;
  if (plan.action === "delete") return "Removes this weigh-in.";
  return entry.source === "check-in"
    ? "Removes the weight only — the rest of that day's log is kept."
    : "Removes the weight only — your body fat and photo for that day are kept.";
}
