import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYouTubeId, videoSearchUrl, normaliseDraft, publishBlockers, canPublish,
  publishRow, EMPTY_DRAFT, type ExerciseDraft,
} from "./exercise-review";

// --- video ids ----------------------------------------------------------------

test("every shape a YouTube link arrives in", () => {
  const ID = "dQw4w9WgXcQ";
  for (const input of [
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
    `youtube.com/watch?v=${ID}`,
  ]) {
    assert.equal(parseYouTubeId(input), ID, input);
  }
});

test("anything that is not a YouTube video is refused", () => {
  for (const bad of [
    "", "   ", "not a link", "https://vimeo.com/123456",
    "https://www.youtube.com/results?search_query=squat",   // a search is not a video
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch?v=tooshort",
    "https://www.youtube.com/watch",
    "https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ",     // host must be youtube
    "dQw4w9WgXc",                                            // ten characters
    "dQw4w9WgXcQZ",                                          // twelve
  ]) {
    assert.equal(parseYouTubeId(bad), null, bad || "(empty)");
  }
});

test("the search link escapes what is typed into it", () => {
  assert.equal(
    videoSearchUrl("copenhagen plank & hip"),
    "https://www.youtube.com/results?search_query=copenhagen%20plank%20%26%20hip",
  );
});

// --- clamping the model -------------------------------------------------------

test("a good answer comes through intact", () => {
  const d = normaliseDraft({
    category: "Mobility", demo: "plank", difficulty: "medium", equipment: "None",
    muscles: ["Adductors", "Obliques"], cues: ["Stack the shoulder", "Squeeze the top leg"],
    tempo: "Hold 20-30s", why: "Builds the adductor strength that groin strains take out.",
    description: "Lie on your side...\n\nDrive up until...",
    videoSearch: "copenhagen plank how to",
  });
  assert.equal(d.category, "Mobility");
  assert.equal(d.demo, "plank");
  assert.equal(d.difficulty, "medium");
  assert.deepEqual(d.muscles, ["Adductors", "Obliques"]);
  assert.equal(d.cues.length, 2);
  assert.match(d.description, /\n\n/, "a how-to keeps its paragraphs");
});

/**
 * THE FAILURE THIS CATCHES IS SILENT. A category outside the nine does not
 * throw — it makes the exercise invisible to every filter on the library page,
 * so it is published, live, and unfindable.
 */
test("an enum the app does not have falls back instead of passing through", () => {
  const d = normaliseDraft({ category: "Conditioning", demo: "burpee", difficulty: "hard" });
  assert.equal(d.category, "Strength", "not the model's word");
  assert.equal(d.demo, "squat");
  assert.equal(d.difficulty, null, "no difficulty beats a wrong one");
});

test("the fallback is the row that already exists, not a blank", () => {
  const d = normaliseDraft({ cues: ["Only this"] }, { category: "Rehab", demo: "lunge", equipment: "Band" });
  assert.equal(d.category, "Rehab");
  assert.equal(d.demo, "lunge");
  assert.equal(d.equipment, "Band", "what the athlete typed survives an empty answer");
});

test("long and runaway answers are cut to size", () => {
  const d = normaliseDraft({
    why: "x".repeat(500),
    cues: Array.from({ length: 12 }, (_, i) => `cue ${i} ${"y".repeat(200)}`),
    muscles: Array.from({ length: 20 }, (_, i) => `m${i}`),
    description: "z".repeat(5000),
  });
  assert.equal(d.why.length, 160);
  assert.equal(d.cues.length, 4);
  assert.ok(d.cues.every((c) => c.length <= 90));
  assert.equal(d.muscles.length, 6);
  assert.equal(d.description.length, 1500);
});

test("junk in place of an object does not throw", () => {
  for (const junk of [null, undefined, 42, "a string", [], { cues: "not an array" }]) {
    const d = normaliseDraft(junk);
    assert.deepEqual(d.cues, []);
    assert.equal(d.category, "Strength");
  }
});

/**
 * A MODEL WILL HAND YOU A VIDEO ID IF YOU LET IT, and it will be wrong: eleven
 * characters is trivial to imitate and impossible to guess. The id has exactly
 * one way in, and it is a human pasting a link they watched.
 */
test("a video id offered by the model is thrown away", () => {
  const d = normaliseDraft({ youtubeId: "dQw4w9WgXcQ", video_url: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(d.youtubeId, null);
  const kept = normaliseDraft({ youtubeId: "dQw4w9WgXcQ" }, { youtubeId: "aaaaaaaaaaa" });
  assert.equal(kept.youtubeId, "aaaaaaaaaaa", "only what was already chosen survives");
});

// --- publishing ---------------------------------------------------------------

const READY: ExerciseDraft = {
  ...EMPTY_DRAFT,
  equipment: "None",
  muscles: ["Adductors"],
  cues: ["Stack the shoulder", "Squeeze the top leg"],
  why: "Builds the adductor strength that groin strains take out.",
  description: "Lie on your side with the top foot on a bench and the bottom leg hanging. Drive the hips up until the body is one line, hold, and lower under control.",
  youtubeId: "dQw4w9WgXcQ",
};

test("a complete draft publishes", () => {
  assert.deepEqual(publishBlockers(READY, "Copenhagen plank ISO hold"), []);
  assert.equal(canPublish(READY, "Copenhagen plank ISO hold"), true);
});

test("every missing field is named, not just counted", () => {
  const blockers = publishBlockers(EMPTY_DRAFT, "");
  assert.ok(blockers.length >= 6);
  assert.ok(blockers.some((b) => /name/i.test(b)));
  assert.ok(blockers.some((b) => /cues/i.test(b)));
  assert.ok(blockers.some((b) => /video/i.test(b)));
});

/**
 * The app answers "how does this go?" with a clip and nothing else — the
 * drawings were deleted for good reasons. A published exercise without one is
 * a card that opens onto a search box, which looks answered and is not.
 */
test("no video, no publish", () => {
  assert.equal(canPublish({ ...READY, youtubeId: null }, "Copenhagen plank ISO hold"), false);
});

test("a one-cue exercise is not a coached exercise", () => {
  assert.equal(canPublish({ ...READY, cues: ["Squeeze"] }, "Copenhagen plank ISO hold"), false);
});

test("a how-to that is really just the why is refused", () => {
  assert.equal(canPublish({ ...READY, description: "It works your groin." }, "Copenhagen plank ISO hold"), false);
});

test("publishRow carries the reviewer and the moment", () => {
  const row = publishRow(READY, "admin-uuid");
  assert.equal(row.published, true);
  assert.equal(row.published_by, "admin-uuid");
  assert.ok(!Number.isNaN(Date.parse(row.published_at)));
  assert.equal(row.youtube_id, "dQw4w9WgXcQ");
  assert.equal(row.tempo, null, "an empty tempo is absent, not an empty string");
});

// --- duplicates ---------------------------------------------------------------

/**
 * Two "Bulgarian split squat" cards, one of them thinner than the other, is a
 * library that looks broken — and an admin reading a queue of things athletes
 * typed has no reason to remember all 500-odd compiled entries.
 */
test("a name the catalogue already has cannot be published again", async () => {
  const { nameTaken } = await import("./exercise-review");
  const { EXERCISES } = await import("./exercises");
  const existing = EXERCISES[0].name;

  assert.equal(nameTaken(existing), true);
  assert.equal(nameTaken(existing.toUpperCase()), true, "case is not a second exercise");
  assert.equal(nameTaken(` ${existing.replace(/ /g, "-")} `), true, "nor is punctuation");
  assert.equal(nameTaken("Copenhagen plank ISO hold nobody has added"), false);
  assert.equal(nameTaken(""), false);

  assert.ok(publishBlockers(READY, existing).some((b) => /already has/i.test(b)));
});
