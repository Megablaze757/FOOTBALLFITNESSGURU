// =============================================================================
// One athlete, one XP total, however you got here.
//
// Home said Silver 1 while Rewards said Gold 3, for the same person on the same
// day, because the two pages built the number differently:
//
//   Rewards   computeXp(stats WITH strength tiers) + challenge XP
//   Home      computeXp(stats WITHOUT strength tiers)
//
// Two omissions, both silent. Home never fetched the logged drills, so
// `strengthTiers` was 0 and every rung of the strength ladder — 60 XP each —
// was missing; and it never read challenge_completions, so every challenge ever
// completed counted for nothing. The gap is not small: a well-ranked athlete
// loses hundreds of XP, which is several levels, which is a different metal.
//
// A LEVEL IS AN IDENTITY, not a statistic. Getting it wrong on the first screen
// somebody opens is worse than getting a chart wrong, because they cannot tell
// which of the two numbers is real and both are the app's own claim about them.
//
// So the inputs are assembled in ONE place and both pages call it. The point is
// not that the queries are shared — it is that neither page can be given a new
// XP source that the other silently misses, which is exactly how this happened.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { strengthStats } from "./strength-standards";
import { testedMaxesFrom } from "./strength-standards";
import { latestBodyweight } from "./bodyweight";
import { fetchChallengeXp } from "./challenge-xp";
import type { TrainingLog } from "./types";

export interface XpExtras {
  /** Merge into ActivityStats before calling computeXp. */
  strengthTiers: number;
  bestStrengthTier: number;
  musclesRanked: number;
  /** Add to computeXp's result — recorded per completion, never derived. */
  challengeXp: number;
}

export const EMPTY_XP_EXTRAS: XpExtras = {
  strengthTiers: 0, bestStrengthTier: 0, musclesRanked: 0, challengeXp: 0,
};

/**
 * Everything that contributes XP but does not come from a simple row count.
 *
 * DELIBERATELY NOT DATE-WINDOWED. Strength ranks are best-ever and challenge
 * completions are recorded when they happen, because XP in this app is
 * monotonic — a rule it settled the hard way with streaks, and again with
 * strength. Windowing either would make a level fall, which is the single most
 * demotivating thing a progression system can do.
 *
 * Degrades to zeros rather than throwing. A missing table (0075 not applied) or
 * an offline moment must not take down the home screen, and zero is the honest
 * answer there: nothing has been recorded, so nothing has been earned.
 */
export async function fetchXpExtras(
  supabase: SupabaseClient,
  userId: string,
): Promise<XpExtras> {
  try {
    const [drills, profile, weighCheck, weighBody, tested, challengeXp] = await Promise.all([
      supabase.from("training_logs").select("log_date, drills").eq("user_id", userId).not("drills", "is", null),
      supabase.from("profiles").select("sex").eq("id", userId).maybeSingle(),
      supabase.from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", userId)
        .not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1),
      supabase.from("body_logs").select("log_date, weight_kg").eq("user_id", userId)
        .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1),
      supabase.from("strength_benchmarks").select("test_date, metrics").eq("user_id", userId),
      fetchChallengeXp(supabase, userId),
    ]);

    const bodyweight = latestBodyweight({
      checkIns: (weighCheck.data ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
      weighIns: (weighBody.data ?? []).map((r) => ({ date: r.log_date as string, kg: r.weight_kg as number })),
    });

    const strength = strengthStats(
      (drills.data ?? []) as TrainingLog[],
      bodyweight?.kg ?? 0,
      (profile.data as { sex?: string | null } | null)?.sex === "female" ? "female" : "male",
      testedMaxesFrom(tested.data ?? []),
    );

    return { ...strength, challengeXp };
  } catch {
    return EMPTY_XP_EXTRAS;
  }
}
