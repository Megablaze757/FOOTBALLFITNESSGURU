import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextNavState, INITIAL_NAV_STATE, TOP_ZONE, HIDE_AFTER, SHOW_AFTER, BOTTOM_ZONE,
  type NavScrollState,
} from "./nav-scroll";

/** A tall page on a phone. */
const PAGE = { viewportH: 844, docH: 6000 };

/** Replay a sequence of scroll positions and return the states along the way. */
function scroll(ys: number[], page = PAGE): NavScrollState[] {
  let state = INITIAL_NAV_STATE;
  return ys.map((y) => (state = nextNavState(state, { y, ...page })));
}

test("the bar is there when you arrive", () => {
  assert.equal(nextNavState(INITIAL_NAV_STATE, { y: 0, ...PAGE }).hidden, false);
});

test("scrolling down puts it away, scrolling back brings it out", () => {
  const down = scroll([0, 200, 400]);
  assert.equal(down[down.length - 1].hidden, true, "still there after 400px of scrolling down");

  let state = down[down.length - 1];
  for (const y of [380, 360, 340]) state = nextNavState(state, { y, ...PAGE });
  assert.equal(state.hidden, false, "scrolling back up did not bring it back");
});

/**
 * THE FLICKER TEST, and the reason this is a module rather than four lines in
 * the component.
 *
 * Real scrolling is not monotonic — a thumb drag produces small reversals, and
 * momentum on iOS overshoots and settles back. Deciding on the sign of each
 * event would strobe the bar on and off several times a second, which is worse
 * than leaving it parked.
 */
test("a jittery thumb does not strobe the bar", () => {
  // ±6px wobble around 500, well inside both thresholds.
  const ys = [0, 200, 500];
  for (let i = 0; i < 20; i++) ys.push(500 + (i % 2 ? 6 : -6));
  const states = scroll(ys);
  const afterSettling = states.slice(3);
  const flips = afterSettling.filter((s, i) => i > 0 && s.hidden !== afterSettling[i - 1].hidden).length;
  assert.equal(flips, 0, `the bar changed state ${flips} times during a 6px wobble`);
});

/**
 * A SLOW DRAG STILL HIDES IT.
 *
 * The anchor is deliberately NOT advanced when neither threshold is met. Reset
 * it on every event and travel never accumulates: someone scrolling gently
 * would never move 28px "at once" and the bar would stay forever. This is the
 * regression that comment is guarding.
 */
test("travel accumulates, so a slow scroll works too", () => {
  const ys = [0, 150];
  for (let y = 152; y <= 260; y += 4) ys.push(y); // 4px at a time
  const states = scroll(ys);
  assert.equal(states[states.length - 1].hidden, true, "a slow scroll never hid the bar");
});

test("it never hides inside the first screenful", () => {
  const states = scroll([0, 20, 50, TOP_ZONE]);
  assert.ok(states.every((s) => !s.hidden), "hid before leaving the top of the page");
});

/**
 * At the very foot of a page there is no more "down" to give, so a hidden bar
 * would be unreachable without scrolling back up — on the one screen where
 * someone has most obviously finished reading and wants to go elsewhere.
 */
test("reaching the bottom brings it back", () => {
  const bottom = PAGE.docH - PAGE.viewportH;
  const states = scroll([0, 300, 900, 2000, bottom - BOTTOM_ZONE]);
  assert.equal(states[3].hidden, true, "should have been hidden on the way down");
  assert.equal(states[states.length - 1].hidden, false, "still hidden at the foot of the page");
});

test("a page shorter than the screen never hides it", () => {
  const short = { viewportH: 844, docH: 700 };
  const states = scroll([0, 100, 300, 600], short);
  assert.ok(states.every((s) => !s.hidden));
});

/**
 * Asking for it back is easier than losing it. A missed nav costs a deliberate
 * second gesture; an over-eager reveal costs a glance.
 */
test("it comes back more readily than it goes away", () => {
  assert.ok(SHOW_AFTER < HIDE_AFTER, "showing should need less travel than hiding");
});

test("a negative scroll position is not a scroll upwards", () => {
  // iOS rubber-banding reports negative y at the top of the page. Treating that
  // as "scrolled up by 40px" is harmless here, but treating it as a position
  // and anchoring to it is not — the next real scroll would measure from -40.
  const state = nextNavState({ hidden: true, anchorY: 300 }, { y: -40, ...PAGE });
  assert.equal(state.hidden, false);
  assert.equal(state.anchorY, 0, "the anchor must not be left negative");
});
