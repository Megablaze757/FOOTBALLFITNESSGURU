import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_DRILLS } from "./skills";
import { DEMO_SCREENS } from "./demo-card";
import {
  drillCaption, demoCaption, renderCaption, captionProblems, hashtags, supportingFact,
  CAPTION_FOLD, CAPTION_MAX,
} from "./caption";

const drill = SKILL_DRILLS[0];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FIRST LINE IS THE ONLY LINE MOST PEOPLE SEE.
 *
 * Instagram folds a caption at 125 characters behind "... more". A caption
 * that opens with the drill name and step one has spent its one visible line
 * on setup instructions.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every drill caption puts something worth reading above the fold", () => {
  for (const d of SKILL_DRILLS) {
    const text = renderCaption(drillCaption(d));
    const first = text.split("\n")[0];
    assert.ok(first.length <= CAPTION_FOLD, `${d.id}: first line is ${first.length} chars`);
    assert.ok(first.length > 15, `${d.id}: first line says almost nothing — "${first}"`);
    // The cue leads, unless the cue is itself longer than the fold — then it
    // moves into the body WHOLE rather than being cut mid-clause, and the
    // opener names the drill instead.
    if (d.coaching.length <= CAPTION_FOLD) {
      assert.equal(first, d.coaching, `${d.id}: the cue should be the hook`);
    } else {
      assert.ok(first.includes(d.name), `${d.id}: a long cue should fall back to the name — "${first}"`);
      assert.ok(text.includes(d.coaching), `${d.id}: the long cue was dropped instead of moved`);
    }
  }
});

test("a caption carries the drill and fits Instagram", () => {
  const text = renderCaption(drillCaption(drill));
  assert.ok(text.includes(drill.name));
  assert.ok(text.includes(drill.setup));
  assert.ok(text.includes(drill.reps));
  for (const step of drill.how.slice(0, 3)) assert.ok(text.includes(step), `missing: ${step}`);
  assert.ok(text.length <= CAPTION_MAX);
});

test("every drill and demo caption passes the claim rules", () => {
  for (const d of SKILL_DRILLS) {
    assert.deepEqual(captionProblems(renderCaption(drillCaption(d))), [], d.id);
  }
  for (const s of DEMO_SCREENS) {
    assert.deepEqual(captionProblems(renderCaption(demoCaption(s.id))), [], s.id);
  }
});

/**
 * The rules have to catch what they are for. Every line below is something a
 * person could plausibly type into a caption box on a good day.
 */
test("the claim rules catch what NEVER_CLAIM lists", () => {
  const banned: [string, RegExp][] = [
    ["This prevents hamstring injuries.", /medical claim/],
    ["Will add 5kg to your squat in four weeks.", /promised result/],
    ["The best training app for footballers.", /superlative/],
    ["Join 12,000 athletes training with us.", /user number/],
    ["Trusted by pros across the league.", /affiliation/],
  ];
  for (const [text, expected] of banned) {
    const found = captionProblems(text);
    assert.ok(found.some((p) => expected.test(p)), `not caught: ${text} — got ${JSON.stringify(found)}`);
  }

  // The wall itself, which the rules must catch even when the generator would
  // never produce one — the box is editable, and this is what checks the edit.
  const wall = "Nice drill.\n" + Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(" ");
  assert.ok(captionProblems(wall).some((p) => /hashtags reads as spam/.test(p)), captionProblems(wall).join("; "));
  assert.deepEqual(captionProblems("Good rep.\n#football #passing #pocketathlete"), []);

  assert.deepEqual(captionProblems("Set the ball outside your body, not under it."), []);
});

test("the fold and the length are both checked", () => {
  assert.ok(captionProblems("x".repeat(CAPTION_FOLD + 1)).some((p) => /behind "more"/.test(p)));
  assert.ok(captionProblems("short\n" + "x".repeat(CAPTION_MAX)).some((p) => /limit/.test(p)));
});

/** Four tags, not thirty — a hashtag wall is what the content pack forbids. */
test("hashtags are few, lowercase and specific to the drill", () => {
  for (const d of SKILL_DRILLS) {
    const tags = hashtags(d);
    assert.ok(tags.length <= 5, `${d.id}: ${tags.length} tags`);
    assert.equal(new Set(tags).size, tags.length, `${d.id}: duplicate tags`);
    for (const t of tags) assert.match(t, /^#[a-z0-9]+$/, `${d.id}: ${t} is not a usable tag`);
  }
  assert.ok(hashtags(drill).includes("#pocketathlete"));
});

/** The closing line has to be a fact from lib/content.ts, not a slogan. */
test("the call to action is a verified fact", () => {
  const fact = supportingFact();
  assert.ok(fact.length > 20, "no supporting fact was found — has FACT_GROUPS moved?");
  assert.ok(renderCaption(drillCaption(drill)).includes(fact));
  assert.deepEqual(captionProblems(fact), []);
});

test("an unknown demo screen throws rather than captioning the wrong picture", () => {
  assert.throws(() => demoCaption("leaderboard" as never), /unknown demo screen/);
});
