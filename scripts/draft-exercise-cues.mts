#!/usr/bin/env node
// =============================================================================
// Draft the coaching cues the bulk import never had.
//
// WHY THIS EXISTS. 197 of the imported gym movements ship with a real how-to
// description and `why: "Builds the legs.", cues: []`. The description already
// teaches the movement; the two fields an athlete reads FIRST are a stub and an
// empty array. That is a real gap in the data, and it is the one place in this
// app where a model is the right tool — unlike the collection pages, where the
// answer was already computable.
//
// WHAT IT WILL NOT DO. It will not publish anything. The catalogue is a
// compiled TypeScript file, so the only way a draft reaches an athlete is a
// human reading a diff and committing it. Every draft is checked by
// lib/exercise-draft.ts first — against the row's own description, so a cue
// about a bar on a leg press is held back before a person ever sees it.
//
//   OPENROUTER_API_KEY=... node --import tsx scripts/draft-exercise-cues.mts --limit 5
//   OPENROUTER_API_KEY=... node --import tsx scripts/draft-exercise-cues.mts
//   node --import tsx scripts/draft-exercise-cues.mts --dry-run
//
// --limit defaults to 5. Drafting all 197 costs real money and takes real
// minutes, and the first thing anybody should do is read five and decide
// whether the prompt is right. A default of "all" is how you find out the
// prompt was wrong two hundred requests late.
//
// Output: scripts/out/exercise-cues.json (every draft, clean and held, with
// reasons) and scripts/out/exercise-cues.ts (the clean ones as COACHING lines,
// ready to paste into lib/exercise-catalog.ts and read as a diff).
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { EXERCISES, isRunEntry } from "../lib/exercises";
import {
  draftPrompt,
  draftProblems,
  draftTargets,
  parseDraft,
  partition,
  type Draft,
  type DraftTarget,
  type Reviewed,
} from "../lib/exercise-draft";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const value = (flag: string, fallback: number) => {
  const i = args.indexOf(flag);
  if (i < 0 || !args[i + 1]) return fallback;
  const n = Number(args[i + 1]);
  // `--limit banana` would otherwise be NaN, and slice(0, NaN) is silently
  // empty — a run that looks like it worked and drafted nothing.
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${flag} needs a whole number of exercises, got "${args[i + 1]}"`);
    process.exit(1);
  }
  return n;
};

const DRY_RUN = has("--dry-run");
const LIMIT = has("--all") ? Infinity : value("--limit", 5);
const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
const OUT = new URL("./out/", import.meta.url);

const targets = draftTargets(EXERCISES.filter((e) => !isRunEntry(e)));
console.log(`${targets.length} exercises have a description but no coaching cues.`);

if (DRY_RUN) {
  const { system, user } = draftPrompt(targets[0]);
  console.log(`\nModel: ${MODEL}\nDrafting ${Math.min(LIMIT, targets.length)} of ${targets.length}.`);
  console.log(`\n─── system ───\n${system}\n\n─── user (${targets[0].name}) ───\n${user}`);
  console.log("\nNo request was made. Drop --dry-run and set OPENROUTER_API_KEY to draft.");
  process.exit(0);
}

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error("OPENROUTER_API_KEY is not set. Use --dry-run to see the prompt without it.");
  process.exit(1);
}

async function draftOne(target: DraftTarget): Promise<Draft | null> {
  const { system, user } = draftPrompt(target);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pocketathlete.com",
      "X-Title": "PocketAthlete exercise cues",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`  ${target.name}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    return null;
  }
  const body = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    console.error(`  ${target.name}: empty reply`);
    return null;
  }
  return parseDraft(target.id, text);
}

const reviewed: Reviewed[] = [];
const unparsed: string[] = [];

for (const target of targets.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
  const draft = await draftOne(target);
  if (!draft) {
    unparsed.push(target.name);
    continue;
  }
  const problems = draftProblems(draft, target);
  reviewed.push({ target, draft, problems });
  console.log(`${problems.length === 0 ? "  ok  " : " HELD "} ${target.name}`);
  for (const p of problems) console.log(`        ${p}`);
}

const { clean, held } = partition(reviewed);

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("exercise-cues.json", OUT),
  JSON.stringify({ model: MODEL, generated: new Date().toISOString(), clean, held, unparsed }, null, 2));

// The clean drafts as COACHING lines. Keyed on the lowercased NAME, which is
// what lib/exercise-catalog.ts looks them up by — not the id.
const lines = clean.map(({ target, draft }) =>
  `  ${JSON.stringify(target.name.toLowerCase())}: `
  + `{ cues: ${JSON.stringify(draft.cues)}, why: ${JSON.stringify(draft.why)} },`);

writeFileSync(new URL("exercise-cues.ts", OUT),
  "// Drafted by scripts/draft-exercise-cues.mts and checked by lib/exercise-draft.ts.\n"
  + "// NOT reviewed by a person yet. Read every line against the exercise's own\n"
  + "// description before pasting these into the COACHING record in\n"
  + "// lib/exercise-catalog.ts — the checks catch a cue about the wrong equipment,\n"
  + "// they do not catch a cue that is merely poor coaching.\n"
  + lines.join("\n") + "\n");

console.log(`\n${clean.length} clean, ${held.length} held, ${unparsed.length} no usable reply.`);
console.log(`Wrote scripts/out/exercise-cues.json and scripts/out/exercise-cues.ts`);
console.log(`${targets.length - reviewed.length - unparsed.length} exercises not attempted (--all does the rest).`);
