/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SLOW DRIFT DOWN A SHOT.
 *
 * The recorder divided the WHOLE DOCUMENT across a beat's captions. On
 * /cheapest-protein/ that document is a ranked table of 23 foods followed by
 * several screens of explanation — so a two-caption beat scrolled half the
 * page per caption, and the shot the voiceover was describing as "red lentils,
 * thirty-one pence" was a wall of FAQ prose. The table it is about was three
 * screens above.
 *
 * A drift is a camera move, not a page-turn: it is measured against the SCREEN,
 * so a long page and a short one move at the same speed and the shot stays on
 * what it started on.
 *
 * And it CARRIES OVER between beats on the same route. Positions used to be
 * computed from the top of the page each beat, so the second beat on a screen
 * scrolled back up to where the first one began — a jump backwards, mid-shot,
 * every time a script held one screen for two beats. Most of them do.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * How far one beat moves, in screen-heights.
 *
 * Three quarters of a screen over a shot of several seconds: enough that the
 * page is visibly alive, little enough that what was on screen at the start of
 * the line is still on screen at the end of it.
 */
export const DRIFT_PER_BEAT = 0.75;

export interface Drift {
  /** Where this beat's drift began — the previous beat's end, or 0 on a new route. */
  from: number;
  /** scrollHeight - innerHeight. Zero on a page with nothing to scroll. */
  scrollable: number;
  /** innerHeight. */
  viewport: number;
  /** 1-based position of this caption within the beat. */
  step: number;
  /** How many captions the beat has. */
  steps: number;
}

/**
 * Where to scroll to for one caption.
 *
 * NO SPECIAL CASE for an unscrollable page. There was one — an early return
 * for `scrollable <= 0 || viewport <= 0` — and a mutation deleting it changed
 * no answer at all: clamping to `[0, scrollable]` already handles a short page
 * (nothing to scroll, so the target is 0) and a zero viewport (nothing moves,
 * so the target is where it already was). A guard that cannot fire is a claim
 * that it can, and the next person to read it believes the claim.
 */
export function driftTarget({ from, scrollable, viewport, step, steps }: Drift): number {
  const share = Math.min(1, Math.max(0, step / Math.max(1, steps)));
  const move = viewport * DRIFT_PER_BEAT * share;
  return Math.round(Math.max(0, Math.min(scrollable, from + move)));
}

/** Where the next beat on the same route should start from. */
export function driftEnd(d: Omit<Drift, "step" | "steps">): number {
  return driftTarget({ ...d, step: 1, steps: 1 });
}
