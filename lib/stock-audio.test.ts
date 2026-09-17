import { test } from "node:test";
import assert from "node:assert/strict";
import { STOCK_TRACKS, trackById, trackProblems, type StockTrack } from "./stock-audio";
import { NICHE_BPM_MIN, NICHE_BPM_MAX, NICHE_MIN_BASS_SHARE } from "./reel-music";

test("the manifest is coherent", () => {
  assert.deepEqual(trackProblems(), []);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A TRACK IN THE MANIFEST HAS ALREADY PASSED THE CHECK.
 *
 * The manifest is what gets mixed without anybody listening first, so an entry
 * that would be refused by scripts/check-music.py must not be able to sit in
 * it — that would be two sources of truth disagreeing, with the quiet one
 * winning.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every track in the manifest fits the niche it was chosen for", () => {
  for (const t of STOCK_TRACKS) {
    assert.ok(t.bpm >= NICHE_BPM_MIN && t.bpm <= NICHE_BPM_MAX,
      `${t.id} is ${t.bpm}bpm, outside ${NICHE_BPM_MIN}-${NICHE_BPM_MAX}`);
    assert.ok(t.bassShare >= NICHE_MIN_BASS_SHARE,
      `${t.id} is ${Math.round(t.bassShare * 100)}% bass, under the profile`);
  }
});

test("every track records where it came from and what may be done with it", () => {
  for (const t of STOCK_TRACKS) {
    assert.equal(t.licence, "CC0", `${t.id} is not public domain`);
    assert.ok(t.creator.trim(), `${t.id} has no creator recorded`);
    assert.ok(t.via.trim(), `${t.id} has no record of where the licence claim came from`);
    assert.ok(t.url.startsWith("https://"), `${t.id} is fetched insecurely`);
  }
});

test("a track with no provenance is refused", () => {
  const bad: StockTrack[] = [{
    id: "x", title: "x", url: "http://example.com/a.mp3", licence: "CC0",
    creator: "", via: "", bpm: 130, bassShare: 0.5, seconds: 12,
  }];
  const found = trackProblems(bad);
  assert.ok(found.some((p) => p.includes("not fetched over https")));
  assert.ok(found.some((p) => p.includes("nobody is recorded")));
  assert.ok(found.some((p) => p.includes("where the licence claim came from")));
  assert.ok(found.some((p) => p.includes("loops audibly")),
    "a 12s track under a 30s reel repeats twice and was not caught");
});

test("an empty manifest says so rather than looking fine", () => {
  assert.ok(trackProblems([]).some((p) => p.includes("no track has passed")));
});

test("lookup finds a track and does not invent one", () => {
  assert.ok(trackById(STOCK_TRACKS[0].id));
  assert.equal(trackById("nope"), undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE WORKFLOW NOW NAMES A TRACK, AND A NAME IS A THING THAT CAN GO STALE.
//
// record-reels.yml defaults REEL_MUSIC to a track id rather than to "". That
// id is a string in YAML, matched against this manifest at record time by
// scripts/fetch-music.mts — so a track renamed or removed here turns every
// recording into a run that fails at the fetch, after the browser, the voice
// and the whole video are already made.
// ═══════════════════════════════════════════════════════════════════════════

test("the workflow's default bed is a track that exists", async () => {
  const { readFileSync } = await import("node:fs");
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");

  const dispatched = /REEL_MUSIC: \$\{\{[^}]*\|\|\s*'([^']*)'\s*\}\}/.exec(workflow);
  assert.ok(dispatched, "REEL_MUSIC is no longer resolved with a fallback");
  const fallback = dispatched![1];
  assert.notEqual(fallback, "",
    "the fallback is empty again, so every admin-dispatched reel records in silence");
  assert.ok(trackById(fallback), `the dispatch fallback "${fallback}" is not a track in this manifest`);

  const input = /music:\s*\n\s*description:[^\n]*\n\s*type: string\n\s*default: "([^"]*)"/.exec(workflow);
  assert.ok(input, "the music input no longer declares a default");
  assert.ok(trackById(input![1]), `the input default "${input![1]}" is not a track in this manifest`);

  /**
   * BOTH PATHS, and they are genuinely different: the workflow_dispatch input
   * default does nothing for a repository_dispatch, which is how the admin
   * panel starts a recording. Defaulting only the input is what left every
   * admin-triggered reel silent while the form in GitHub looked correct.
   */
  assert.equal(input![1], fallback,
    "the manual default and the dispatch fallback are different tracks");
});

test("there is a way to ask for no bed at all", async () => {
  const { readFileSync } = await import("node:fs");
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");
  // The `||` chain treats "" as unset and falls through to the default, so
  // without this there is no way to turn the bed off.
  assert.match(workflow, /REEL_MUSIC:-\}" = "none" \]; then REEL_MUSIC=""/,
    "the bed cannot be switched off — an empty string now means the default");
  assert.doesNotMatch(workflow, /trackById\("none"\)/);
});

