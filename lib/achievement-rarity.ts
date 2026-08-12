// =============================================================================
// How many other people have this badge?
//
// Achievements are DERIVED — the client runs each one's test() over the
// athlete's own counts and the answer falls out. That is deliberate and it
// stays: one definition per badge, in TypeScript, tested. The cost is that an
// unlock exists only in the browser that worked it out, so nothing in the
// system knows what anyone else has, and rarity cannot be asked.
//
// So the client posts what it computed to `achievement_unlocks` (0074) and SQL
// does nothing but count. Deriving these rules a second time in SQL would mean
// keeping two copies of fifteen tests in step forever, for a number that is
// decoration.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Rarity {
  /** How many athletes hold it. */
  holders: number;
  /** Percentage of athletes who have unlocked anything at all. */
  pct: number;
}

export type RarityMap = Record<string, Rarity>;

/**
 * Record everything currently unlocked. Idempotent and cheap to over-call.
 *
 * BACKFILLS BY DESIGN. This posts the athlete's WHOLE unlocked set, not just
 * what changed — because when this shipped, every existing athlete had badges
 * that had never been written anywhere, and a "record on transition" hook would
 * only ever have caught their next one. Everyone's history lands the first time
 * they open the page, and after that the upsert is a no-op.
 *
 * `ignoreDuplicates` keeps `unlocked_at` honest: without it the upsert would
 * rewrite the timestamp on every visit and the column would mean "last seen"
 * rather than "when this happened".
 */
export async function recordUnlocks(
  supabase: SupabaseClient,
  userId: string,
  unlockedIds: string[]
): Promise<void> {
  if (!unlockedIds.length) return;
  const { error } = await supabase
    .from("achievement_unlocks")
    .upsert(
      unlockedIds.map((achievement_id) => ({ user_id: userId, achievement_id })),
      { onConflict: "user_id,achievement_id", ignoreDuplicates: true }
    );
  // Swallowed on purpose. This is a side effect of looking at a page, and a
  // rewards screen that fails to render because a decorative statistic could
  // not be written would be a much worse bug than the missing statistic.
  if (error) console.warn("[achievements] could not record unlocks:", error.message);
}

/**
 * Rarity for every badge anyone holds.
 *
 * Returns an empty map rather than throwing: the table may not exist yet on a
 * database where 0074 hasn't been applied, and the page has to render anyway.
 * Callers treat "no entry" as "not enough data", never as "0% have this" —
 * those look identical on screen and only one of them is true.
 */
export async function fetchRarity(supabase: SupabaseClient): Promise<RarityMap> {
  const { data, error } = await supabase.rpc("achievement_rarity");
  if (error || !Array.isArray(data)) return {};
  const out: RarityMap = {};
  for (const row of data as { achievement_id?: string; holders?: number; pct?: number }[]) {
    if (!row?.achievement_id) continue;
    out[row.achievement_id] = { holders: Number(row.holders) || 0, pct: Number(row.pct) || 0 };
  }
  return out;
}

/**
 * The smallest sample worth quoting a percentage from.
 *
 * With four athletes on the table, one of them holding a badge reads as "25%
 * of athletes" — a number that is arithmetically true and tells you nothing
 * except how new the app is. Below this the card says so instead of inventing
 * precision, which is the same rule the nutrition targets follow.
 */
export const MIN_SAMPLE = 20;

/**
 * How to describe a badge's rarity in words.
 *
 * Thresholds rather than the raw number alone, because "8.3% of athletes" is a
 * statistic and "rare" is a feeling, and the feeling is the reason anyone looks.
 */
export function rarityLabel(pct: number): string {
  if (pct >= 60) return "Common";
  if (pct >= 30) return "Uncommon";
  if (pct >= 10) return "Rare";
  return "Very rare";
}

/** The colour that label reads in — rarer is brighter. */
export function rarityTone(pct: number): string {
  if (pct >= 60) return "#8391a6"; // slate-500
  if (pct >= 30) return "#4ade80"; // readiness green
  if (pct >= 10) return "#38bdf8"; // sky
  return "#e3b53f"; // pitch gold
}
