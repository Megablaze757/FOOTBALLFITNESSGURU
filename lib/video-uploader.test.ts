import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards for the clip picker, which is a component and so cannot be unit
 * tested here — the runner's glob is lib/**\/*.test.ts. What it CAN do is read
 * the source for the two mistakes that were actually made, both of which
 * typecheck, lint and look completely reasonable in review.
 */
const SRC = readFileSync(new URL("../components/VideoUploader.tsx", import.meta.url), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * The component only, not the `makeThumb` helper above it.
 *
 * That helper builds its own <video>, sets its own `playsInline`, and revokes
 * its own object URL — so a guard run over the whole file passes on the
 * helper's code while the component's is missing. Two of these guards did
 * exactly that, and were only caught by injecting the regression they were
 * written for. A source scan that matches the wrong occurrence is worse than no
 * scan, because it reports green.
 */
const COMPONENT = CODE.slice(CODE.indexOf("export function VideoUploader"));

/**
 * THE BUG: the confirmation card was rendered on `file && preview`, where
 * `preview` is a canvas grab that runs asynchronously, waits up to 13 seconds
 * before giving up, and returns null outright for codecs the browser cannot
 * decode — HEVC, which is what an iPhone records by default.
 *
 * So you would pick a clip and the screen would carry on showing an empty
 * "Choose or drop a video" dropzone, with a name field and an Upload button
 * underneath it. There was no way to tell whether the right video had been
 * selected, or any video at all.
 *
 * The selected-file card must depend on the FILE, never on the thumbnail.
 */
test("the picked-clip card does not wait for the thumbnail", () => {
  assert.ok(!/\{\s*file\s*&&\s*preview\s*\?/.test(CODE),
    "the confirmation card is gated on the async poster frame again");
  assert.ok(/\{\s*file\s*\?\s*\(/.test(CODE),
    "the confirmation card is no longer gated on the file being picked");
});

/** And there has to be a real player, not just a still frame. */
test("the picked clip is playable before upload", () => {
  assert.match(COMPONENT, /<video/, "no video element — a poster frame is not a preview");
  assert.match(COMPONENT, /controls/, "the preview cannot be played or scrubbed");
  assert.match(COMPONENT, /playsInline/, "iOS will take the video fullscreen without playsInline");
  assert.match(COMPONENT, /URL\.createObjectURL\(file\)/, "the preview has no source");
});

/**
 * A 60MB blob URL held after the picker has moved on is 60MB of phone memory,
 * and this component sits on a page people revisit. Revoked on every change.
 */
test("the preview URL is released", () => {
  assert.match(COMPONENT, /return \(\) => URL\.revokeObjectURL/,
    "the preview URL is created but never revoked on change or unmount");
});

/**
 * THE OTHER BUG. <input type="file"> fires `change` only when the value
 * CHANGES, so clearing React state alone means: tap Change, pick the same clip
 * again to check it, and nothing happens at all. That is the single most likely
 * next action after "is this the right video?", and it silently did nothing.
 */
test("clearing the choice also clears the input, so the same file can be re-picked", () => {
  assert.match(CODE, /fileInput\.current\.value\s*=\s*""/,
    "the file input keeps its old value, so re-picking the same clip fires nothing");

  // And every reset must go through that path. A bare setFile(null) anywhere
  // else reintroduces the bug at exactly one call site.
  const bare = [...CODE.matchAll(/setFile\(null\)/g)];
  assert.equal(bare.length, 1, `setFile(null) appears ${bare.length} times; it belongs only in clearFile`);
  const clearFileBody = CODE.slice(CODE.indexOf("function clearFile()"), CODE.indexOf("function defaultTitle"));
  assert.match(clearFileBody, /setFile\(null\)/, "the one setFile(null) is not the one inside clearFile");
});

/**
 * The poster frame still has to be captured and stored — it is what the clip
 * list renders, and it is a separate job from the preview. Easy to delete by
 * accident while replacing the thing that looked like it.
 */
test("the stored thumbnail survived the change", () => {
  assert.match(CODE, /thumb_data_url:\s*preview\?\.url/, "clips would upload without a poster frame");
  assert.match(CODE, /makeThumb\(file\)/, "the poster frame is no longer captured");
});
