// =============================================================================
// A BEAT THAT DOES SOMETHING, RATHER THAN A BEAT THAT LOOKS AT SOMETHING.
//
// ═══════════════════════════════════════════════════════════════════════════
// "THE VIDEOS SHOULD SHOW THEM DOING THE STUFF."
//
// lib/reel-script.ts opens by saying the thing worth filming is the app —
// "a readiness score dropping after a bad night, a shopping list pricing
// itself" — and then every beat navigates to a route and scrolls down it. The
// `action` field on a beat has always been a note for a HUMAN holding a phone
// ("Log a bad night: sleep 3, fatigue 8"), and the recorder ignored it
// entirely. So the reels showed finished screens and talked about them, which
// is a narrated screenshot however good the voice is.
//
// A move is that instruction made executable: type into the field, tap the
// button, and let the number change on camera. That is the difference between
// telling somebody a readiness score reacts to a bad night and showing it.
//
// ─────────────────────────────────────────────────────────────────────────
// TEXT TARGETS, NOT SELECTORS, AND THE REASON IS ALREADY WRITTEN DOWN.
//
// Beat.focus explains it: "a selector is a promise about markup this file does
// not own and breaks silently the next time a class is renamed". A move is
// aimed the same way — at the words on screen, which are the words the script
// is talking about anyway. The one difference is that a broken selector here
// does not merely fail to highlight something, it films a form nobody filled
// in, so a move that finds nothing is LOUD (see the recorder).
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** Put text into the field labelled `into`. */
export interface TypeMove {
  type: string;
  into: string;
}

/** Press the control whose visible text or label is `tap`. */
export interface TapMove {
  tap: string;
}

export type Move = TypeMove | TapMove;

export const isType = (m: Move): m is TypeMove => "type" in m;
export const isTap = (m: Move): m is TapMove => "tap" in m;

/**
 * How long to leave between one move and the next.
 *
 * A form filled instantly is a jump cut with no cause on screen — the viewer
 * sees a filled form and never sees it being filled, which is the whole point
 * of doing this. This is roughly a person's gap between two taps, and it is
 * also what gives the app time to react.
 */
export const MOVE_GAP_MS = 420;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW LONG TO WAIT FOR A CONTROL TO EXIST.
 *
 * The recorder navigates with `waitUntil: "load"`, which fires when the HTML
 * and its resources have arrived — and this app is a Next.js SPA, so at that
 * moment the document is EMPTY. The first move then found nothing and, once
 * misses became fatal, failed the run.
 *
 * The evidence took four theories to reach: a stale page, a slow write, the
 * wrong button, then leftover account state. The recorder's own screen dump
 * settled it in one run — no headings, no buttons, no labels at all.
 *
 * So a move waits for its target the way a person does. A deadline rather
 * than a fixed sleep: hydration is fast when it is fast, and a fixed sleep
 * would be both too short on a cold runner and wasted time on a warm one.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MOVE_WAIT_MS = 6_000;

/** How often to look while waiting. Cheap, and 150ms is imperceptible. */
export const MOVE_POLL_MS = 150;

/**
 * The extra time a beat needs because it is performing moves.
 *
 * A beat's duration is otherwise the longer of its speech and its caption
 * reading time, and neither knows that four fields are being filled during it.
 * Without this the cut lands halfway through the form.
 */
export function movesMs(moves: readonly Move[] | undefined): number {
  return (moves?.length ?? 0) * MOVE_GAP_MS;
}

/**
 * Everything wrong with a set of moves, in the order a writer would care.
 *
 * Reasons rather than a boolean, and checked here rather than discovered by
 * watching a reel: the recorder runs on a machine nobody is looking at, and a
 * move that cannot work should fail in the studio.
 */
export function moveProblems(moves: readonly Move[] | undefined): string[] {
  if (!moves) return [];
  const problems: string[] = [];

  moves.forEach((move, i) => {
    const where = `move ${i + 1}`;
    if (isType(move)) {
      if (!move.into.trim()) problems.push(`${where}: types into a field with no name`);
      if (!move.type.trim()) problems.push(`${where}: types nothing into "${move.into}"`);
      /**
       * A field is found by its LABEL, and a label that is one or two letters
       * matches half the page. "Reps" is fine; "kg" is not.
       */
      if (move.into.trim().length < 3) {
        problems.push(`${where}: "${move.into}" is too short to identify a field`);
      }
    } else if (isTap(move)) {
      if (!move.tap.trim()) problems.push(`${where}: taps nothing`);
      if (move.tap.trim().length < 3) {
        problems.push(`${where}: "${move.tap}" is too short to identify a control`);
      }
    } else {
      problems.push(`${where}: is neither a type nor a tap`);
    }
  });

  /**
   * Ten moves is thirty seconds of gaps in a reel that may not exceed thirty
   * seconds. A beat needing more than a few is a beat trying to be a tutorial.
   */
  if (moves.length > 6) {
    problems.push(`${moves.length} moves in one beat — that is a tutorial, not a shot`);
  }
  return problems;
}
