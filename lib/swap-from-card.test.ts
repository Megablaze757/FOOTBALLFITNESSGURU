import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const read = (p: string) => strip(readFileSync(new URL(p, import.meta.url), "utf8"));

const MODAL = read("../components/DrillDetail.tsx");
const COACH = read("../app/(app)/coach/page.tsx");
const CALENDAR = read("../components/ProgramCalendar.tsx");
const ROWS = read("../components/SessionDrills.tsx");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "WHEN I CLICK ON THE EXERCISE AND GO TO THE CARD ALLOW ME TO SWAP IT."
 *
 * Swapping existed — a ⇄ on the row, and only once the session had been put
 * into an edit mode. But the card is where the decision gets made: no rack
 * free, shoulder complains, never done it. Closing the card, finding the edit
 * mode and finding the row again is three taps about something else while
 * holding the decision in your head.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the exercise card can carry an action, in both of its shapes", () => {
  // A library exercise renders the full card; a drill with only a how-to gets
  // the simpler sheet. An action offered on one and not the other is a swap
  // that works for squats and not for cone weaves.
  assert.match(MODAL, /action\?: React\.ReactNode;/, "DrillModal takes no action");
  assert.match(MODAL, /<ExerciseModal ex=\{ex\}[^>]*action=\{action\}/,
    "the library-exercise path drops the action");
  assert.match(MODAL, /\{action && <div className="mt-3">\{action\}<\/div>\}/,
    "the how-to path drops the action");
});

test("the card swaps against the prescribed name, not the shown one", () => {
  // A drill already swapped once is keyed by what the programme asked for.
  // Swapping the SHOWN name would write a substitution for a substitution.
  assert.match(COACH, /const prescribed = picked\?\.swappedFrom \?\? picked\?\.name \?\? null;/,
    "the swap key is the displayed name, so a second swap would nest");
  assert.match(COACH, /onSwap=\{async \(to\) => \{ await saveSwap\(prescribed, to\); setShowing\(null\); \}\}/,
    "the card's swap does not go through the same save the row uses");
  assert.match(COACH, /current=\{picked\.swappedFrom \? picked\.name : null\}/,
    "the chooser cannot tell what they are already doing instead");
});

/**
 * The same rule the row has always applied. Offering a "similar exercise" for
 * a stage-two isometric is offering to leave the protocol.
 */
test("rehab and skill work are not swappable from the card either", () => {
  assert.match(COACH, /!picked\.skill && !picked\.rehab/,
    "the card offers a swap on rehab or skill work, which the row refuses");
  // And the row's rule has to still be there to be consistent with.
  assert.match(ROWS, /!d\.skill && !d\.rehab/, "the row lost its rehab guard");
});

test("a card with nothing to swap against offers nothing", () => {
  assert.match(COACH, /action=\{swappable \? \(/, "the action is not gated on being swappable");
  // The calendar is read-only — there is no session to save a swap to.
  assert.ok(!/action=/.test(CALENDAR),
    "the calendar offers a swap it has nowhere to save");
});

/** Closing the card after a swap, or it shows the exercise you just replaced. */
test("the card closes once the swap is made", () => {
  assert.match(COACH, /await saveSwap\(prescribed, to\); setShowing\(null\);/,
    "the card stays open on the old exercise after swapping it away");
});

/**
 * Two states, not one. Eight alternatives under every card somebody opens
 * would bury the technique they came to read under a list they did not ask for.
 */
test("the chooser is behind a tap, not open by default", () => {
  assert.match(COACH, /function SwapAction\(/, "the swap control is gone");
  assert.match(COACH, /if \(!open\) \{/, "the alternatives render before anybody asks for them");
  assert.match(COACH, /Can't do this one\? Swap it/, "the button does not say what it is for");
});
