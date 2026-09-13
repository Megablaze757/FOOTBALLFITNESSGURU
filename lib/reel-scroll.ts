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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CLOSING BEAT SCROLLS BACK, BECAUSE THE LOOP IS A PICTURE AND NOT A URL.
 *
 * lib/reel-script.ts ends five of the seven scripts on the screen they opened
 * on, deliberately and at a cost it documents: "the PICTURE, when the last
 * shot matches the framing of the first". Replay rate is the signal — above
 * 1.2 distribution is reported as substantially stronger — and a reel that
 * loops cleanly plays again before the viewer decides to replay it.
 *
 * The route matched and the framing never did. driftTarget only ever moves
 * DOWN, so simulating every script's scroll the way the recorder drives it:
 *
 *   drill                  opens /drills/    ends /drills/    final scrollY 720
 *   standards              opens /standards/ ends /standards/ final scrollY 720
 *   card-protein-gap       …/protein-gap/1/  …/protein-gap/1/ final scrollY 720
 *   card-bodyweight-gap    …                 …                final scrollY 720
 *   card-cheapest-protein  …                 …                final scrollY 720
 *
 * 720px of a 960px viewport — three quarters of a screen from the frame the
 * reel opened on, on every reel written to loop. The last shot was the right
 * page at the wrong place, which loops no better than the wrong page.
 *
 * So the closing beat glides back instead of onward. Still moving — a still
 * frame is one the scroller has finished reading — and it arrives at 0 on its
 * last caption, so the end card holds the opening framing while it asks.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function closingDrift(
  { from, scrollable, viewport, step, steps }: Drift,
): number {
  const share = Math.min(1, Math.max(0, step / Math.max(1, steps)));
  const home = openingScroll({ scrollable, viewport });
  return Math.round(from + (home - from) * share);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE THE REEL OPENS, WHICH IS NOT THE TOP OF THE DOCUMENT.
 *
 * The hook beat scrolls the page down by this much as it starts — "a frame
 * that does not move is a frame a scroller has already finished reading" — and
 * the mux trims the audio lead off the front, so the first frame ANYBODY SEES
 * is already scrolled.
 *
 * The first version of closingDrift glided the last beat back to 0 and called
 * that the loop. Filmed and compared: the opening frame of the standards reel
 * starts partway down its list of lifts, and the closing frame showed the page
 * header above it. The right page, the right scroll for the document, and the
 * wrong frame — off by exactly this.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const OPENING_DRIFT = 0.28;

export function openingScroll(
  { scrollable, viewport }: Pick<Drift, "scrollable" | "viewport">,
): number {
  return Math.round(Math.max(0, Math.min(scrollable, viewport * OPENING_DRIFT)));
}
