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
