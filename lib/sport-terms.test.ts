import { test } from "node:test";
import assert from "node:assert/strict";
import { sportTerms } from "./sport-terms";
import { SPORTS } from "./exercises";

test("a basketball player is asked about a game, not a match", () => {
  assert.equal(sportTerms("basketball").eventToday, "Game today?");
  assert.match(sportTerms("basketball").minutes, /court/i);
});

test("a runner races", () => {
  assert.equal(sportTerms("running").event, "race");
  assert.equal(sportTerms("running").eventDay, "Race day");
});

test("lifters and gym-goers get sessions, not matches", () => {
  for (const s of ["weightlifting", "gym"] as const) {
    assert.equal(sportTerms(s).event, "session");
    assert.doesNotMatch(sportTerms(s).eventToday, /match|game|race/i);
  }
});

test("football and rugby keep the original wording", () => {
  assert.equal(sportTerms("football").eventToday, "Match today?");
  assert.equal(sportTerms("rugby").eventToday, "Match today?");
});

test("every sport in the picker has terms, and none says 'match' wrongly", () => {
  for (const s of SPORTS) {
    const t = sportTerms(s.id);
    for (const v of Object.values(t)) assert.ok(v.length > 0, `${s.id} has an empty term`);
    // Only the two sports that actually play matches may use the word.
    if (s.id !== "football" && s.id !== "rugby") {
      assert.doesNotMatch(t.eventToday, /match/i, `${s.id} still says "match"`);
    }
  }
});

test("unknown or missing sports fall back rather than breaking", () => {
  assert.equal(sportTerms(null).eventToday, "Match today?");
  assert.equal(sportTerms(undefined).eventToday, "Match today?");
  assert.equal(sportTerms("underwater basket weaving").eventToday, "Match today?");
});

test("every sport fills in every term — no blanks and no football leftovers", () => {
  for (const sport of ["football", "rugby", "basketball", "running", "weightlifting", "gym"] as const) {
    const t = sportTerms(sport);
    for (const [k, v] of Object.entries(t)) {
      assert.ok(typeof v === "string" && v.trim().length > 0, `${sport}.${k} is empty`);
    }
    // A runner should never see football vocabulary anywhere in their copy.
    if (sport === "running" || sport === "weightlifting" || sport === "gym") {
      const all = Object.values(t).join(" ").toLowerCase();
      assert.ok(!all.includes("match"), `${sport} still says "match"`);
      assert.ok(!all.includes("pitch"), `${sport} still says "pitch"`);
    }
  }
});

test("basketball says game, not match", () => {
  const t = sportTerms("basketball");
  assert.equal(t.eventLabel, "Game");
  assert.equal(t.eventDay, "Gameday");
  assert.equal(t.venue, "on court");
  assert.ok(!t.eventToday.toLowerCase().includes("match"));
});

test("season phrasing differs by sport", () => {
  // "Off-season" means nothing to someone who just goes to the gym.
  const seasons = new Set(
    (["football", "running", "weightlifting", "gym"] as const).map((s) => sportTerms(s).inSeason)
  );
  assert.ok(seasons.size >= 3, "in-season phrasing barely varies between sports");
});

test("gamedayLabel and sportTerms agree", async () => {
  // They used to be two separate lists, which is how one ends up saying
  // "Matchday" to a marathon runner.
  const { gamedayLabel } = await import("./essentials");
  for (const s of ["football", "basketball", "running", "gym", "weightlifting", "rugby"] as const) {
    assert.equal(gamedayLabel(s), sportTerms(s).eventDay, `${s} disagrees`);
  }
});
