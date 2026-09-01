#!/usr/bin/env node
// =============================================================================
// Draft this week's email and social posts from numbers the app already knows.
//
// WHY A SCRIPT AND NOT A BUTTON. The drafting needs an OpenRouter key, and the
// only places this project holds one are the Cloudflare Worker and the Edge
// Functions. Adding a runtime endpoint for it would mean another worker deploy
// to paste, another secret to manage, and a way for generated marketing copy to
// reach a send path without passing through a diff. A script has none of that:
// the key stays on the machine that runs it, and the output is text you read.
//
// WHAT IT WILL NOT DO. It will not send, post or schedule anything. It writes a
// file. The existing send path — the admin Waitlist Announce screen, which is
// idempotent, resumable, has a dry run and filters unsubscribes — is still how
// mail leaves this system, and this changes none of it.
//
//   OPENROUTER_API_KEY=... npm run brief
//   npm run brief -- --dry-run          # see the prompt and the facts, spend nothing
//   npm run brief -- --athletes 14 --waitlist 62
//
// The two flags are numbers from the admin dashboard. They are optional, and
// anything you do not pass is simply left out of the brief rather than guessed
// at — a model given a blank for "new athletes this week" will invent one.
//
// Output: scripts/out/weekly-brief.md
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import {
  briefPrompt,
  briefProblems,
  factLines,
  gatherFacts,
  parseBrief,
  type BriefDraft,
  type LiveMetrics,
} from "../lib/marketing-brief";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const num = (flag: string): number | undefined => {
  const i = args.indexOf(flag);
  if (i < 0 || !args[i + 1]) return undefined;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`${flag} needs a whole number, got "${args[i + 1]}"`);
    process.exit(1);
  }
  return n;
};

const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
const OUT = new URL("./out/", import.meta.url);

const live: LiveMetrics = {};
const athletes = num("--athletes");
const waitlist = num("--waitlist");
if (athletes !== undefined) live.newAthletes = athletes;
if (waitlist !== undefined) live.waitlist = waitlist;

const facts = gatherFacts(live);
if (!facts) {
  console.error("No protein index — the food database has nothing that qualifies.");
  process.exit(1);
}

console.log("This week's facts:\n");
for (const line of factLines(facts)) console.log(`  - ${line}`);

if (has("--dry-run")) {
  const { system, user } = briefPrompt(facts);
  console.log(`\nModel: ${MODEL}\n\n─── system ───\n${system}\n\n─── user ───\n${user}`);
  console.log("\nNo request was made. Drop --dry-run and set OPENROUTER_API_KEY to draft.");
  process.exit(0);
}

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error("\nOPENROUTER_API_KEY is not set. Use --dry-run to see the prompt without it.");
  process.exit(1);
}

const { system, user } = briefPrompt(facts);
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://pocketathlete.com",
    "X-Title": "PocketAthlete weekly brief",
  },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }),
});

if (!res.ok) {
  console.error(`\nHTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const body = await res.json() as { choices?: { message?: { content?: string } }[] };
const text = body.choices?.[0]?.message?.content ?? "";
const draft: BriefDraft | null = parseBrief(text);
if (!draft) {
  console.error(`\nCould not read a draft out of the reply:\n${text.slice(0, 400)}`);
  process.exit(1);
}

const problems = briefProblems(draft, facts);

console.log(`\n─── subject ───\n${draft.subject}\n\n─── email ───\n${draft.email}\n\n─── social ───`);
draft.social.forEach((post, i) => console.log(`\n${i + 1}. ${post}`));

if (problems.length === 0) {
  console.log("\nNothing flagged. Read it anyway before it goes out.");
} else {
  console.log(`\n${problems.length} thing${problems.length === 1 ? "" : "s"} to look at:`);
  for (const p of problems) console.log(`  [${p.where}] ${p.problem}`);
}

mkdirSync(OUT, { recursive: true });
const md = [
  `# Weekly brief — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `Drafted by \`${MODEL}\`. **Not reviewed by a person.** Nothing here has been sent.`,
  "",
  "## Facts it was given",
  "",
  ...factLines(facts).map((l) => `- ${l}`),
  "",
  "## Checks",
  "",
  problems.length === 0
    ? "Nothing flagged. That is not the same as approved — read it."
    : problems.map((p) => `- **${p.where}** — ${p.problem}`).join("\n"),
  "",
  "## Email",
  "",
  `**Subject:** ${draft.subject}`,
  "",
  draft.email,
  "",
  "## Social",
  "",
  ...draft.social.map((post, i) => `${i + 1}. ${post}`),
  "",
  "---",
  "",
  "To send the email, use Admin → Waitlist Announce. Dry run first.",
].join("\n");

writeFileSync(new URL("weekly-brief.md", OUT), md + "\n");
console.log(`\nWrote scripts/out/weekly-brief.md`);
