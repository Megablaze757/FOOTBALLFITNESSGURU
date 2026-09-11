import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captionLines, captionReadMs, MIN_CAPTION_MS } from "./caption-lines";
import { LEAD_MS } from "./narration";
import { MAX_HOLD_MS } from "./reel-retention";
import {
  HOOK_MS, REEL_H, REEL_RATIO, REEL_SCALE, REEL_W,
  captionsFor, MAX_CAPTION_MS, reelPlan, srt, srtTime, type PlannableScript, endCardAt, END_CARD_MS, } from "./reel-plan";

const script: PlannableScript = {
  id: "demo",
  hook: "Is your bench press any good?",
  beats: [
    { at: 0, ms: 3_000, route: "/a", action: "one", say: "One two three four five six" },
    { at: 3_000, ms: 2_000, route: "/b", action: "two", say: "" },
    { at: 5_000, ms: 4_000, route: "/c", action: "three", say: "Seven eight nine" },
  ],
  totalMs: 9_000,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MISTAKE THIS CONSTANT EXISTS TO PREVENT.
 *
 * The first recording was made at 430x932 — the iPhone Pro Max viewport — and
 * called 9:16 because it is phone-shaped. 430/932 is 0.461. Every platform
 * letterboxes anything narrower than 0.5625, so those reels would have shipped
 * with bars down the sides for a reason nobody would have thought to check.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the frame is exactly 9:16, and records at the native size", () => {
  assert.equal(REEL_W / REEL_H, REEL_RATIO, `${REEL_W}x${REEL_H} is ${REEL_W / REEL_H}, not 9:16`);
  assert.equal(REEL_W * REEL_SCALE, 1080, "not 1080 wide, so the platform rescales it");
  assert.equal(REEL_H * REEL_SCALE, 1920, "not 1920 tall, so the platform rescales it");
});



test("captions fill their beat exactly, with no gap at the end", () => {
  for (const words of [1, 2, 5, 7, 9, 13, 20]) {
    const say = Array.from({ length: words }, (_, i) => `w${i}`).join(" ");
    const beat = { at: 1_234, ms: 3_333, say };
    const captions = captionsFor(beat);
    assert.equal(captions[0].at, beat.at, `${words} words: starts late`);
    const end = captions[captions.length - 1];
    assert.equal(end.at + end.ms, beat.at + beat.ms, `${words} words: ends early — a blank frame reads as a stall`);
    for (let i = 1; i < captions.length; i++) {
      assert.equal(captions[i].at, captions[i - 1].at + captions[i - 1].ms, `${words} words: gap before ${i}`);
    }
  }
});

test("a silent beat produces no captions rather than an empty one", () => {
  assert.deepEqual(captionsFor({ at: 0, ms: 2_000, say: "" }), []);
});

test("a plan keeps every beat, in order, with absolute timings", () => {
  const plan = reelPlan(script);
  assert.deepEqual(plan.steps.map((s) => s.index), [0, 1, 2]);
  assert.deepEqual(plan.steps.map((s) => s.route), ["/a", "/b", "/c"]);
  assert.equal(plan.totalMs, 9_000);
  assert.equal(plan.steps[2].captions[0].at, 5_000, "captions are timed within the beat, not from the start");
});

/** A hook still up when the second screen arrives hides the cut it earned. */
test("the hook never outlasts the first beat", () => {
  assert.equal(reelPlan(script).hookMs, Math.min(HOOK_MS, 3_000));
  const short = { ...script, beats: [{ ...script.beats[0], ms: 900 }, ...script.beats.slice(1)] };
  assert.equal(reelPlan(short).hookMs, 900);
});

// --- the caption file --------------------------------------------------------

/**
 * A COMMA before the milliseconds. A full stop is WebVTT, and a player handed
 * the wrong one shows no captions and reports nothing — the silent failure
 * this format is famous for.
 */
test("SRT timecodes are the shape SRT wants", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(1_234), "00:00:01,234");
  assert.equal(srtTime(61_000), "00:01:01,000");
  assert.equal(srtTime(3_661_007), "01:01:01,007");
  assert.equal(srtTime(-50), "00:00:00,000");
  assert.match(srtTime(1_500), /,/, "a full stop here is WebVTT and shows no captions at all");
});

test("the caption file is numbered from one and separated by blank lines", () => {
  const text = srt(reelPlan(script));
  const blocks = text.trim().split("\n\n");
  assert.equal(blocks.length, captionsFor(script.beats[0]).length + captionsFor(script.beats[2]).length);
  blocks.forEach((block, i) => {
    const [index, times] = block.split("\n");
    assert.equal(index, String(i + 1), "SRT indices must run 1,2,3 or players stop at the gap");
    assert.match(times, /^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/, times);
  });
});

test("a reel with nothing to say still produces a valid, empty caption file", () => {
  const silent = { ...script, beats: script.beats.map((b) => ({ ...b, say: "" })) };
  assert.equal(srt(reelPlan(silent)).trim(), "");
});

// ═══════════════════════════════════════════════════════════════════════════
// THE END CARD.
//
// The recorded reel ended on the app with nothing written on it. These fix
// where the card goes, and the one rule that matters: it never covers a line
// somebody is still reading.
// ═══════════════════════════════════════════════════════════════════════════

const cap = (at: number, ms: number) => ({ at, ms, text: "x" });

test("the end card takes the tail, and only the tail", () => {
  assert.equal(endCardAt(25_700, [cap(21_000, 2_000)]), 25_700 - END_CARD_MS);
});

/**
 * The one that matters. A beat with barely any tail must give the card less
 * time, not draw it over the caption.
 */
test("a short tail shortens the card rather than covering the caption", () => {
  const captions = [cap(0, 1_000), cap(1_000, 4_500)];
  const at = endCardAt(5_000, captions);
  assert.equal(at, 5_500, "the card was drawn while the last caption was still up");
  assert.ok(at >= 1_000 + 4_500, "the card overlaps a caption");
});

test("the last caption is the latest one, not the last in the array", () => {
  // captionsFor emits them in order, but nothing here should depend on that.
  assert.equal(endCardAt(9_000, [cap(6_000, 2_500), cap(0, 1_000)]), 8_500);
});

test("no captions still puts the card in the tail rather than at zero", () => {
  assert.equal(endCardAt(4_000, []), 4_000 - END_CARD_MS);
  assert.equal(endCardAt(1_000, []), 0, "a beat shorter than the card starts it at the beginning, not before it");
});

test("the card is long enough to read and short enough not to be the reel", () => {
  assert.ok(END_CARD_MS >= 1_200, `${END_CARD_MS}ms is not long enough to read a call to action`);
  assert.ok(END_CARD_MS <= 3_000, `${END_CARD_MS}ms of end card is a slide, not a tail`);
});

/** The card has to actually be drawn, and with the words the site uses. */
test("the recorder draws the card, and draws the site's own call to action", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /endCardAt\(step\.at \+ step\.ms, step\.captions\)/,
    "the end card is timed by something other than endCardAt");
  assert.match(src, /__reelHook\(t\).*\n.*SIGNUP_CTA|SIGNUP_CTA,/,
    "the end card does not use the site's own call to action");
  assert.match(src, /step\.index === plan\.steps\.length - 1/,
    "the end card is not restricted to the last beat");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE END CARD WAS DRAWN FOR ZERO MILLISECONDS THE MOMENT THE REEL SPOKE AT
 * THE END.
 *
 * endCardAt places the card at the LATER of "the last caption has finished"
 * and "END_CARD_MS before the end" — deliberately, so it can never be drawn
 * over a line somebody is still reading. And captionsFor fills a beat exactly:
 * the last caption takes whatever remains, by construction.
 *
 * Both are correct on their own. Together they mean a last beat with a line on
 * it has its card placed at its own final millisecond. Giving the reel a
 * spoken sign-off would have silently deleted the written one, and the
 * timeline, the plan JSON and the retention report would all have looked
 * right. Beat.tail is the room; this is the test that it is actually kept.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a last beat that speaks still leaves the end card its room", () => {
  const beat = { at: 0, ms: 6_000, say: "PocketAthlete, free, link in the bio.", tail: END_CARD_MS };
  const captions = captionsFor(beat);

  assert.ok(captions.length > 0, "the sign-off produced no caption at all");
  const end = Math.max(...captions.map((c) => c.at + c.ms));
  assert.equal(end, beat.ms - END_CARD_MS,
    "the captions spent the tail — the end card is placed after them and gets nothing");

  const card = endCardAt(beat.ms, captions);
  assert.equal(beat.ms - card, END_CARD_MS, "the end card is on screen for the wrong length");

  /** The captions still fill everything they are allowed, with no gap. */
  let at = 0;
  for (const caption of captions) {
    assert.equal(caption.at, at, "the captions no longer run back to back");
    at += caption.ms;
  }
});

/** Without a tail nothing changes: this is the shape every other beat has. */
test("a beat with no tail still fills itself exactly", () => {
  const captions = captionsFor({ at: 0, ms: 4_000, say: "The cheap one's red lentils." });
  assert.equal(Math.max(...captions.map((c) => c.at + c.ms)), 4_000);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAPTIONS WERE TIMED BY CHARACTER ARITHMETIC AND THE VOICE WAS NOT.
 *
 * "Captions aren't in sync." Measured on a recorded reel by finding the voice
 * onsets in the muxed audio and comparing them with the reel's own SRT: ten of
 * twelve captions more than 0.25s out, worst 2.54s.
 *
 * Structural, not rounding. captionLines cuts at 42 characters, seven words
 * and commas; `phrases` cuts at SENTENCES, because that is where a voice
 * stops. demo-readiness is twelve captions over six spoken phrases — "This one
 * asks first — bad night, wrecked legs, ten seconds." is one unbroken
 * utterance and three captions, and they were spread across it by how many
 * characters each had while the audio simply played.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a caption starts when its phrase does, not where the arithmetic lands", () => {
  const beat = {
    at: 10_000,
    ms: 8_000,
    say: "This one asks first — bad night, wrecked legs, ten seconds. Then it rebuilds.",
  };
  /** One unbroken utterance, then a short one after a real gap. */
  const clips = [{ atMs: 300, ms: 4_000 }, { atMs: 5_200, ms: 1_600 }];

  const anchored = captionsFor(beat, clips);
  const arithmetic = captionsFor(beat);

  assert.ok(anchored.length > clips.length, "the captions are cut finer than the speech — that is the whole problem");

  /**
   * The first phrase's caption reclaims LEAD_MS — dead air at the top of every
   * beat — and NOT the rest, which is the script's suspense hold. Starting
   * inside a hold would put the words up before the shot that earns them.
   *
   * Derived from LEAD_MS rather than typed: a hardcoded 10_000 here passed
   * only because I had guessed the fixture's lead, and would have gone on
   * "passing" by being wrong in the same direction as the code.
   */
  assert.equal(anchored[0].at, 10_000 + (300 - LEAD_MS),
    "the first caption does not reclaim exactly the lead-in");

  /** The second phrase's captions start when the SECOND PHRASE does. */
  const second = anchored.find((c) => c.at >= 10_000 + 5_200);
  assert.ok(second, "nothing is timed to the second phrase at all");
  assert.equal(second!.at, 10_000 + 5_200, "the second phrase's caption does not start with the voice");
  assert.notEqual(second!.at, arithmetic.find((c) => c.text === second!.text)?.at,
    "anchoring changed nothing, so the clips are being ignored");

  /**
   * AND THEY MAY OUTLAST THE VOICE. The first version gave each caption its
   * phrase's SPEAKING time and the runner refused the reel — ten captions too
   * brief to read, "Not a warning —" on for 920ms needing 1300. A voice is
   * faster than an eye. Sync is about when a caption appears; when it leaves
   * is free, so the gap before the next phrase is reading time.
   */
  const firstPhrase = anchored.filter((c) => c.at < 10_000 + 5_200);
  const lastOfFirst = firstPhrase[firstPhrase.length - 1];
  assert.equal(lastOfFirst.at + lastOfFirst.ms, 10_000 + 5_200,
    "the first phrase's captions stop dead with its audio instead of running to the next one");
  const last = anchored[anchored.length - 1];
  assert.equal(last.at + last.ms, 10_000 + 8_000, "the captions do not fill the beat");

  /** Every one of them gets its reading time, which is the point of the above. */
  for (const c of anchored) {
    assert.ok(c.ms >= captionReadMs(c.text), `"${c.text}" is on for ${c.ms}ms and needs ${captionReadMs(c.text)}ms`);
  }
});

/** A silent reel and the studio preview have no audio to anchor to. */
test("with no clips the captions fall back to filling the beat", () => {
  const beat = { at: 0, ms: 6_000, say: "The cheap one's red lentils. The dear one is prawns." };
  assert.deepEqual(captionsFor(beat, []), captionsFor(beat));
  assert.equal(Math.max(...captionsFor(beat).map((c) => c.at + c.ms)), 6_000);
});

/**
 * The recorder speaks spokenForm(say) and captionsFor splits the ORIGINAL, so
 * a change that made the two disagree about sentence boundaries would pair
 * caption three with phrase two and be invisible. Falling back is wrong-ish
 * and honest; guessing is wrong and confident.
 */
test("a clip count that does not match the sentences is not guessed at", () => {
  const beat = { at: 0, ms: 6_000, say: "One sentence only." };
  const nonsense = [{ atMs: 0, ms: 1_000 }, { atMs: 2_000, ms: 1_000 }, { atMs: 4_000, ms: 1_000 }];
  assert.deepEqual(captionsFor(beat, nonsense), captionsFor(beat));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MANY CAPTIONS AS THE PHRASE HAS TIME FOR.
 *
 * captionLines cuts by LENGTH and says nothing about how long a phrase takes
 * to say. Once the captions are anchored to real audio the two have to agree,
 * and one recording failed twice from the same mismatch: "next to you." on
 * screen for 792ms, and a caption holding one screen for five seconds.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a phrase spoken quickly does not get more captions than it has time for", () => {
  const say = "PocketAthlete ranks every lift against your bodyweight, not against the bloke next to you.";
  const fast = captionsFor({ at: 0, ms: 2_600, say }, [{ atMs: 0, ms: 2_600 }]);
  for (const c of fast) {
    assert.ok(c.ms >= MIN_CAPTION_MS,
      `"${c.text}" flashes for ${c.ms}ms — under ${MIN_CAPTION_MS}ms the eye does not land on it`);
  }
});

test("a phrase spoken slowly does not leave one caption sitting still", () => {
  const say = "PocketAthlete ranks every lift against your bodyweight, not against the bloke next to you.";
  const slow = captionsFor({ at: 0, ms: 12_000, say }, [{ atMs: 0, ms: 12_000 }]);
  for (const c of slow) {
    assert.ok(c.ms <= MAX_CAPTION_MS,
      `"${c.text}" holds for ${c.ms}ms, which reads as a still frame`);
  }
});

/** Short text cannot be split forever, and must not loop trying. */
test("a phrase too short to fill its span is left alone", () => {
  const caps = captionsFor({ at: 0, ms: 9_000, say: "Same bar." }, [{ atMs: 0, ms: 9_000 }]);
  assert.equal(caps.length, 1, "three syllables were cut into pieces to fill time");
  assert.equal(caps[0].text, "Same bar.");
});

/**
 * The ceiling is MAX_HOLD_MS's, repeated rather than imported because
 * reel-retention imports this module for its types. Repeated numbers drift.
 */
test("the caption ceiling is the one the retention rule enforces", () => {
  assert.equal(MAX_CAPTION_MS, MAX_HOLD_MS);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE LINE BY WIDTH IS NOT ONE LINE BY TIME.
 *
 * fitToSpan took a shortcut for text that already fits on a single caption —
 * and asked only whether the span was long ENOUGH, never whether it was too
 * long. So "100kg at 60kg bodyweight is exceptional." (forty characters, one
 * line by every width rule) held the screen for 6.2 seconds, because a caption
 * stays up through the pause that follows its phrase rather than blinking off
 * into silence.
 *
 * Length decided in one place and duration in another is the entire class of
 * bug this function exists for, and the shortcut reintroduced it.
 *
 * Reproduced with the real measured durations off the synthesiser rather than
 * invented ones, which is why the number in the name is exact.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a single-line phrase is still re-cut when its span is long", () => {
  const say = "100kg at 60kg bodyweight is exceptional.";
  assert.equal(captionLines(say).length, 1, "the premise is gone — this no longer fits on one line");

  const caps = captionsFor({ at: 0, ms: 6_170, say }, [{ atMs: 0, ms: 6_170 }]);
  assert.ok(caps.length > 1, `one caption over 6.17s holds the screen for all of it`);
  for (const c of caps) {
    assert.ok(c.ms <= MAX_CAPTION_MS, `"${c.text}" holds for ${c.ms}ms`);
    assert.ok(c.ms >= MIN_CAPTION_MS, `"${c.text}" flashes for ${c.ms}ms`);
  }
});

/** And a short span still leaves a short phrase alone. */
test("a single-line phrase in a short span is left as one caption", () => {
  const caps = captionsFor({ at: 0, ms: 2_400, say: "Same bar." }, [{ atMs: 0, ms: 2_400 }]);
  assert.equal(caps.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// A FASTER VOICE MAKES SHORT LINES UNREADABLE, AND THE FIX IS NOT MORE TIME.
//
// The runner refused a reel with: beat 2: "Same bar." is on screen for 967ms —
// under 1000ms the eye does not land on it at all. Correct, and not something
// the plan can stretch: that caption ends when the next phrase starts speaking,
// and when it is the LAST phrase of its beat it ends when the beat does.
// ═══════════════════════════════════════════════════════════════════════════

/** A beat whose final phrase is spoken too fast to read on its own. */
const briefTail = {
  at: 0,
  ms: 4_000,
  say: "One hundred kilos at sixty is exceptional. At one twenty, novice. Same bar.",
  clips: [{ atMs: LEAD_MS, ms: 1_600 }, { atMs: 1_900, ms: 1_000 }, { atMs: 3_100, ms: 700 }],
};

test("a short last phrase is merged backward rather than flashed", () => {
  const captions = captionsFor(briefTail, briefTail.clips);
  assert.ok(captions.length, "no captions at all");
  for (const c of captions) {
    assert.ok(c.ms >= MIN_CAPTION_MS,
      `"${c.text}" is on screen for ${Math.round(c.ms)}ms — under ${MIN_CAPTION_MS}ms`);
  }
  // The words all survive the merge; nothing is dropped to make room.
  assert.ok(captions.map((c) => c.text).join(" ").includes("Same bar"),
    "the merged-away phrase lost its words");
});

test("a short middle phrase shares a card with the one after it", () => {
  const beat = {
    at: 0,
    ms: 5_000,
    say: "Means nothing. Against your bodyweight? Means everything. And that is the whole idea.",
    clips: [{ atMs: LEAD_MS, ms: 500 }, { atMs: 700, ms: 600 }, { atMs: 1_400, ms: 700 }, { atMs: 2_300, ms: 1_800 }],
  };
  const captions = captionsFor(beat, beat.clips);
  for (const c of captions) {
    assert.ok(c.ms >= MIN_CAPTION_MS,
      `"${c.text}" is on screen for ${Math.round(c.ms)}ms — under ${MIN_CAPTION_MS}ms`);
  }
});

/**
 * Merging is for phrases that CANNOT have their own card. A beat with room
 * must still caption phrase by phrase, or every reel becomes two long cards.
 */
test("phrases with room enough keep their own cards", () => {
  const beat = {
    at: 0,
    ms: 8_000,
    say: "Every other app decided your week on Sunday. PocketAthlete asks first.",
    clips: [{ atMs: LEAD_MS, ms: 3_600 }, { atMs: 4_000, ms: 3_000 }],
  };
  const captions = captionsFor(beat, beat.clips);
  assert.ok(captions.length >= 2, `${captions.length} caption(s) — the phrases were merged unnecessarily`);
});
