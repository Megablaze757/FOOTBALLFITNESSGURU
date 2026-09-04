import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY THING HERE THAT CAN COST A REAL PERSON MONEY.
 *
 * An affiliate's commission is decided by one string in localStorage at the
 * moment somebody signs up. Everything in this file writes that string, so a
 * write that happens when it should not is not a UI bug — it is a payout that
 * goes to the wrong person, silently, with nothing in any log to say so.
 *
 * /a/<username> made this real: the athlete page credits its own athlete, and
 * a visitor may well open one AFTER clicking a paid affiliate's link and BEFORE
 * signing up. Last-touch there would take the affiliate's money.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// A localStorage and a location, because this module is entirely about the
// browser and mocking the module instead would only test the mock.
const store = new Map<string, string>();
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };

beforeEach(() => {
  store.clear();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = { location: { search: "" }, localStorage: g.localStorage };
});

function at(search: string) {
  (g.window as { location: { search: string } }).location.search = search;
}

async function referral() {
  // Imported after the globals exist: the module reads `typeof window` per
  // call, but importing first would still be reaching for it before it is set.
  return import("./referral");
}

test("an explicit ?ref= is remembered, and the newest one wins", async () => {
  const { captureRef, getRef } = await referral();
  at("?ref=AFF123");
  captureRef();
  assert.equal(getRef(), "AFF123");
  at("?ref=OTHER");
  captureRef();
  assert.equal(getRef(), "OTHER", "captureRef is last-touch, and stays that way");
});

test("an athlete page never overwrites a code somebody already clicked", async () => {
  const { captureRef, setRefIfUnset, getRef } = await referral();
  at("?ref=AFF123");
  captureRef();
  // Visitor now browses to /a/sam before signing up.
  setRefIfUnset("sam");
  assert.equal(
    getRef(), "AFF123",
    "a page view must not replace a paid affiliate's code with a username that pays nobody",
  );
});

test("an athlete page does credit the athlete when nothing else has", async () => {
  const { setRefIfUnset, getRef } = await referral();
  setRefIfUnset("sam");
  assert.equal(getRef(), "sam");
  // And a second profile does not steal it from the first.
  setRefIfUnset("alex");
  assert.equal(getRef(), "sam");
});

test("an explicit ?ref= on an athlete page still wins", async () => {
  const { captureRef, setRefIfUnset, getRef } = await referral();
  // The order CaptureAthleteRef uses: capture first, then fill the gap.
  at("?ref=AFF123");
  captureRef();
  setRefIfUnset("sam");
  assert.equal(getRef(), "AFF123");
});

test("nothing writes an empty or absurd code", async () => {
  const { setRefIfUnset, getRef, clearRef } = await referral();
  setRefIfUnset("   ");
  assert.equal(getRef(), null, "whitespace is not a referral");
  setRefIfUnset("x".repeat(200));
  assert.equal(getRef()!.length, 40, "capped, same as captureRef");
  clearRef();
  assert.equal(getRef(), null);
});

/** The old key still holds real pending attributions — see the note on REF_KEY. */
test("a code stored under the legacy key is not overwritten either", async () => {
  const { setRefIfUnset, getRef } = await referral();
  store.set("apex_ref", "AFF123");
  setRefIfUnset("sam");
  assert.equal(getRef(), "AFF123");
});
