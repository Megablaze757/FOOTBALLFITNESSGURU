// =============================================================================
// XP for completed challenges — recording it, and reading it back.
//
// The board has advertised "+45 XP" on every card since the feature shipped and
// has never paid it: `challengeXp` was exported and called by nothing. This is
// the missing half.
//
// THE CONSTRAINT THAT SHAPES ALL OF IT: XP MUST NEVER GO DOWN. Challenge XP
// cannot be computed from what is currently complete, because the boards
// rotate — today's daily challenge is gone tomorrow, so that total would drop
// at midnight, and a level falling overnight is the precise bug computeXp was
// fixed for. A completion is therefore RECORDED when it happens, and the total
// is a sum over records, which only ever grows.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateChallenges } from "./challenges";
import type { Board } from "./challenge-pool";

export interface CompletionRow {
  challenge_id: string;
  period: string;
  /** Named to match the column, which cannot be `window` — reserved in Postgres. */
  board_window: string;
  xp: number;
}

/** Everything complete on these boards right now, ready to be recorded. */
export function completionsFrom(boards: Board[]): CompletionRow[] {
  const out: CompletionRow[] = [];
  for (const b of boards) {
    for (const p of evaluateChallenges(b.list, b.activity)) {
      if (!p.complete) continue;
      out.push({
        challenge_id: p.challenge.id,
        period: b.period,
        board_window: b.window,
        // The price AT THE TIME. If the pool is later repriced, what was already
        // earned must not move — a total that changes retroactively is the same
        // broken promise from the other direction.
        xp: p.challenge.xp,
      });
    }
  }
  return out;
}

/**
 * Record them. Insert-only and idempotent: the primary key is
 * (user_id, challenge_id, period), so revisiting the page all day pays once.
 */
export async function recordCompletions(
  supabase: SupabaseClient,
  userId: string,
  rows: CompletionRow[]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase
    .from("challenge_completions")
    .upsert(
      rows.map((r) => ({ ...r, user_id: userId })),
      { onConflict: "user_id,challenge_id,period", ignoreDuplicates: true }
    );
  // Swallowed on purpose, exactly as recordUnlocks does. This is a side effect
  // of looking at a page. A rewards screen that fails to render because a write
  // did not land — including on a database where 0075 has not been applied yet
  // — would be a far worse bug than the XP arriving on the next visit.
  if (error) console.warn("[challenges] could not record completions:", error.message);
}

/**
 * Total XP earned from challenges, ever.
 *
 * Returns 0 rather than throwing when the table is missing, so the page renders
 * normally on a database without 0075. Zero is the honest answer there: nothing
 * has been recorded, so nothing has been earned.
 */
export async function fetchChallengeXp(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("challenge_completions")
    .select("xp")
    .eq("user_id", userId);
  if (error || !Array.isArray(data)) return 0;
  return data.reduce((n, r) => n + (Number((r as { xp?: number }).xp) || 0), 0);
}
