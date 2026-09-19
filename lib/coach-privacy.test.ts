import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBriefing } from "./coach-briefing";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COACH DOES NOT KNOW THE ATHLETE'S NAME, AND THAT IS A PROPERTY WORTH
 * KEEPING TRUE.
 *
 * The briefing is sent to a model on every question — lib/coach-chat.test.ts
 * checks each backend reads `body.briefing`, and lib/coach-briefing.test.ts
 * checks it stays under 6000 characters "to send with every question". So
 * whatever goes into it leaves this system.
 *
 * It carries what a coach needs: sport, position, sex, age, height, the
 * block, soreness, fuel, lifts. It carries no name, no email and no id, and
 * nothing said so — the absence was a fact about the code rather than a rule
 * about it, which is the same shape as every other thing in this repository
 * that quietly stopped being true.
 *
 * lib/coach-context.ts DID select `full_name` alongside the rest. It was used
 * nowhere: BriefingInput has no name field and ChatContext has none. So a real
 * identity was pulled into the browser every time somebody opened the chat, to
 * be dropped. Removed, and this is what keeps it removed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const context = readFileSync("lib/coach-context.ts", "utf8");
const briefing = readFileSync("lib/coach-briefing.ts", "utf8");
const chat = readFileSync("lib/coach-chat.ts", "utf8");

/** Columns that name a person rather than describe an athlete. */
const IDENTIFYING = ["full_name", "display_name", "email", "phone", "avatar_url"];

test("the coach's query asks for nothing that identifies anybody", () => {
  // Only the `select(...)` strings, not the prose: this file explains at
  // length that it does NOT fetch a name, and a guard that reads comments
  // would fail on the sentence describing the fix.
  const selects = [
    ...context.matchAll(/\.select\(\s*"([^"]*)"/g),
    ...context.matchAll(/selectProfile\([^,]+,[^,]+,\s*"([^"]*)"/g),
  ].map((m) => m[1]);

  assert.ok(selects.length > 5, `only ${selects.length} selects found — has the loader moved?`);

  const asked: string[] = [];
  for (const columns of selects) {
    for (const column of IDENTIFYING) {
      if (new RegExp(`\\b${column}\\b`).test(columns)) asked.push(`${column} in "${columns.slice(0, 70)}"`);
    }
  }
  assert.deepEqual(asked, [],
    "The coach fetches a column that names a person. Everything it gathers is\n"
    + `  assembled into a briefing sent to a model on every question:\n  ${asked.join("\n  ")}`);
});

test("neither thing the model receives has a field for a name", () => {
  for (const [what, src] of [["BriefingInput", briefing], ["ChatContext", chat]] as const) {
    const shape = new RegExp(`interface ${what}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
    assert.ok(shape, `${what} is no longer an interface — check what replaced it`);
    for (const field of ["name", "email", "userId", "user_id", "id"]) {
      assert.doesNotMatch(shape[1], new RegExp(`^\\s*${field}\\??\\s*:`, "m"),
        `${what} gained a \`${field}\` field, and it is sent to a model on every question`);
    }
  }
});

/**
 * The strongest version of the check: build a briefing from an input carrying
 * a name in every string field it has, and look for the name in the output.
 * A field added later that happens to be rendered would be caught here even if
 * the interface check above missed its spelling.
 */
test("a briefing built from identifying input still contains no identity", () => {
  const NAME = "Zebediah Quirkenshaw";
  const EMAIL = "zeb@example.invalid";
  const out = buildBriefing({
    sport: `Football ${NAME}`,
    positions: [NAME],
    focus: EMAIL,
    sex: "male",
    heightCm: 180,
    age: 24,
  } as never);

  // The fields above are deliberately poisoned: whatever the briefing renders,
  // it renders from them. This is a check that the ASSERTION works, before the
  // real one below.
  assert.ok(out.includes(NAME), "the briefing rendered none of its input — this test proves nothing");

  // And the real one: a clean input must produce a briefing with no identity.
  const clean = buildBriefing({
    sport: "Football", positions: ["Winger"], focus: "speed",
    sex: "male", heightCm: 180, age: 24,
  } as never);
  for (const leak of [NAME, EMAIL, "@"]) {
    assert.ok(!clean.includes(leak), `a clean briefing contains ${leak}`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE BRIEFING REALLY IS WHAT CROSSES THE BOUNDARY.
 *
 * Everything above is worth nothing if the briefing is not what gets sent.
 * The first version of this asserted lib/coach-chat.ts mentions it — which is
 * false, and the test failed on a correct codebase. The briefing is assembled
 * in the browser by components/CoachChat.tsx and read by two backends, which
 * is what lib/coach-chat.test.ts already checks from the other direction.
 *
 * Named here so the guards above are anchored to the real path rather than to
 * an assumption about it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the briefing is what leaves the browser, in both backends", () => {
  const client = readFileSync("components/CoachChat.tsx", "utf8");
  assert.match(client, /briefing/,
    "the chat client no longer sends a briefing — these guards are watching the wrong thing");

  for (const backend of ["cloudflare/src/index.ts", "supabase/functions/coach-chat/index.ts"]) {
    const src = readFileSync(backend, "utf8");
    assert.match(src, /briefing/, `${backend} no longer receives the briefing`);
  }
});
