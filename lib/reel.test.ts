import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_DRILLS } from "./skills";
import {
  holdFor, reelScenes, reelDuration, sceneAt, reelFrameSvg, pickMimeType, fileExtension,
  MIN_SCENE_MS, MIN_REEL_MS, MAX_REEL_MS, REEL_MIME_TYPES, closingFact,
  inspectRecording, isPostable, requestsH264, reelSteps, REEL_FPS,
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
test("H.264 is asked for first, and a bare mp4 is not assumed to be one", () => {
  const all = pickMimeType(() => true);
  assert.equal(all?.type, REEL_MIME_TYPES[0], "explicit H.264 should win when available");
  assert.equal(all?.h264, true);

  // The container without a codec. Preferred over WebM, but not a promise.
  const bare = pickMimeType((t) => t === "video/mp4" || t.startsWith("video/webm"));
  assert.equal(bare?.type, "video/mp4", "an mp4 of unknown codec still beats a webm");
  assert.equal(bare?.h264, false, "asking for a container is not asking for a codec");

  assert.equal(pickMimeType(() => false), null, "no supported type is null, not a guess");
  assert.equal(fileExtension("video/mp4;codecs=avc1.42E01E"), "mp4");
  assert.equal(fileExtension("video/webm;codecs=vp9"), "webm");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BYTES BELOW ARE FROM A REAL RECORDING, NOT FROM THE SPEC.
 *
 * Recording a reel in Chromium and reading its header is what found this: ask
 * for "video/mp4" and it answers with brands `isom iso6 iso2 vp09 mp41` — VP9
 * inside an MP4. The first version of this code reported that as postable. It
 * is an upload failure wearing the right extension.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const REAL_CHROMIUM_MP4 = new Uint8Array([
  0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x36, 0x69, 0x73, 0x6f, 0x32, 0x76, 0x70, 0x30, 0x39,
  0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x02, 0xb7,
]);

test("an mp4 full of VP9 is not reported as a reel", () => {
  const info = inspectRecording(REAL_CHROMIUM_MP4);
  assert.deepEqual(info, { container: "mp4", h264: false });
  assert.equal(isPostable(info), false, "this exact file was called postable, and Instagram rejects it");
});

test("an H.264 mp4 is the one that posts", () => {
  const h264 = Uint8Array.from("\u0000\u0000\u0000\u0018ftypisomisomavc1mp41", (c) => c.charCodeAt(0));
  assert.deepEqual(inspectRecording(h264), { container: "mp4", h264: true });
  assert.equal(isPostable(inspectRecording(h264)), true);
});

test("webm is recognised by its magic number, not its extension", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
  assert.deepEqual(inspectRecording(webm), { container: "webm", h264: false });
  assert.equal(isPostable(inspectRecording(webm)), false);

  assert.deepEqual(inspectRecording(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    { container: "unknown", h264: false });
  assert.equal(isPostable({ container: "unknown", h264: true }), false,
    "an unknown container is never postable, whatever else it claims");
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

test("requestsH264 is what separates a promise from a container name", () => {
  assert.equal(requestsH264("video/mp4;codecs=avc1.42E01E"), true);
  assert.equal(requestsH264("video/mp4;codecs=h264"), true);
  assert.equal(requestsH264("video/mp4"), false);
  assert.equal(requestsH264("video/webm;codecs=vp9"), false);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PACED FOR A FEED, AND HONEST ABOUT WHAT THAT DOES NOT FIX.
 *
 * Reported plainly: these are not viral content. They were 22 seconds of
 * static cards opening on the subject's NAME, which is a label rather than a
 * reason, spent on the one second a feed actually gives you.
 *
 * What changed: a hook first, capped at ten words; lines that arrive one at a
 * time instead of a card appearing whole; and roughly half the hold. What did
 * not change is that a stack of text cards is a text reel — no amount of
 * pacing turns it into footage, and if the format does not work for this
 * account that is worth knowing rather than spending more on it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a card is on screen long enough to read and short enough for a feed", () => {
  const scenes = reelScenes(drill);
  for (const s of scenes) {
    assert.ok(s.ms >= MIN_SCENE_MS, `${s.text}: ${s.ms}ms`);
    assert.ok(s.ms <= 5000, `${s.text} holds for ${s.ms}ms — that is a slide, not a cut`);
  }
});

test("the reveal is stepped, one picture per line, not one per frame", () => {
  const scenes = reelScenes(drill);
  const steps = reelSteps(scenes);
  assert.ok(steps.length >= scenes.length, "fewer pictures than cards");
  assert.ok(steps.length < REEL_FPS * (reelDuration(scenes) / 1000) / 4,
    `${steps.length} images for ${scenes.length} cards — that is per-frame rendering`);

  // Strictly increasing, and every one inside the reel.
  let last = -1;
  for (const s of steps) {
    assert.ok(s.at > last, `steps are not in order: ${s.at} after ${last}`);
    assert.ok(s.at < reelDuration(scenes));
    last = s.at;
  }
});

test("a card shows less at the start than at the end", () => {
  const scenes = reelScenes(drill);
  // A card with more than one line, so there is something to reveal.
  let start = 0;
  const multi = scenes.find((s) => {
    const found = s.text.split(/\s+/).length > 6;
    if (!found) start += s.ms;
    return found;
  });
  assert.ok(multi, "no multi-line card to test the reveal on");

  const early = reelFrameSvg(scenes, start + 10);
  const late = reelFrameSvg(scenes, start + multi!.ms - 1);
  const count = (svg: string) => (svg.match(/font-size="76"/g) ?? []).length;
  assert.ok(count(late) > count(early),
    `the card shows ${count(early)} lines at the start and ${count(late)} at the end — nothing arrives`);
});
