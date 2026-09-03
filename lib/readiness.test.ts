// Run with: node --test  (after `tsc`/`ts-node`) — or use vitest in CI.
// Kept as plain node:test assertions against the pure scoring function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, prettyBodyPart } from "./readiness";
import type { CheckInInput } from "./types";

const base = {
  pain_map: {},
  fatigue_score: 3,
  sleep_quality: 8,
  nutrition_quality: 8,
  weight_kg: null,
  is_match_day: false,
  match_minutes_played: 0,
};

test("well-rested athlete is Green", () => {
  const r = assessReadiness(base);
  assert.equal(r.status, "Green");
  assert.ok(r.score >= 70);
  assert.equal(r.focus_body_part, null);
});

test("high joint pain forces Red and names the body part", () => {
  const r = assessReadiness({ ...base, pain_map: { knee_left: 8 } });
  assert.equal(r.status, "Red");
  assert.equal(r.focus_body_part, "left knee");
  assert.match(r.advice, /left knee/i);
});

test("very poor sleep forces Red regardless of score", () => {
  const r = assessReadiness({ ...base, sleep_quality: 2 });
  assert.equal(r.status, "Red");
});

test("middling inputs land in Yellow", () => {
  const r = assessReadiness({
    ...base,
    fatigue_score: 7,
    sleep_quality: 5,
    nutrition_quality: 5,
    pain_map: { ankle_right: 4 },
  });
  assert.equal(r.status, "Yellow");
});

test("prettyBodyPart formats sided joints", () => {
  assert.equal(prettyBodyPart("hamstring_right"), "right hamstring");
  assert.equal(prettyBodyPart("lower_back"), "lower back");
  assert.equal(prettyBodyPart(null), null);
});

// --- training load in the verdict -------------------------------------------
// The app used to say "ready to train" on Home while the load panel was red,
// because readiness scored only how you FEEL. These pin the reconciliation.

test("a load spike caps a Green day at Yellow", () => {
  const green = assessReadiness(base);
  assert.equal(green.status, "Green");

  const spiked = assessReadiness(base, { acwr: 1.8 });
  assert.equal(spiked.status, "Yellow", "feeling fine on an 80% load jump is exactly what ACWR is for");
  assert.equal(spiked.score, green.score, "the spike changes the verdict, not how recovered they are");
});

test("the spike advice says what happened and what to do", () => {
  const r = assessReadiness(base, { acwr: 1.6 });
  assert.match(r.advice, /60%/, "states the jump as a percentage, not a bare ratio");
  assert.match(r.advice, /volume/i, "tells them what to hold back");
});

test("load never rescues a Red day", () => {
  const r = assessReadiness({ ...base, pain_map: { knee_left: 8 } }, { acwr: 0.5 });
  assert.equal(r.status, "Red", "a low ratio must not talk an injured athlete into training");
});

test("load in the sweet spot leaves the verdict alone", () => {
  const plain = assessReadiness(base);
  const withLoad = assessReadiness(base, { acwr: 1.0 });
  assert.equal(withLoad.status, plain.status);
  assert.equal(withLoad.advice, plain.advice);
});

test("climbing load is mentioned without downgrading the day", () => {
  const r = assessReadiness(base, { acwr: 1.4 });
  assert.equal(r.status, "Green");
  assert.match(r.advice, /climbing/i);
});

test("no load data behaves exactly as before", () => {
  assert.deepEqual(assessReadiness(base, { acwr: null }), assessReadiness(base));
  assert.deepEqual(assessReadiness(base, {}), assessReadiness(base));
});

// =============================================================================
// THE ADVICE HAS TO KNOW WHETHER THEY HAVE ALREADY TRAINED.
//
// Every line was written for the morning and shown all day: "train today, keep
// the intensity, hold the volume" to somebody who trained at seven and opened
// the app at nine. Home already knew — it ticks a daily quest with exactly this
// fact — and never passed it to the thing giving the advice.
// =============================================================================

const recovered = {
  pain_map: {}, fatigue_score: 2, sleep_quality: 9, nutrition_quality: 8,
  weight_kg: null, is_match_day: false, match_minutes_played: null,
} as unknown as CheckInInput;

test("it does not tell someone who has trained to go and train", () => {
  // 2.22 is the reported case: "you've trained 122% more this week than your
  // four-week average… Train today, keep the intensity" — shown to somebody who
  // had already trained.
  /**
   * Matched on INTENT, not on a sentence. This asserted the exact strings and
   * broke the moment the copy was shortened — which is a test that pins the
   * wording rather than the behaviour, and the behaviour is the whole point.
   *
   * Prescribing = an imperative "Train", at the start of the advice or of any
   * sentence in it. Acknowledging = naming the session they already did.
   */
  const PRESCRIBES = /(^|[.—-]\s*)Train\b/;
  // "Session done", "Session logged", "Good session" — all three past-tense
  // openers the advice actually uses. Not a bare /session/, which would also
  // match "A moderate session is fine", a prescription.
  const ACKNOWLEDGES = /session (done|logged)|good session|trained today/i;

  for (const acwr of [2.22, 1.4, null] as (number | null)[]) {
    const after = assessReadiness(recovered, { acwr, trainedToday: true });
    assert.ok(!PRESCRIBES.test(after.advice), `acwr ${acwr}: still prescribing a session — ${after.advice}`);
    assert.match(after.advice, ACKNOWLEDGES, `acwr ${acwr}: ${after.advice}`);
  }

  // …and it still prescribes one when they have not trained.
  const before = assessReadiness(recovered, { acwr: 2.22, trainedToday: false }).advice;
  assert.match(before, PRESCRIBES, before);
  assert.ok(!ACKNOWLEDGES.test(before), before);
});

test("having trained changes the advice, never the score", () => {
  // Readiness is a statement about the body. Doing a session does not make you
  // more or less recovered than the check-in said it did — it changes what
  // there is left to decide.
  const a = assessReadiness(recovered, { acwr: 1.1, trainedToday: true });
  const b = assessReadiness(recovered, { acwr: 1.1, trainedToday: false });
  assert.equal(a.score, b.score);
  assert.equal(a.status, b.status);
  assert.notEqual(a.advice, b.advice);
});

test("a Yellow day that has been trained talks about recovery, not intensity", () => {
  const tired = { ...recovered, fatigue_score: 8, sleep_quality: 5 } as CheckInInput;
  const after = assessReadiness(tired, { trainedToday: true });
  assert.equal(after.status, "Yellow");
  assert.ok(!/a moderate session is fine/i.test(after.advice), after.advice);
});

test("a Red day says the same thing either way", () => {
  // High pain and no sleep are the message whether or not they trained — that
  // they already did is not a reason to stop saying so.
  const hurt = { ...recovered, pain_map: { knee_left: 9 } } as CheckInInput;
  assert.equal(
    assessReadiness(hurt, { trainedToday: true }).advice,
    assessReadiness(hurt, { trainedToday: false }).advice,
  );
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WEARABLE CHANGED THE SCORE BY ZERO, IN A FIELD ANNOTATED "-15..+5
 * APPLIED TO READINESS".
 *
 * lib/biometrics.ts computed the adjustment and every test above passed with
 * it disconnected, because none of them crossed the seam: readiness tests fed
 * a check-in, biometrics tests checked the signal, and nothing asserted that
 * one reached the other. The only component that read it was never mounted.
 *
 * These are that seam. The rules they pin down: absent changes nothing, a bad
 * signal can cost you the band, a good one can never outrank a hard limit, and
 * the athlete is told which of their metrics did it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no wearable is not a penalty", () => {
  const plain = assessReadiness(base);
  for (const ctx of [undefined, {}, { biometric: null }, { biometric: { adjustment: 0, note: null } }]) {
    const r = assessReadiness(base, ctx);
    assert.equal(r.score, plain.score, `${JSON.stringify(ctx)} moved the score`);
    assert.equal(r.status, plain.status);
    assert.equal(r.advice, plain.advice, "and it said something different about it");
  }
});

test("a suppressed-HRV morning costs the score and can cost the band", () => {
  // Deliberately just over the Green line rather than `base`, which scores 86:
  // an adjustment that cannot reach a boundary proves nothing about bands.
  const onTheLine = { ...base, sleep_quality: 6, fatigue_score: 5, nutrition_quality: 6 } as CheckInInput;
  const plain = assessReadiness(onTheLine);
  assert.equal(plain.score, 71);
  assert.equal(plain.status, "Green");

  const r = assessReadiness(onTheLine, {
    biometric: { adjustment: -10, note: "HRV is 18% below your norm — your body is under strain" },
  });
  assert.equal(r.score, 61);
  assert.equal(r.status, "Yellow", "a 10-point drop across the Green line has to move the verdict");
  assert.match(r.advice, /^Your watch: HRV is 18% below your norm/);

  // And the same signal on a comfortable morning moves the number without
  // pretending the day is compromised — 86 down to 76 is still Green.
  assert.equal(assessReadiness(base, { biometric: { adjustment: -10, note: "n" } }).status, "Green");
});

test("the watch is only quoted when it cost something", () => {
  const good = assessReadiness(base, {
    biometric: { adjustment: 3, note: "HRV is 14% above your norm — you're well recovered" },
  });
  assert.ok(!good.advice.startsWith("Your watch:"),
    "opening a Red day with good news reads as not having read the room");
  assert.equal(good.score, assessReadiness(base).score + 3);
});

test("good HRV does not outrank a hard limit", () => {
  const hurt = { ...base, pain_map: { knee_left: 8 } } as CheckInInput;
  const r = assessReadiness(hurt, { biometric: { adjustment: 5, note: "you're well recovered" } });
  assert.equal(r.status, "Red", "a knee at 8/10 is Red whatever the watch says");
  assert.match(r.advice, /knee/i);

  const sleepless = { ...base, sleep_quality: 2 } as CheckInInput;
  assert.equal(assessReadiness(sleepless, { biometric: { adjustment: 5, note: "n" } }).status, "Red");
});

test("a load spike still caps a verdict the wearable lifted", () => {
  const r = assessReadiness(base, {
    acwr: 1.8,
    biometric: { adjustment: 5, note: "you're well recovered" },
  });
  assert.equal(r.status, "Yellow", "ACWR caps whatever raised the score");
});

test("the score cannot leave 0-100", () => {
  // The actual extremes, not a rough day: the blend already reaches 0 and 100
  // on its own, so only these two check-ins can push an adjustment off the end.
  const worst = { ...base, pain_map: { knee_left: 10 }, fatigue_score: 10, sleep_quality: 1, nutrition_quality: 1 } as CheckInInput;
  assert.equal(assessReadiness(worst).score, 0, "the floor moved — this test no longer tests the floor");
  const low = assessReadiness(worst, { biometric: { adjustment: -15, note: "n" } });
  assert.equal(low.score, 0, "a wearable penalty took the score negative");

  const best = { ...base, pain_map: {}, fatigue_score: 1, sleep_quality: 10, nutrition_quality: 10 } as CheckInInput;
  assert.equal(assessReadiness(best).score, 100, "the ceiling moved");
  const high = assessReadiness(best, { biometric: { adjustment: 5, note: null } });
  assert.equal(high.score, 100, "a wearable bonus took the score past 100");
});

/**
 * The ternary that the first attempt at this shipped: prefixing each `return`
 * inside buildAdvice turns `return prefix + trainedToday ? a : b` into
 * `(prefix + trainedToday) ? a : b`, which is a non-empty string and therefore
 * always the first branch. Every trainedToday=false case would have silently
 * returned the "session done" copy.
 */
test("the advice still branches on trainedToday with a watch note attached", () => {
  const ctx = { biometric: { adjustment: -5, note: "only 5h sleep" } };
  const tired = { ...base, fatigue_score: 8 } as CheckInInput;
  const before = assessReadiness(tired, { ...ctx, trainedToday: false });
  const after = assessReadiness(tired, { ...ctx, trainedToday: true });
  assert.notEqual(before.advice, after.advice);
  assert.match(after.advice, /Session done|Session logged|session logged/);
  assert.ok(!/Session done|Session logged/.test(before.advice));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTHING HERE IS A PARAGRAPH.
 *
 * This is the most-read text in the app — the coach line on the home card —
 * and it had grown to 57 words in the worst case: a load-spike explanation, a
 * wearable note and a generic sign-off, stacked. On a phone that is a wall
 * where a sentence was wanted, and the athlete stops reading before the part
 * that says what to do.
 *
 * A cap, not a style note, because every one of those clauses arrived
 * separately and each was defensible on its own.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no readiness advice is a wall of text", () => {
  const watch = { adjustment: -10, note: "HRV 18% below your norm; only 5h sleep." };
  const inputs: CheckInInput[] = [
    base as CheckInInput,
    { ...base, pain_map: { knee_left: 8 } } as CheckInInput,
    { ...base, pain_map: { knee_left: 4 }, sleep_quality: 6, fatigue_score: 6 } as CheckInInput,
    { ...base, sleep_quality: 2 } as CheckInInput,
    { ...base, fatigue_score: 8, sleep_quality: 5 } as CheckInInput,
  ];

  let worst = { words: 0, advice: "" };
  for (const input of inputs) {
    for (const acwr of [null, 1.4, 1.8]) {
      for (const trainedToday of [false, true]) {
        for (const biometric of [null, watch]) {
          const { advice } = assessReadiness(input, { acwr, trainedToday, biometric });
          const words = advice.split(/\s+/).length;
          if (words > worst.words) worst = { words, advice };
          assert.ok(words <= 35, `${words} words: ${advice}`);
          // Two sentences that disagree is worse than one that is too long.
          assert.ok(!(/under strain|below your norm/.test(advice) && /well recovered and ready/.test(advice)),
            `the advice contradicts itself: ${advice}`);
          assert.ok(!/\.\s*[A-Z]\S*\s+\S+\s*$/.test(advice) || advice.length < 200);
        }
      }
    }
  }
  assert.ok(worst.words > 20, `the worst case is only ${worst.words} words — is this still testing anything?`);
});
