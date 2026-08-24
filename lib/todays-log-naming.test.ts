import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One name for the thing you do every morning.
 *
 * The page, the heading and the nav label were renamed to "Today's log" a while
 * back — and about fifteen other places went on saying "check-in": the submit
 * button, the onboarding call to action, the report's empty state, the push and
 * email reminder switches, the coach's reason lines, the landing page. So the
 * product promised one word and showed another, and a rename that stops at the
 * heading is the version of this that looks finished and is not.
 *
 * This scans the user-facing source for the old word. It is a copy test, so it
 * is only worth having if the exceptions are honest — hence the list below,
 * which is short on purpose.
 */

const ROOTS = ["app", "components"];

/**
 * WHERE "check-in" IS STILL CORRECT.
 *
 * Identifiers, not copy: the table is `daily_check_ins`, the column is
 * `check_in_date`, the draft key is `checkin`, the achievement ids are
 * `checkins_100`, the row type is `DailyCheckIn`. Renaming any of those is a
 * migration and a data-loss risk for no benefit to anybody reading a screen.
 *
 * Rather than list them, this only ever looks at COPY — quoted strings and JSX
 * text. The first version scanned whole lines and reported `const checkIns =`
 * as a naming violation, which is the kind of test people delete.
 */
const IDENTIFIER_STRINGS = [
  "checkin", "check_in", "check_ins", "check-in-mode", "pa:checkin-mode",
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Strip comments, then take string literals and JSX text — the words people read. */
function copyIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  // NO NEWLINES INSIDE A LITERAL. A JS string cannot contain a raw line break,
  // and letting the pattern span them made it stitch the end of one line to the
  // start of another — which reported `(profile.level ?? "advanced");` as copy
  // saying "check-in", because the real phrase was three lines further down.
  for (const [, dq, sq] of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
    const quoted = dq ?? sq;
    if (quoted) out.push(quoted);
  }
  // JSX text does wrap across lines, so this one may — but a single run of text
  // between two tags, not half the file.
  for (const [, text] of code.matchAll(/>([^<>{}]{1,400})</g)) out.push(text);
  return out;
}

test("nothing user-facing calls it a check-in any more", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(root)) {
      for (const phrase of copyIn(readFileSync(file, "utf8"))) {
        if (!/check[\s-]?in/i.test(phrase)) continue;
        // A bare identifier used as a key, not a sentence.
        if (IDENTIFIER_STRINGS.includes(phrase.trim().toLowerCase())) continue;
        // A module specifier. `@/components/CheckInDone` is a filename.
        if (/^[@.]?\/?[\w@./-]+$/.test(phrase.trim())) continue;
        // "Checking with Oura…" is a different word doing a different job.
        if (/^check(ing)?[….\s]*$/i.test(phrase.trim())) continue;
        if (/checking (with|your)/i.test(phrase)) continue;
        offenders.push(`${file}  "${phrase.trim().slice(0, 80)}"`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `these still say "check-in" where somebody can read it:\n  ${offenders.join("\n  ")}`);
});

test("the heading, the nav and the button agree", () => {
  // Three surfaces, one name. The heading matching the nav already had a test;
  // the button that submits the thing did not, and it said "Submit check-in".
  const page = readFileSync("app/(app)/journal/page.tsx", "utf8");
  const nav = readFileSync("components/nav-items.tsx", "utf8");
  const form = readFileSync("components/JournalForm.tsx", "utf8");
  assert.match(page, /Today&apos;s log</);
  assert.match(nav, /label: "Today's log"/);
  assert.match(form, /Save today&apos;s log|Save today's log/);
});
