import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseUsername, validateUsername, isReserved, suggestUsername, displayName,
  USERNAME_MIN, USERNAME_MAX,
} from "./username";

test("normalise lowercases and tidies separators", () => {
  assert.equal(normaliseUsername("  Sam Fletcher "), "sam_fletcher");
  assert.equal(normaliseUsername("sam.fletcher"), "sam_fletcher");
  assert.equal(normaliseUsername("sam-fletcher"), "sam_fletcher");
  assert.equal(normaliseUsername("SAM__FLETCHER"), "sam_fletcher");
  assert.equal(normaliseUsername("_sam_"), "sam");
});

test("normalise strips anything that isn't allowed", () => {
  assert.equal(normaliseUsername("sam@fletcher!"), "samfletcher");
  assert.equal(normaliseUsername("🏆winner"), "winner");
  assert.equal(normaliseUsername("!!!"), "");
});

test("valid handles are accepted", () => {
  for (const n of ["sam", "sam_f", "striker99", "a1b"]) {
    const r = validateUsername(n);
    assert.ok(r.ok, `${n} should be valid: ${r.error}`);
    assert.equal(r.value, n);
  }
});

test("length is enforced after normalising, not before", () => {
  // "a-b" normalises to "a_b" which is 3 characters, so it passes.
  assert.ok(validateUsername("a-b").ok);
  assert.ok(!validateUsername("ab").ok, `${USERNAME_MIN} is the minimum`);
  assert.ok(!validateUsername("x".repeat(USERNAME_MAX + 1)).ok);
  assert.ok(validateUsername("x".repeat(USERNAME_MAX)).ok);
});

test("empty and junk input give a usable message rather than a crash", () => {
  for (const bad of ["", "   ", "!!!", "___"]) {
    const r = validateUsername(bad);
    assert.ok(!r.ok);
    assert.ok(r.error && r.error.length > 5, `no message for "${bad}"`);
    assert.equal(r.value, "");
  }
});

test("purely numeric handles are refused", () => {
  // They read as a database id, and "12345" on a leaderboard looks like a bug.
  assert.ok(!validateUsername("12345").ok);
  assert.ok(validateUsername("1a345").ok);
});

test("reserved names are blocked, however they're typed", () => {
  for (const n of ["admin", "ADMIN", " Admin ", "pocket-athlete", "pocket.athlete"]) {
    assert.ok(!validateUsername(n).ok, `"${n}" should be reserved`);
  }
  assert.ok(isReserved("Support"));
  assert.ok(!isReserved("supporter"));
});

test("route names are reserved so a future /u/<name> can't collide", () => {
  for (const n of ["plans", "pricing", "drills", "guides", "settings"]) {
    assert.ok(isReserved(n), `"${n}" is a route and should be reserved`);
  }
});

test("'athlete' is reserved — it was the placeholder we're replacing", () => {
  assert.ok(isReserved("athlete"));
});

test("suggestions are valid usernames", () => {
  for (let i = 0; i < 200; i++) {
    const s = suggestUsername(`user-${i}`);
    const r = validateUsername(s);
    assert.ok(r.ok, `suggested "${s}" is not valid: ${r.error}`);
  }
});

test("suggestions are deterministic, and the salt breaks ties", () => {
  assert.equal(suggestUsername("abc"), suggestUsername("abc"));
  assert.notEqual(suggestUsername("abc"), suggestUsername("abc", 1));
});

test("suggestions never leak the seed", () => {
  // The seed is a user id or email; the handle goes on a public board.
  const seed = "demielegushi@gmail.com";
  const s = suggestUsername(seed);
  assert.ok(!s.includes("demi"), `suggestion "${s}" leaks the email`);
  assert.ok(!s.includes("@"));
});

test("suggestions spread across the word lists", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) seen.add(suggestUsername(`u${i}`));
  // Not a uniqueness guarantee — that's the database's job — but a generator
  // that returns the same handle for everyone would make the backfill collide
  // on every row.
  assert.ok(seen.size > 150, `only ${seen.size} distinct handles from 300 seeds`);
});

test("displayName prefers the username", () => {
  assert.equal(displayName("striker99", "Sam Fletcher"), "striker99");
  assert.equal(displayName(null, "Sam Fletcher"), "Sam", "first name only, never the surname");
  assert.equal(displayName("", "  "), "Athlete");
  assert.equal(displayName(null, null), "Athlete");
});
