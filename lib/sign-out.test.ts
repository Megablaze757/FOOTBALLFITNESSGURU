import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOBODY SIGNS OUT WITHOUT THE DEVICE FORGETTING THEM.
 *
 * lib/use-async.ts caches what every screen loaded — in memory and in
 * sessionStorage, for ten minutes — and says why that needs care: "this is a
 * copy of someone's training data, and it should not outlive the browsing
 * session on a shared device."
 *
 * sessionStorage does not end at sign-out. It ends when the tab does. So the
 * rule only holds if signing out clears the cache, and four components signed
 * somebody out doing four different amounts of it:
 *
 *   SuspendedGate      drafts + everything          correct
 *   ProfileForm        drafts + two prefixes        partial
 *   HealthConsentGate  nothing
 *   DeleteAccount      nothing
 *
 * The two that cleared nothing are the two where it matters most.
 * DeleteAccount signs out because the account has just been DELETED — the rows
 * are gone and a copy stayed on the device. HealthConsentGate signs out
 * somebody who has just DECLINED to have their health data held, which makes
 * a cached copy of exactly that data the most direct contradiction available.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Every .tsx under components/ and app/, recursively. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const files = [...sources("components"), ...sources("app")];

test("nothing calls auth.signOut() except the one place that forgets first", () => {
  const direct: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // The helper itself is allowed to, and is not in these directories anyway.
    for (const m of src.matchAll(/auth\s*\.\s*signOut\s*\(/g)) {
      const line = src.slice(0, m.index).split("\n").length;
      direct.push(`${file}:${line}`);
    }
  }
  assert.deepEqual(direct, [],
    "A component signs out on its own. Every one that did left some or all of\n"
    + "  the athlete's cached data in sessionStorage, readable in that tab until\n"
    + `  it is closed. Use signOutAndForget from lib/sign-out.ts:\n  ${direct.join("\n  ")}`);
});

/**
 * A guard that finds no sign-out at all would pass forever. These four paths
 * are the reason this file exists, so they are named.
 */
test("the four paths that sign somebody out all go through it", () => {
  const expected = [
    "components/DeleteAccount.tsx",
    "components/HealthConsentGate.tsx",
    "components/ProfileForm.tsx",
    "components/SuspendedGate.tsx",
  ];
  for (const file of expected) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /signOutAndForget\(/,
      `${file} no longer signs out through the shared path`);
    assert.match(src, /from "@\/lib\/sign-out"/, `${file} does not import it`);
  }
});

/**
 * The helper has to clear BOTH stores. Drafts are in localStorage and outlive
 * the tab entirely; the page cache is in sessionStorage and does not. Clearing
 * one and not the other is what ProfileForm was doing in miniature.
 */
test("forgetting covers both stores, and the cache without a prefix", () => {
  const src = readFileSync("lib/sign-out.ts", "utf8");
  assert.match(src, /clearAllDrafts\(/, "drafts in localStorage are not cleared");
  assert.match(src, /invalidate\(\)/, "the page cache is not cleared");
  assert.doesNotMatch(src, /invalidate\("[^"]+"\)/,
    "the cache is cleared by prefix, which is the partial clear this replaced");
});

/**
 * ORDER. The local copies go first, before the session is torn down: a
 * sign-out can navigate, fail or race a reload, and the worst case should be
 * an athlete still signed in with a cold cache rather than signed out with a
 * warm one.
 */
test("the device forgets before the session ends, not after", () => {
  const src = readFileSync("lib/sign-out.ts", "utf8");
  const body = src.slice(src.indexOf("export async function signOutAndForget"));
  const forget = body.indexOf("forgetLocalCopies(");
  const out = body.indexOf("signOut()");
  assert.ok(forget >= 0 && out >= 0, "signOutAndForget no longer looks like this");
  assert.ok(forget < out,
    "the session is ended before the cached copies are cleared — if the tear-down "
    + "navigates or throws, the data stays");
});
