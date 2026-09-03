import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_DRILLS } from "./skills";
import {
  holdFor, reelScenes, reelDuration, sceneAt, reelFrameSvg, pickMimeType, fileExtension,
  MIN_SCENE_MS, MIN_REEL_MS, MAX_REEL_MS, REEL_MIME_TYPES, closingFact,
} from "./reel";
import { captionProblems } from "./caption";

const drill = SKILL_DRILLS[0];

test("a card holds long enough to read and never flashes past", () => {
  assert.equal(holdFor("Two words"), MIN_SCENE_MS, "a short card gets the floor, not two-thirds of a second");
  assert.ok(holdFor("one two three four five six seven eight nine ten eleven twelve") > MIN_SCENE_MS);
  assert.equal(holdFor("   "), MIN_SCENE_MS, "an empty card still has to be on screen for a moment");
});

/**
 * Instagram rejects a reel under 3 seconds and over 90. Every drill we have has
 * to land inside that, or the export is a file the person cannot post — and
 * they find that out at the upload screen.
 */
test("every drill makes a reel Instagram will accept", () => {
  for (const d of SKILL_DRILLS) {
    const ms = reelDuration(reelScenes(d));
    assert.ok(ms >= MIN_REEL_MS && ms <= MAX_REEL_MS, `${d.id}: ${ms}ms`);
  }
});

test("the scenes are the drill, in the order you would coach it", () => {
  const scenes = reelScenes(drill);
  assert.equal(scenes[0].text, drill.name);
  assert.equal(scenes[1].text, drill.setup);
  assert.deepEqual(scenes.slice(2, -3).map((s) => s.text), drill.how.slice(0, 3));
  assert.equal(scenes.at(-3)!.text, drill.coaching);
  assert.equal(scenes.at(-2)!.text, drill.reps);
  assert.equal(scenes.at(-1)!.text, closingFact(), "the reel should close on what the app does");
  assert.ok(scenes.every((s) => s.ms > 0), "a scene with no duration is a frame nobody sees");
});

/**
 * The recorder stops on a timer, and a timer can slip. Clamping to the last
 * scene would record the final card for as long as the slip lasts; returning
 * null lets the recorder stop instead.
 */
test("past the end is nothing, not the last card forever", () => {
  const scenes = reelScenes(drill);
  const total = reelDuration(scenes);
  assert.equal(sceneAt(scenes, total), null);
  assert.equal(sceneAt(scenes, total + 5000), null);
  assert.equal(sceneAt(scenes, -1), null);
  assert.equal(sceneAt(scenes, 0)?.index, 0);
  assert.equal(sceneAt(scenes, total - 1)?.index, scenes.length - 1);
});

test("every scene gets its turn, and the boundaries do not overlap or gap", () => {
  const scenes = reelScenes(drill);
  let t = 0;
  for (let i = 0; i < scenes.length; i++) {
    assert.equal(sceneAt(scenes, t)?.index, i, `${t}ms should open scene ${i}`);
    assert.equal(sceneAt(scenes, t)?.progress, 0);
    assert.equal(sceneAt(scenes, t + scenes[i].ms - 1)?.index, i, `${t}ms scene ${i} ends early`);
    t += scenes[i].ms;
  }
  assert.equal(t, reelDuration(scenes));
});

test("a frame is vertical, and the same t always draws the same frame", () => {
  const scenes = reelScenes(drill);
  const a = reelFrameSvg(scenes, 500);
  assert.equal(a, reelFrameSvg(scenes, 500), "the storyboard is not reproducible");
  assert.match(a, /width="1080" height="1920"/, "a reel that is not 9:16 gets bars or a crop");
  assert.ok(a.includes(drill.name), "the first card should name the drill");
  assert.ok(!reelFrameSvg(scenes, reelDuration(scenes) + 1).includes(drill.reps),
    "past the end should draw no card");
});

test("the text is escaped — a drill name with an ampersand must not break the frame", () => {
  const svg = reelFrameSvg([{ kicker: "A & B", text: "5 < 6 & > 4", ms: 2000 }], 10);
  assert.ok(!/<text[^>]*>[^<]*&(?!amp;|lt;|gt;)/.test(svg), svg);
  assert.ok(svg.includes("&amp;"));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A WEBM IS NOT A REEL.
 *
 * Instagram takes MP4 and MOV. MediaRecorder's historical default is WebM, so
 * a recorder that asks for "video" produces a file that is rejected at the
 * upload screen, long after the person thought they were done.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("mp4 is preferred, and a webm is reported as not postable", () => {
  const all = pickMimeType(() => true);
  assert.equal(all?.type, REEL_MIME_TYPES[0], "H.264 in mp4 should win when it is available");
  assert.equal(all?.postable, true);

  const webmOnly = pickMimeType((t) => t.startsWith("video/webm"));
  assert.ok(webmOnly?.type.startsWith("video/webm"));
  assert.equal(webmOnly?.postable, false, "the UI has to be able to warn — this is what it reads");

  assert.equal(pickMimeType(() => false), null, "no supported type is null, not a guess");

  assert.equal(fileExtension("video/mp4;codecs=avc1.42E01E"), "mp4");
  assert.equal(fileExtension("video/webm;codecs=vp9"), "webm");
});

/**
 * The closer is the only card that is about the product rather than the drill,
 * so it is the only one that can make a claim — and it must not.
 */
test("the closing card is a verified fact, not a slogan", () => {
  const fact = closingFact();
  assert.ok(fact.length > 20);
  assert.deepEqual(captionProblems(fact), [], "the reel closes on something we cannot say");
  assert.ok(reelFrameSvg(reelScenes(drill), 1e9 - 1) !== null);
});
