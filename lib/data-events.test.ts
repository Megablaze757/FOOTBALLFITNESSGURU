import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pagesAffectedBy, type DataChange } from "./data-events";

/**
 * "STATS AREN'T CHANGING WHEN DATA IS ADJUSTED. STATS AREN'T SAVING."
 *
 * They were saving. Two separate things stopped the numbers moving:
 *
 *   1. `invalidate` cleared the cache and stopped there. A screen already on
 *      the page never learned anything had changed, so it went on painting the
 *      figures it loaded on mount until something remounted it. Clearing a
 *      cache is not a refresh.
 *
 *   2. Every write picked its own cache prefixes by hand — `invalidate()`,
 *      `invalidate("profile:")`, `invalidate("nutrition:")` — and eighteen
 *      writes called nothing at all. Nobody can hold in their head which of
 *      eleven cache keys a weigh-in touches.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return walk(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });
}

const CHANGES: DataChange[] = [
  "training", "nutrition", "weight", "program", "goals", "benchmarks", "injury", "profile",
];

test("a change tells the screens, not just the cache", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. Every mutation in the app called
  // invalidate correctly and the numbers still did not move, because nothing
  // downstream was listening.
  const hook = source("./use-async.ts");
  assert.match(hook, /const readers = new Set<Revalidator>\(\)/, "there is no subscriber list");
  assert.match(hook, /for \(const reader of readers\)/, "invalidate does not notify anybody");
  assert.match(hook, /readers\.add\(onInvalidate\)/, "the hook does not subscribe");
  assert.match(hook, /readers\.delete\(onInvalidate\)/, "the hook never unsubscribes — that is a leak per mount");
});

test("recalculating does not blank the page", () => {
  // Answering "the numbers must refresh" by throwing the screen away would
  // reintroduce the skeleton flash this codebase already fixed once — see the
  // note on mutate(). `revalidating` is deliberately not `loading`.
  const hook = source("./use-async.ts");
  assert.match(hook, /const \[revalidating, setRevalidating\] = useState\(false\)/);
  assert.match(hook, /revalidating,/, "the flag is not returned to callers");
  for (const page of ["../app/(app)/dashboard/page.tsx", "../app/(app)/home/page.tsx"]) {
    const src = source(page);
    assert.match(src, /revalidating/, `${page} does not say when it is recalculating`);
    assert.match(src, /role="status"/, `${page} announces nothing to a screen reader`);
  }
});

test("every kind of change names the pages it breaks", () => {
  for (const change of CHANGES) {
    const pages = pagesAffectedBy(change);
    assert.ok(pages.length > 0, `${change} claims to affect nothing`);
    for (const prefix of pages) {
      assert.match(prefix, /^[a-z]+:$/, `${change} lists "${prefix}", which is not a cache-key prefix`);
    }
  }
  // The spec's five triggers, each landing somewhere that shows a stat.
  for (const change of ["training", "nutrition", "weight", "program", "goals"] as DataChange[]) {
    assert.ok(pagesAffectedBy(change).includes("home:"), `${change} does not refresh Home`);
    assert.ok(pagesAffectedBy(change).includes("dashboard:"), `${change} does not refresh Progress`);
  }
});

test("bodyweight reaches every screen that divides by it", () => {
  // Strength ranks are multiples of bodyweight and calorie targets are built
  // from it, so a weigh-in is the change with the least obvious reach — which
  // is exactly why hand-picking prefixes failed here first.
  const pages = pagesAffectedBy("weight");
  for (const page of ["home:", "dashboard:", "nutrition:", "coach:", "body:"]) {
    assert.ok(pages.includes(page), `a weigh-in does not refresh ${page}`);
  }
});

test("no screen invalidates by hand any more", () => {
  // A raw invalidate() is not wrong, it is unmaintainable: it asks each call
  // site to know which pages read what. The map is in one file so that adding a
  // page is one edit rather than a hunt through every write in the app.
  const offenders: string[] = [];
  for (const file of walk("components").concat(walk("app"))) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/(?<!record)\binvalidate\s*\(/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "these still clear the cache by hand instead of naming the change");
});

test("the writes that move a stat all report it", () => {
  // Eighteen of forty-four writes refreshed nothing. These are the ones behind
  // the complaint: the session, the food, the weigh-in, the block and the
  // benchmarks.
  const expected: [string, string][] = [
    ["components/JournalForm.tsx", "training"],
    ["app/(app)/body/page.tsx", "weight"],
    ["app/(app)/nutrition/page.tsx", "nutrition"],
    ["app/(app)/coach/page.tsx", "program"],
    ["components/AssignProgram.tsx", "program"],
    ["components/BenchmarkForm.tsx", "benchmarks"],
    ["components/InjuryPlanner.tsx", "injury"],
    ["app/(app)/onboarding/page.tsx", "goals"],
    ["components/ProfileForm.tsx", "profile"],
    ["components/PWA.tsx", "everything"],
  ];
  for (const [file, change] of expected) {
    const src = readFileSync(file, "utf8");
    assert.match(src, new RegExp(`recordChanged\\([^)]*"${change}"`),
      `${file} does not report "${change}" after writing`);
  }
});
