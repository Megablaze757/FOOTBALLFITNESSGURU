// =============================================================================
// THE REVIEW QUEUE, RUNNING ITSELF.
//
// ═══════════════════════════════════════════════════════════════════════════
// "THE EXERCISES WERE DRAFTED BUT IT WASNT AUTO PUBLISHING AND CLEARING FROM
//  THE QUEUE, THEY WERENT EVEN AUTO DRAFTING — I STILL NEEDED TO CLICK THE
//  DRAFT BUTTON. I WANTED THIS COMPLETELY AUTOMATED."
//
// Fair. Every step was a button: click to draft, open the row, read it, click
// to publish. For thirty submissions that is ninety interactions to move text
// from one place to another, and most of them are the same decision.
//
// So the pass decides for itself. Undrafted rows get drafted; drafted rows that
// clear every check get published and leave the queue; what stays behind is
// only what a person actually has to look at, with the reason on it.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE THING THIS WILL NOT DO ON ITS OWN, and it is deliberate.
//
// It never publishes an exercise with no video. The app answers "how does this
// go?" with a clip and nothing else — the drawings were deleted for good
// reasons — so an entry without one is a card that opens onto a search box.
// And the drafting model is explicitly not allowed to choose the clip: a
// YouTube id is eleven characters that a model will invent as readily as
// recall, and an invented one either 404s or points at something nobody has
// watched, on a page teaching somebody how to load their spine.
//
// That is the whole of the human step. Everything either side of it is gone.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { publishBlockers, type ExerciseDraft } from "./exercise-review";
import { blockReasons } from "./exercise-moderation";

export interface AutoRow {
  id: string;
  name: string;
  /** Null until the drafting model has written this row's detail. */
  aiDraftedAt: string | null;
  /** Why the draft checks held it, if they did. Set by the drafting pass. */
  reviewNotes: string | null;
  draft: ExerciseDraft;
}

export type AutoStep =
  | { id: string; action: "draft" }
  | { id: string; action: "publish" }
  | { id: string; action: "hold"; reasons: string[] };

/**
 * What the automatic pass should do with one row.
 *
 * ORDER MATTERS AND IS THE DESIGN. Drafting comes first because an undrafted
 * row has nothing to judge. Held drafts come next and are never overridden by
 * the fields looking complete — `review_notes` means the cue checks found
 * something wrong with the WORDS, which is exactly the failure that reads as
 * fine. Moderation next, then the publish requirements last, because those are
 * the ones a person can fix in ten seconds.
 */
export function autoStep(row: AutoRow): AutoStep {
  if (!row.aiDraftedAt) return { id: row.id, action: "draft" };

  /**
   * The REASONS decide, not the string.
   *
   * `review_notes` of ";" is truthy and trims to truthy, and the first version
   * of this held on it — producing a hold with an empty reason list, which the
   * screen renders as a row sitting in the queue forever with nothing saying
   * why. A hold nobody can act on is worse than no hold.
   */
  const held = (row.reviewNotes ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (held.length) return { id: row.id, action: "hold", reasons: held };

  const sub = {
    name: row.name,
    equipment: row.draft.equipment,
    muscles: row.draft.muscles,
    cues: row.draft.cues,
    why: row.draft.why,
    description: row.draft.description,
  };
  const blocked = blockReasons(sub);
  if (blocked.length) return { id: row.id, action: "hold", reasons: blocked };

  const missing = publishBlockers(row.draft, row.name);
  if (missing.length) return { id: row.id, action: "hold", reasons: missing };

  return { id: row.id, action: "publish" };
}

export function autoPlan(rows: readonly AutoRow[]): AutoStep[] {
  return rows.map(autoStep);
}

export interface AutoSummary {
  draft: number;
  publish: number;
  hold: number;
  /** The rows held ONLY because nobody has attached a clip yet. */
  needVideo: number;
}

/**
 * What the pass is about to do, in a sentence somebody can act on.
 *
 * `needVideo` is counted separately because it is the one queue that does not
 * shrink on its own, and lumping it in with "held" hides the fact that the
 * remaining work is a single repeated task rather than a pile of judgement.
 */
export function autoSummary(plan: readonly AutoStep[]): AutoSummary {
  const summary: AutoSummary = { draft: 0, publish: 0, hold: 0, needVideo: 0 };
  for (const step of plan) {
    if (step.action === "draft") summary.draft++;
    else if (step.action === "publish") summary.publish++;
    else {
      summary.hold++;
      if (step.reasons.length === 1 && VIDEO_REASON.test(step.reasons[0])) summary.needVideo++;
    }
  }
  return summary;
}

/** publishBlockers' wording for the missing clip. */
export const VIDEO_REASON = /video guide/i;
