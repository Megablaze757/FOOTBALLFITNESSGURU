import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read a profile without letting one unmigrated column take the whole row down.
 *
 * WHAT WENT WRONG. Four columns were added to the app — `timezone`,
 * `meal_plan_swaps`, `meal_plan_recent`, `meal_plan_starred` — and the
 * migrations that create them had not been run against production. PostgREST
 * does not skip a column it doesn't recognise; it rejects the ENTIRE query with
 * `42703 column profiles.meal_plan_swaps does not exist`. So `profile` came
 * back null, and every field on it read as absent: height, weight, sex, diet
 * pattern, and the plan seed itself. The meal plan page didn't render an error,
 * it rendered a brand new athlete who had never set anything up.
 *
 * The lesson is not "remember to run migrations". It is that a SELECT naming N
 * columns is an all-or-nothing contract with the database, and shipping a
 * client that depends on a column the database may not have yet is a deploy
 * ordering hazard every single time. The client and the schema roll out
 * separately and there is no arrangement of the two that removes the window.
 *
 * So: ask for everything, and if the database says no, ask again for only the
 * columns that have been there for ages. A feature whose column is missing
 * degrades on its own — no starred meals, no saved swaps — and the athlete's
 * actual profile still loads.
 */
export async function selectProfile<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
  /** Columns that have existed long enough to rely on. */
  stable: string,
  /** Columns from recent migrations, which production may not have yet. */
  optional: string[]
): Promise<{ data: T | null; missing: string[] }> {
  const all = optional.length ? `${stable}, ${optional.join(", ")}` : stable;
  const first = await supabase.from("profiles").select(all).eq("id", userId).maybeSingle();
  if (!first.error) return { data: first.data as T | null, missing: [] };

  // 42703 is "undefined column". Anything else — a network failure, RLS, a
  // malformed filter — is a real error and retrying with fewer columns would
  // just hide it behind a second identical failure.
  if (first.error.code !== "42703") return { data: null, missing: [] };

  const retry = await supabase.from("profiles").select(stable).eq("id", userId).maybeSingle();
  if (retry.error) return { data: null, missing: optional };

  // Named so the caller can log precisely which migration is outstanding
  // instead of leaving someone to work it out from a blank page.
  if (optional.length) {
    console.warn(
      `[profile] columns not in the database yet: ${optional.join(", ")}. ` +
      `Those features are off until the migrations are applied; everything else loaded.`
    );
  }
  return { data: retry.data as T | null, missing: optional };
}
