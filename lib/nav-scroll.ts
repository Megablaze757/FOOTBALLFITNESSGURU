// =============================================================================
// Whether the floating tab bar should be on screen right now.
//
// The bar is `position: fixed`, so it sat over the content permanently —
// reported as "it just stays in the same place". On a phone that is roughly
// 80px of the screen, parked across the bottom of whatever you are reading, on
// every page, forever.
//
// So it gets out of the way: scroll down and it goes, scroll up and it comes
// back. Scrolling up is what you do when you want to go somewhere else, which
// is exactly when the nav is wanted — the gesture and the intent already line
// up, which is why this pattern is everywhere.
//
// Pure and separate from the component because the interesting part is the
// hysteresis, and getting that wrong produces a bar that flickers on every
// pixel of movement — something no test of a React component would notice but
// everyone using it would.
// =============================================================================

export interface NavScrollState {
  hidden: boolean;
  /**
   * Where the last decision was made. Movement is measured from HERE, not from
   * the previous scroll event, which is what makes the thresholds mean
   * "sustained travel" rather than "one twitchy frame".
   */
  anchorY: number;
}

export interface ScrollPosition {
  y: number;
  viewportH: number;
  docH: number;
}

/**
 * Never hide inside the first screenful.
 *
 * The top of a page is where someone arrives, and a nav that vanishes on the
 * first flick of a long article reads as a glitch rather than a behaviour.
 */
export const TOP_ZONE = 96;

/** Sustained travel needed to change the bar's mind, in px. */
export const HIDE_AFTER = 28;
export const SHOW_AFTER = 20;

/**
 * How close to the end counts as "the bottom".
 *
 * Without this you can reach the foot of a page with the bar hidden and have no
 * way to get it back short of scrolling up — the one place where there is no
 * more "down" to give. Being generous here costs nothing: the bar reappearing
 * as you land at the end of a page is the behaviour people expect anyway.
 */
export const BOTTOM_ZONE = 32;

export const INITIAL_NAV_STATE: NavScrollState = { hidden: false, anchorY: 0 };

/**
 * SHOW_AFTER is smaller than HIDE_AFTER on purpose. Asking for it back should
 * be easier than losing it: a missed nav costs a deliberate second gesture,
 * while an over-eager reveal only costs a glance.
 */
export function nextNavState(state: NavScrollState, pos: ScrollPosition): NavScrollState {
  const y = Math.max(0, pos.y);

  // Top of the page, and the bottom of it, are both always-visible.
  if (y <= TOP_ZONE) return { hidden: false, anchorY: y };
  if (pos.y + pos.viewportH >= pos.docH - BOTTOM_ZONE) return { hidden: false, anchorY: y };

  const delta = y - state.anchorY;
  if (delta > HIDE_AFTER) return { hidden: true, anchorY: y };
  if (delta < -SHOW_AFTER) return { hidden: false, anchorY: y };

  /**
   * Neither threshold met — hold BOTH the state and the anchor.
   *
   * Advancing the anchor here is the bug this comment exists to prevent: it
   * would reset the ruler on every scroll event, so a slow drag would never
   * accumulate 28px of travel and the bar would never hide at all. The anchor
   * only moves when a decision is made.
   */
  return state;
}
