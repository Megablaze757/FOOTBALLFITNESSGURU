import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { growthDigest } from "./growth-digest";

const loop = {
  affiliateCodes: ["COACH20"],
  usernames: ["sam", "alex_r", "jordan"],
  attributed: ["sam", "COACH20", "typo123"],
  totalProfiles: 40,
  publicProfiles: 2,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ADMIN PANEL ONLY WORKS ON THE DAYS SOMEBODY OPENS IT.
 *
 * The weeks it matters most are the weeks nobody visits. So once a week it
 * comes to you — down the notification pipeline that already runs, with no new
 * sender and no new schedule.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the digest reports what the database knows", () => {
  const d = growthDigest({ loop })!;
  assert.ok(d, "nothing was produced from a week with real numbers");
  assert.match(d.body, /Athletes who can share: 3/);
  assert.match(d.body, /With a public page: 2/);
  assert.match(d.body, /Attributed signups: 3 \(1 free, 1 paid\)/);
  assert.equal(d.href, "/admin/social");
});

/**
 * The one line that is a BUG rather than a result: somebody was given a code,
 * typed it, and it matched nothing. It appears in no other view.
 */
test("lost attribution is named, because nothing else shows it", () => {
  assert.match(growthDigest({ loop })!.body, /Lost attribution: 1 signup/);
  const clean = { ...loop, attributed: ["sam", "COACH20"] };
  assert.ok(!/Lost attribution/.test(growthDigest({ loop: clean })!.body),
    "a clean week still reports a loss");
});

/**
 * A weekly email that arrives saying nothing teaches you to stop opening the
 * weekly email — and then the one that matters goes unread too.
 */
test("nothing to say means nothing is sent", () => {
  assert.equal(growthDigest({}), null);
  assert.equal(growthDigest({ extra: ["", "   "] }), null, "blank lines are not something to say");
});

test("the subject line carries the headline when there is one", () => {
  const withNews = growthDigest({ loop, headline: "Cheapest 30g of protein is 4p up" })!;
  assert.equal(withNews.title, "Cheapest 30g of protein is 4p up");
  // And falls back to the first real line rather than a generic label.
  assert.match(growthDigest({ loop })!.title, /Growth this week: Athletes who can share/);
});

test("caller-supplied lines lead, and are not invented here", () => {
  const d = growthDigest({ loop, extra: ["Today: Free coaching — Five-spot shooting"] })!;
  assert.ok(d.body.startsWith("Today: Free coaching"), "the caller's own lines are buried");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IT TAKES FACTS RATHER THAN IMPORTING THEM, AND THAT IS LOAD-BEARING.
 *
 * The first version imported plannedPosts, postTriggers and contentGaps. The
 * Worker cannot: its tsconfig has no "@/" alias, so those pull in the whole
 * app graph — and even with the alias, the transitive import is 380 exercises
 * and 335 recipes compiled into a script with a size limit, to produce six
 * lines of text.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the digest stays importable from the Worker", () => {
  const raw = readFileSync(new URL("./growth-digest.ts", import.meta.url), "utf8");
  const imports = [...raw.matchAll(/^import[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./share-loop"],
    "an import was added that drags the catalogue into the Worker bundle");

  // Comments stripped. The note above the imports explains that the Worker has
  // no "@/" alias, and a check that reads the prose finds the alias in the
  // sentence forbidding it — the third guard this session to trip on its own
  // explanation.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!code.includes("@/"), "a path alias the Worker's tsconfig does not have");
});

/** And the cron has to actually call it. */
test("the Monday run sends it", () => {
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /isMonday \? \[.*sendGrowthDigest\(env\)\]/, "the digest is never sent");
  assert.match(worker, /profiles\?role=eq\.admin/, "it is not scoped to admins");
  assert.match(worker, /dedupe_key: `growth-digest:\$\{week\}`/,
    "re-running the cron would send it twice in one week");
  // growthDigest returns null when there is nothing to say. The caller has to
  // honour that, or the "do not send an empty digest" rule is decoration.
  assert.match(worker, /if \(!digest\) return;/, "a null digest is queued as an empty email");
});
