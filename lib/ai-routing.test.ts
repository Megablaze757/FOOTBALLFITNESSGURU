import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");

/**
 * The body of ONE Worker function, comments stripped.
 *
 * Brace-matched rather than sliced to the next `async function`. Slicing
 * swallowed whatever sat between two functions — a `const` declared between
 * injuryPlan and the next one read as part of injuryPlan, so this reported a
 * paying athlete's endpoint as capped to the free rungs when it is not.
 */
function fn(name: string): string {
  const start = worker.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} has moved — this guard is reading nothing`);
  const open = worker.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < worker.length; i++) {
    if (worker[i] === "{") depth++;
    else if (worker[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  return worker.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BACK-OFFICE AI NEVER SPENDS, AND IT WAS SPENDING ON EVERY CALL.
 *
 * The ladder in complete() runs Groq, then OpenRouter's free rungs, then
 * OpenRouter PAID, and only then NVIDIA — right for an athlete waiting on a
 * program, and exactly backwards for a batch nobody is watching: it reaches
 * for the paid model before it has tried a provider that bills nothing.
 *
 * And meteredComplete derives `priority` from the CALLER'S TIER, which skips
 * the free rungs outright. The admin account is a paying one, so the social
 * writer and the exercise drafter went straight to the paid model — the one
 * user guaranteed not to need the fast path was the only one who could not get
 * the cheap one.
 *
 * The second cost is subtler and larger. Groq's and NVIDIA's free tiers are
 * finite, shared, rate-limited pots. A drafting run of two hundred requests
 * burning Groq's quota pushes the athletes' requests onto the paid rung for
 * the rest of the window.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const BACK_OFFICE = ["generateContent", "draftExercise"];

test("no admin-only AI endpoint can reach a paid model", () => {
  for (const name of BACK_OFFICE) {
    const body = fn(name);
    assert.match(body, /isAdmin\(env, u\.id\)/, `${name} is not actually admin-only`);
    assert.match(body, /\.\.\.BACK_OFFICE_AI/, `${name} does not take the back-office ladder — it can bill`);
  }
  assert.match(worker, /const BACK_OFFICE_AI = \{ freeOnly: true \} as const;/,
    "the back-office rule no longer restricts the ladder to zero-cost rungs");
});

/**
 * A REQUEST MUST NOT BE ABLE TO ASK TO SPEND.
 *
 * draftExercise read `freeOnly` out of the request body, defaulting to false.
 * The bulk queue set it; the one-off draft form did not, so single drafts were
 * billed and nothing on the screen said so. A cost rule that a caller can turn
 * off is a cost rule that is off.
 */
test("the spend decision is not taken from the request body", () => {
  for (const name of BACK_OFFICE) {
    const body = fn(name);
    assert.ok(!/freeOnly\??:\s*(boolean|freeOnly)/.test(body),
      `${name} still reads freeOnly from the caller`);
  }
});

/**
 * And the athlete-facing endpoints are NOT restricted, which matters just as
 * much: capping them to the free rungs would make a paid subscriber wait on
 * rate-limited shared capacity they are paying to avoid.
 */
test("the endpoints an athlete waits on keep the full ladder", () => {
  for (const name of ["coachChat", "generateProgram", "estimateFood", "injuryPlan", "generateChallenges"]) {
    assert.ok(!fn(name).includes("BACK_OFFICE_AI"),
      `${name} is capped to free rungs — a paying subscriber is being sent to the slow queue`);
  }
});

/** The ordering the whole rule exists because of. If a future edit puts NVIDIA
 *  ahead of the paid rung, none of the above is needed any more — and this test
 *  is where somebody would find that out. */
test("the default ladder still reaches a paid rung before the free NVIDIA one", () => {
  const complete = worker.slice(worker.indexOf("async function complete("), worker.indexOf("async function meteredComplete("));
  const paid = complete.indexOf("const viaPaid = await runQueued(paid)");
  const nvidia = complete.indexOf('runQueued(chain.filter((r) => r.provider === "nvidia"))');
  assert.ok(paid !== -1 && nvidia !== -1, "the ladder has been restructured — re-read this rule");
  assert.ok(paid < nvidia,
    "NVIDIA now comes before the paid rung: BACK_OFFICE_AI may be redundant, check before deleting it");
});
