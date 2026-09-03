import { test } from "node:test";
import assert from "node:assert/strict";
import { REEL_KINDS, reelSubjects, hookText, HOOK_MAX_WORDS, type ReelKind } from "./reel-kinds";
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
    // Sampled at the END of the first card. The lines arrive one at a time
    // now, so an early frame legitimately shows only the first of them —
    // asserting on t=100 would be asserting the reveal does not happen.
    const svg = reelFrameSvg(first.scenes, first.scenes[0].ms - 1);
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

/**
 * The hook is the whole first second. It must be a claim somebody would stop
 * for, not the name of the thing — and short enough to be read in that second.
 */
test("every reel opens on a hook, not on a label", () => {
  for (const kind of KINDS) {
    for (const s of reelSubjects(kind)) {
      const first = s.scenes[0];
      assert.equal(first.kicker, "", `${kind}/${s.id}: a label above the hook is one more thing to read`);
      const words = first.text.split(/\s+/).length;
      assert.ok(words <= HOOK_MAX_WORDS, `${kind}/${s.id}: ${words}-word hook — "${first.text}"`);
      assert.notEqual(first.text, s.label, `${kind}/${s.id} opens on its own name`);
    }
  }
});

test("hookText cuts at a clause, never mid-word, and leaves short ones alone", () => {
  assert.equal(hookText("Set the ball outside your body"), "Set the ball outside your body");
  assert.equal(
    hookText("Your first touch decides the pass — set the ball outside your body, not under it."),
    "Your first touch decides the pass",
  );
  // Already inside the limit, so it is left whole: the clause cut is for hooks
  // that would otherwise overrun, not a style rule applied to every string.
  assert.equal(hookText("Keep the chest up, drive through the floor"),
    "Keep the chest up, drive through the floor");
  assert.equal(
    hookText("Keep the chest up, drive hard through the floor and finish tall every single rep"),
    "Keep the chest up",
  );

  // No clause in range: a word cut, with no trailing punctuation left hanging.
  const long = "one two three four five six seven eight nine ten eleven twelve thirteen";
  const cut = hookText(long);
  assert.equal(cut.split(" ").length, HOOK_MAX_WORDS);
  assert.ok(long.startsWith(cut), "the hook is not a prefix of what it came from");
  assert.ok(!/[,;:—–-]$/.test(cut));
});
