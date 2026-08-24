import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * THE CALCULATOR EXISTS AND NOBODY COULD FIND IT.
 *
 * WhatIfLiftSheet has been in the app for a long time behind a 24px icon next
 * to an exercise you had already logged — so answering "what is 100kg for 5
 * worth?" required first logging 100kg for 5. These tests are about reach, not
 * arithmetic: the maths is covered by strength-standards.test.ts, and what kept
 * breaking was the door.
 */

const LIBRARY = readFileSync(new URL("../app/(app)/library/page.tsx", import.meta.url), "utf8");
const TODAYS_LOG = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");

test("both pages can open the calculator", () => {
  for (const [name, src] of [["library", LIBRARY], ["today's log", TODAYS_LOG]] as const) {
    assert.match(src, /import \{ WhatIfLiftSheet \}/, `${name} imports the sheet`);
    assert.match(src, /<WhatIfLiftSheet\b/, `${name} renders the sheet`);
  }
});

/**
 * A SHEET THAT IS RENDERED IS NOT A SHEET THAT CAN BE OPENED. Rendering it
 * behind a state variable nothing ever sets is exactly the shape of bug that
 * hides a feature, and it reads as working in every file you look at.
 */
test("something on each page actually sets the state that opens it", () => {
  const setter = (src: string, state: string) => {
    const calls = src.split(`set${state}(`).length - 1;
    // One is the onClose that closes it again; opening needs at least one more.
    return calls >= 2;
  };
  assert.ok(setter(LIBRARY, "Calc"), "library has a control that opens the calculator");
  assert.ok(setter(TODAYS_LOG, "WhatIf"), "today's log has a control that opens the calculator");
});

/**
 * The library entry point is a card people are meant to see, not another icon.
 * If it ever shrinks back to a bare icon this is the test that says so.
 */
test("the library entry point says what it is in words", () => {
  assert.match(LIBRARY, /Strength calculator/, "the card is labelled");
  assert.match(LIBRARY, /setCalc\(""\)/, 'and opens with nothing pre-chosen');
});

/**
 * Offering to rank a plank opens a sheet with nothing to say. resolveLift is
 * what knows the difference, so the per-exercise button has to ask it.
 */
test("the per-exercise button is gated on the lift being rankable", () => {
  assert.match(LIBRARY, /resolveLift\(open\.name\) \?/);
});
