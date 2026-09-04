// =============================================================================
// THE WEEKLY NOTE TO WHOEVER RUNS THIS.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ADMIN PANEL ONLY WORKS ON THE DAYS SOMEBODY OPENS IT.
//
// There is a schedule of what to post, a feed of what has changed, a list of
// pages one recipe short of existing, and a count of how many athletes can
// share with attribution. All of it correct, all of it behind a tab on a page
// you have to remember to visit — and the weeks it matters most are the weeks
// nobody visits.
//
// So once a week it comes to you. Same pipeline as every other notification:
// a row with an email category, drained by the queue that already runs. No new
// sender, no new schedule, nothing else to keep alive.
//
// SHORT, AND ABOUT WHAT CHANGED. A digest that lists everything is a digest
// that gets filtered to a folder. A line only appears when there is something
// to say, and an empty digest is not sent at all.
//
// ─────────────────────────────────────────────────────────────────────────
// IT TAKES FACTS RATHER THAN IMPORTING THEM, and that is not a style choice.
//
// The first version imported plannedPosts, postTriggers and contentGaps
// directly. The Worker cannot: its tsconfig has no "@/" alias, so those pull
// in the whole app graph — and even with the alias added, the transitive
// import is 380 exercises and 335 recipes compiled into a script with a size
// limit, to produce six lines of text.
//
// It also turned out to be the better split on its own terms. The
// catalogue-derived parts only change when the CODE changes, so they do not
// need a weekly email; they need the panel. What genuinely moves week to week
// is what the database says — who can share, what came back, what was lost —
// and that is what the Worker already has in front of it.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { loopStats, type LoopInput } from "./share-loop";

export interface DigestInput {
  /** From the same query the admin panel runs — see lib/share-loop.ts. */
  loop?: LoopInput;
  /**
   * Catalogue-derived lines, when the caller has them.
   *
   * The admin page can pass what to post and which pages are one recipe short;
   * the Worker cannot reach either without compiling the catalogue into
   * itself, and does not need to — see the note above.
   */
  headline?: string | null;
  extra?: string[];
}

export interface Digest {
  title: string;
  /** Blank-line separated blocks — the email shell renders pairs as a table. */
  body: string;
  href: string;
}

/** Lines only get written when they have something to say. */
function lines(input: DigestInput): string[] {
  const out: string[] = [];

  for (const line of input.extra ?? []) {
    if (line.trim()) out.push(line.trim());
  }

  if (input.loop) {
    const stats = loopStats(input.loop);
    out.push(`Athletes who can share: ${stats.canShare.athletes}`);
    out.push(`With a public page: ${stats.canShare.withPage}`);
    if (stats.signups.total > 0) {
      out.push(`Attributed signups: ${stats.signups.total} (${stats.signups.athlete} free, ${stats.signups.affiliate} paid)`);
    }
    /**
     * The one line here that is a BUG rather than a result: somebody was given
     * a code, typed it, and it matched nothing. It appears in no other view.
     */
    if (stats.signups.unknown > 0) {
      out.push(`Lost attribution: ${stats.signups.unknown} signup(s) used a code that matches nothing`);
    }
  }

  return out;
}

/**
 * The week's note, or null when there is genuinely nothing to say.
 *
 * Null rather than an empty digest. A weekly email that arrives saying nothing
 * teaches you to stop opening the weekly email, and then the one that matters
 * goes unread too.
 */
export function growthDigest(input: DigestInput): Digest | null {
  const body = lines(input);
  if (body.length === 0) return null;

  return {
    // The subject carries the one thing worth knowing, so it is legible in a
    // list of unread mail without being opened.
    title: input.headline?.trim() || `Growth this week: ${body[0]}`,
    body: body.join("\n"),
    href: "/admin/social",
  };
}
