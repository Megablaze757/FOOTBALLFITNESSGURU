import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../components/MealCheckIn.tsx", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `capture` IS NOT A HINT — IT REMOVES THE PHOTO LIBRARY.
 *
 * A single input with capture="environment" does not merely open the camera
 * first; on iOS and Android it takes "Photo Library" out of the sheet entirely.
 * So anybody who had already photographed their lunch, or wanted to use a
 * picture of a menu or a packet, had no route at all — the only thing the app
 * offered was to photograph the food again, which by then is eaten.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("there is a photo input that does not force the camera", () => {
  // Split on the tag and cut at its close, rather than a length-bounded
  // regex — these inputs carry multi-line comments and a bounded match
  // silently found neither of them.
  const inputs = SRC.split("<input")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf("/>")))
    .filter((chunk) => chunk.includes('accept="image/*"'));
  assert.ok(inputs.length >= 2, `only ${inputs.length} image input(s) — the library route is missing`);

  const withCapture = inputs.filter((i) => /capture=/.test(i));
  const withoutCapture = inputs.filter((i) => !/capture=/.test(i));
  assert.ok(withCapture.length >= 1, "the one-tap camera route is gone");
  assert.ok(withoutCapture.length >= 1, "every image input forces the camera again");
});

test("both routes feed the same estimator and are both cleared", () => {
  const handlers = SRC.match(/onChange=\{onPhoto\}/g) ?? [];
  assert.ok(handlers.length >= 2, "the library input does not run the estimator");
  assert.match(SRC, /libraryRef\.current\.value = ""/,
    "the library input is not reset, so picking the same photo twice does nothing the second time");
});

test("the copy offers both, rather than only snapping", () => {
  assert.match(SRC, /From your photos/i, "no visible way to reach the camera roll");
  assert.match(SRC, /Take a photo/i, "the camera button lost its label");
});
