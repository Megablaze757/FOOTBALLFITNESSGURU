import { test } from "node:test";
import assert from "node:assert/strict";
import { REEL_KINDS, reelSubjects, type ReelKind } from "./reel-kinds";
import { reelDuration, MIN_REEL_MS, MAX_REEL_MS, reelFrameSvg } from "./reel";
import { captionProblems } from "./caption";

const KINDS = REEL_KINDS.map((k) => k.id);

test("every kind produces reels Instagram will accept", () => {
  for (const kind of KINDS) {
    const subjects = reelSubjects(kind);
    assert.ok(subjects.length > 0, `${kind} produced nothing`);
    for (const s of subjects) {
      const ms = reelDuration(s.scenes);
      assert.ok(ms >= MIN_REEL_MS && ms <= MAX_REEL_MS, `${kind}/${s.id}: ${ms}ms`);
      assert.ok(s.scenes.length >= 3, `${kind}/${s.id}: ${s.scenes.length} cards is not a reel`);
    }
  }
});

test("no card is blank, and every card holds long enough to read", () => {
  for (const kind of KINDS) {
    for (const s of reelSubjects(kind)) {
      for (const scene of s.scenes) {
        assert.ok(scene.text.trim().length > 0, `${kind}/${s.id}: a card with no words`);
        assert.ok(scene.ms > 0, `${kind}/${s.id}: a card nobody sees`);
      }
    }
  }
});

test("subject ids are unique within a kind, so a download cannot overwrite another", () => {
  for (const kind of KINDS) {
    const ids = reelSubjects(kind).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${kind} has duplicate ids`);
  }
});

/**
 * Every kind is content that goes out under our name, so the claim rules apply
 * to all of it — not only to the drill reels the checker was written for.
 */
test("nothing any reel says breaks the claim rules", () => {
  for (const kind of KINDS) {
    for (const s of reelSubjects(kind)) {
      const text = s.scenes.map((sc) => sc.text).join(". ");
      assert.deepEqual(
        captionProblems(text).filter((p) => !/characters|hashtags|behind "more"/.test(p)),
        [],
        `${kind}/${s.id}`,
      );
    }
  }
});

test("every reel is 9:16 and renders its first card", () => {
  for (const kind of KINDS) {
    const [first] = reelSubjects(kind);
    const svg = reelFrameSvg(first.scenes, 100);
    assert.match(svg, /width="1080" height="1920"/, `${kind} is not vertical`);
    // Word by word, not a slice: the frame wraps text into separate <text>
    // elements, so any substring that spans a line break is absent by design.
    for (const word of first.scenes[0].text.split(/\s+/).filter((w) => /^[a-z]{4,}$/i.test(w))) {
      assert.ok(svg.includes(word), `${kind} does not draw "${word}" from its own first card`);
    }
  }
});

test("an unknown kind is a type error, not a silent empty list", () => {
  // The switch is exhaustive over ReelKind, so this can only be reached by
  // casting — and when it is, it must not quietly return nothing.
  assert.equal(reelSubjects("nonsense" as ReelKind), undefined);
});

/** The tutorials must actually teach: a one-line benefit is not a how-to. */
test("exercise reels only use movements with a real how-to", () => {
  for (const s of reelSubjects("exercise")) {
    const steps = s.scenes.filter((sc) => sc.kicker.startsWith("STEP"));
    assert.ok(steps.length >= 1, `${s.id} has no steps`);
    const cues = s.scenes.filter((sc) => sc.kicker === "CUE");
    assert.ok(cues.length >= 2, `${s.id} has ${cues.length} cues`);
  }
});
