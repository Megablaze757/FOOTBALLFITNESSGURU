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
    creator: "", via: "", bpm: 130, bassShare: 0.5, seconds: 2,
  }];
  const found = trackProblems(bad);
  assert.ok(found.some((p) => p.includes("not fetched over https")));
  assert.ok(found.some((p) => p.includes("nobody is recorded")));
  assert.ok(found.some((p) => p.includes("where the licence claim came from")));
  assert.ok(found.some((p) => p.includes("loops audibly")));
});

test("an empty manifest says so rather than looking fine", () => {
  assert.ok(trackProblems([]).some((p) => p.includes("no track has passed")));
});

test("lookup finds a track and does not invent one", () => {
  assert.ok(trackById(STOCK_TRACKS[0].id));
  assert.equal(trackById("nope"), undefined);
});
