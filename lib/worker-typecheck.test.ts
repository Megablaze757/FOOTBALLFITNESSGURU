import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WORKER IS NOT COVERED BY THE ROOT TYPECHECK, AND THAT HID A REAL BUG.
 *
 * cloudflare/ has its own tsconfig, its own dependencies and its own
 * `@cloudflare/workers-types`. The root tsconfig does not include it. So
 * `npx tsc --noEmit` at the root — the command run before every commit in this
 * project — has never once looked at the Worker.
 *
 * What that hid: draftExercise called the model with a system prompt and no
 * `user` message at all. The submission the admin typed was never sent, so the
 * drafting answered from the system prompt alone and produced plausible
 * nonsense about nothing in particular. It is a type error, it had been one for
 * a while, and the only thing that ever reported it was the Deploy API Worker
 * job — whose red X had become part of the scenery.
 *
 * esbuild does not typecheck, so the bundle built and shipped regardless.
 *
 * The root `npm run typecheck` now runs both. This makes that arrangement a
 * fact somebody has to break on purpose.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const pkg = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { scripts?: Record<string, string> };

test("the root typecheck covers the Worker as well as the app", () => {
  const root = pkg("../package.json").scripts ?? {};
  assert.ok(root.typecheck, "there is no typecheck script");
  assert.match(root.typecheck, /cloudflare/,
    "the root typecheck does not reach cloudflare/, so the Worker is unchecked before every commit");

  const worker = pkg("../cloudflare/package.json").scripts ?? {};
  assert.ok(worker.typecheck, "cloudflare/ has no typecheck script for the root one to call");
  assert.match(worker.typecheck, /tsc\s+--noEmit/);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CHECK WHOSE DEPENDENCIES ARE NOT INSTALLED IS NOT A CHECK.
 *
 * Widening the root typecheck to cover the Worker (above) had a cost nobody
 * paid until CI did: `npm --prefix cloudflare run typecheck` needs
 * cloudflare/node_modules, and the workflow's `npm ci` installs only the root.
 * So every push failed with TS2688 — "cannot find type definition file for
 * @cloudflare/workers-types" — while the identical command passed on every
 * machine that had ever run it, because a local checkout has that directory.
 *
 * Three commits' worth of deploys were blocked before anybody looked. The job
 * that goes red is called `test`; the thing that stops is the SITE, because
 * deploy.yml gates on it. That distance between the symptom and the
 * consequence is why this is worth a test rather than a memory.
 *
 * Derived from the script rather than hardcoded: point the root typecheck at
 * another workspace tomorrow and this asks for its install too.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("CI installs the dependencies of every workspace the typecheck reaches", () => {
  const script = pkg("../package.json").scripts?.typecheck ?? "";
  const workspaces = [...script.matchAll(/--prefix[= ]+([\w./-]+)/g)].map((m) => m[1]);
  assert.ok(
    workspaces.length > 0,
    "the root typecheck no longer reaches another workspace — has it stopped covering the Worker?",
  );

  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
    // Comments in this file describe the very bug being guarded, by name.
    .replace(/^\s*#.*$/gm, "");

  /**
   * SPLIT INTO STEPS FIRST, and this is not tidiness.
   *
   * The version of this that searched the whole file passed while the install
   * sat AFTER the typecheck: a pattern allowed to span two hundred characters
   * matched the root `run: npm ci` in one step and the `working-directory:` of
   * a completely different step below it. The order it then reported was of
   * two halves that never appear in the same step.
   */
  const steps = ci.split(/\n {6}- /).slice(1);
  const runsTypecheck = steps.findIndex((step) => /npm run typecheck/.test(step));
  assert.ok(runsTypecheck >= 0, "CI does not run the typecheck at all");

  for (const dir of workspaces) {
    const scoped = new RegExp(`(working-directory:\\s*\\.?/?${dir}/?\\s)|(--prefix[= ]+\\.?/?${dir}/?)`);
    const installs = steps
      .map((step, i) => (/npm ci/.test(step) && scoped.test(step) ? i : -1))
      .filter((i) => i >= 0);

    assert.ok(
      installs.length > 0,
      `CI runs a typecheck that needs ${dir}/node_modules and never installs it — `
      + "the run fails with TS2688 and takes the deploy with it",
    );
    assert.ok(
      Math.min(...installs) < runsTypecheck,
      `CI installs ${dir}'s dependencies AFTER running the typecheck that needs them`,
    );
  }
});

/**
 * And the reason it matters, pinned: every AI call has to carry the thing it is
 * being asked about. A `system` with no `user` is a model answering from the
 * instructions alone — which looks like a working feature returning bad output,
 * not like a bug.
 */
test("no AI call is made without the submission it is about", () => {
  const src = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");

  const calls = [...src.matchAll(/(?:meteredComplete|complete)\(env,[^{]*\{([\s\S]*?)\n  \}\)/g)];
  assert.ok(calls.length >= 4, `found ${calls.length} AI calls — the pattern has stopped matching`);

  let checked = 0;
  for (const [, body] of calls) {
    const head = body.slice(0, 2000);
    // meteredComplete's own pass-through to complete() spreads the caller's
    // options, so it legitimately names neither. Skipping it is not a loophole
    // — the call that BUILT those options is checked below like the rest.
    if (/\.\.\.opts/.test(head)) continue;
    checked++;
    assert.ok(/\buser\b\s*[:,]/.test(head),
      `an AI call passes no user message:\n${head.slice(0, 200)}`);
    assert.ok(/maxTokens\s*:/.test(head),
      `an AI call sets no token ceiling:\n${head.slice(0, 200)}`);
  }
  assert.ok(checked >= 4, `only ${checked} real AI calls were checked — the skip is swallowing them`);
});
