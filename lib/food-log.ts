/**
 * Today's food, as a list you can change your mind about.
 *
 * The day used to be two numbers — calories eaten, and a macro blob. Once a
 * meal was logged it had dissolved into arithmetic: no way to see what the
 * 2,140 was made of, fix a portion you guessed wrong, or take back the meal you
 * ticked by accident. The only way out was retyping the totals by hand.
 *
 * So the list is the truth and the totals are derived. That is the whole design
 * rule here, and it is what stops the two disagreeing — which they did, the
 * moment anybody used both the tick-list and the manual boxes.
 *
 * Pure, so it can be tested without a database or a browser.
 */
import type { Macros } from "./meal-plan";

export type FoodSource = "plan" | "estimate" | "manual";

export interface FoodEntry extends Macros {
  /** Stable across edits — it is what the list keys on and what remove finds. */
  id: string;
  /** What the athlete sees. "Porridge with berries", not "meal_14". */
  label: string;
  source: FoodSource;
  /**
   * For a meal ticked off the plan, that meal's id.
   *
   * Un-ticking has to remove the entry the tick created, and matching on the
   * LABEL would delete the wrong row the day the plan serves the same dish
   * twice — which a weekly plan does routinely.
   */
  ref?: string;
  /** Optional detail for a manual quick add (portion, brand, context, etc.). */
  notes?: string;
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fats: 0 };

/** Sum of everything logged. The only way a total is ever produced. */
export function logTotals(entries: FoodEntry[]): Macros {
  return (entries ?? []).reduce(
    (t, e) => ({
      kcal: t.kcal + (Number(e.kcal) || 0),
      protein: t.protein + (Number(e.protein) || 0),
      carbs: t.carbs + (Number(e.carbs) || 0),
      fats: t.fats + (Number(e.fats) || 0),
    }),
    { ...ZERO }
  );
}

/** A short id. Only has to be unique within one day's list. */
export function entryId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function addEntry(entries: FoodEntry[], entry: Omit<FoodEntry, "id"> & { id?: string }): FoodEntry[] {
  return [...(entries ?? []), { ...entry, id: entry.id ?? entryId() }];
}

export function removeEntry(entries: FoodEntry[], id: string): FoodEntry[] {
  return (entries ?? []).filter((e) => e.id !== id);
}

/** Remove the entry a plan tick created. See FoodEntry.ref for why not by label. */
export function removeByRef(entries: FoodEntry[], ref: string): FoodEntry[] {
  const i = (entries ?? []).findIndex((e) => e.ref === ref);
  if (i < 0) return entries ?? [];
  return [...entries.slice(0, i), ...entries.slice(i + 1)];
}

/**
 * Re-scale an entry to a new calorie figure, keeping its macro ratio.
 *
 * Editing calories is the correction people actually make — "that was more like
 * 700 than 500" — and the macros have to follow or the day's protein quietly
 * stops matching its calories.
 *
 * A target of zero is refused rather than applied. Scaling is relative, so zero
 * would wipe the macros and leave nothing to scale back FROM; the same trap the
 * gram field fell into. Zero calories of food is a removal, and remove is a
 * button of its own.
 */
export function rescaleEntry(entry: FoodEntry, kcal: number): FoodEntry {
  if (!Number.isFinite(kcal) || kcal <= 0) return entry;
  const from = Number(entry.kcal) || 0;
  if (from <= 0) return { ...entry, kcal: Math.round(kcal) };
  const f = kcal / from;
  return {
    ...entry,
    kcal: Math.round(kcal),
    protein: Math.round(entry.protein * f),
    carbs: Math.round(entry.carbs * f),
    fats: Math.round(entry.fats * f),
  };
}

export function updateEntry(entries: FoodEntry[], id: string, next: FoodEntry): FoodEntry[] {
  return (entries ?? []).map((e) => (e.id === id ? next : e));
}

/**
 * Read entries off a database row.
 *
 * Tolerant on purpose: this column arrived in 0072, so every row written before
 * it has no entries at all, and a day that was logged the old way must not
 * render as a crash. It comes back as an empty list, and `entriesForDay` below
 * is what turns the totals on such a row back into something the list can hold.
 */
export function parseEntries(raw: unknown): FoodEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is FoodEntry =>
      !!e && typeof e === "object" &&
      typeof (e as FoodEntry).id === "string" &&
      typeof (e as FoodEntry).label === "string" &&
      Number.isFinite(Number((e as FoodEntry).kcal))
  );
}

/** Fixed, so re-reading a row that already carries one cannot mint a second. */
const CARRIED_ID = "carried";

/**
 * A day's list, INCLUDING the days that were logged before there was a list.
 *
 * Rows written before 0072 hold totals and no entries — and so does any row
 * written by the old quick-add buttons, which moved a number and recorded
 * nothing. Today's row in production reads 1,338 calories eaten against zero
 * entries for exactly that reason.
 *
 * Left alone, those days are a trap rather than a display problem: the totals
 * are recomputed by summing the list, so the first meal ticked on such a day
 * replaces 1,338 with the value of that one meal and the rest is gone. The day
 * looks fine right up until you touch it.
 *
 * So the totals are carried into a single entry and the list becomes the truth
 * immediately. Nothing is lost, the day is visible and editable like any other,
 * and the next save writes a row that agrees with itself.
 */
export function entriesForDay(raw: unknown, carried: Partial<Macros> | null): FoodEntry[] {
  const parsed = parseEntries(raw);
  if (parsed.length) return parsed;

  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const kcal = n(carried?.kcal);
  const protein = n(carried?.protein);
  const carbs = n(carried?.carbs);
  const fats = n(carried?.fats);
  // Any of the four. A row can carry macros with a null calorie figure, and
  // dropping it because kcal happened to be zero would lose the protein.
  if (kcal + protein + carbs + fats === 0) return [];

  return [{ id: CARRIED_ID, label: "Logged earlier", source: "manual", kcal, protein, carbs, fats }];
}

/** What a quick-add row is called in the list. */
export const QUICK_ADD_LABEL = "Quick add";

/**
 * Log a bare calorie figure — a coffee and a banana, without describing them.
 *
 * An ENTRY, not a bump to a running total. The buttons used to call
 * `setEaten(c => c + 200)` and stop there, which meant the 200 was never
 * written to the database and, worse, was wiped by the next thing logged:
 * ticking a meal recomputes the day by summing the list, and the 200 was not in
 * the list. Tap +200, tick your breakfast, and the 200 is gone.
 *
 * No macros, because none were given. Guessing a split for an unnamed 200 kcal
 * would put numbers in the protein ring that nobody ever told us.
 */
export function addQuickCalories(entries: FoodEntry[], kcal: number): FoodEntry[] {
  const n = Math.round(Number(kcal) || 0);
  // Zero or negative is not a log. Removing is what the list's own ✕ is for,
  // and a "-200" entry would make the day's arithmetic unexplainable.
  if (!Number.isFinite(n) || n <= 0) return entries ?? [];
  return addEntry(entries ?? [], {
    kcal: n, protein: 0, carbs: 0, fats: 0, label: QUICK_ADD_LABEL, source: "manual",
  });
}
