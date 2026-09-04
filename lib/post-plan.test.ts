import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plannedPosts, pillarCycle, strideFor, pick, dayIndex, ideaCount } from "./post-plan";
import { PILLARS } from "./content";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PLAN SAID WHAT KINDS OF THING TO POST, NEVER WHAT TO POST.
 *
 * lib/content.ts has four pillars and their mix, and every tool that makes an
 * actual post still starts with a blank field. So the first step is somebody
 * deciding what today's subject is — the step that does not happen on a busy
 * Tuesday, and the reason a content engine full of good tools produces nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every day has a subject drawn from something already written", () => {
  const week = plannedPosts("2026-09-07", 7);
  assert.equal(week.length, 7, "a day with no post is a day nothing goes out");
  for (const post of week) {
    assert.ok(post.subject.trim().length > 2, `${post.date} has no subject`);
    assert.ok(post.topic.trim().length > 40, `${post.date}: "${post.topic}" is a prompt, not a topic`);
    assert.ok(post.factGroups.length > 0, `${post.date} lets the writer draw on nothing`);
    // Nothing may reach the writer as a placeholder.
    assert.ok(!/undefined|null|NaN|\[object/.test(post.topic + post.subject), post.topic);
  }
});

/** Same date in, same plan out — on every device, after every reload, with no
 *  table and nothing to keep in step. */
test("the schedule is derived from the date, not from chance", () => {
  assert.deepEqual(plannedPosts("2026-09-07", 5), plannedPosts("2026-09-07", 5));
  // And a window starting later is the tail of the longer one, so "this week"
  // and "next week" agree about the days they share.
  const long = plannedPosts("2026-09-07", 14);
  const later = plannedPosts("2026-09-14", 7);
  assert.deepEqual(later, long.slice(7));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `list[day % list.length]` LOOKS LIKE ROTATION AND IS NOT.
 *
 * A coaching slot only lands on certain days of a ten-day cycle, so indexing
 * by the day number visits ten of the hundred drills and never the other
 * ninety. It would take months to notice, and the symptom — "the account keeps
 * posting the same drills" — reads as a content problem rather than a bug.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the rotation reaches every entry before repeating one", () => {
  for (const length of [3, 4, 7, 10, 23, 100, 335, 336]) {
    const stride = strideFor(length);
    assert.equal(gcd(stride, length), 1, `stride ${stride} shares a factor with ${length}`);
    const seen = new Set<number>();
    for (let n = 0; n < length; n++) seen.add(pick([...Array(length).keys()], n)!);
    assert.equal(seen.size, length, `only ${seen.size} of ${length} entries are ever chosen`);
  }
});

test("an empty catalogue is nothing to post, not a crash", () => {
  assert.equal(pick([], 3), null);
  assert.equal(pick(["only"], 99), "only");
});

/**
 * Laid out in share order the cycle is CCCCCPPBBA: five drills in a row and
 * then the advert, every time. The mix would be right and the feed would read
 * as a fortnight of coaching followed by a pitch.
 */
test("the pillars are spread across the cycle, not clumped", () => {
  const cycle = pillarCycle();
  assert.equal(cycle.length, 10);

  for (const pillar of PILLARS) {
    const count = cycle.filter((id) => id === pillar.id).length;
    assert.equal(count, pillar.share, `${pillar.id} has ${count} slots, not the ${pillar.share} it asks for`);
  }
  assert.ok(!cycle.includes(""), "a slot was left empty — that is a day with no post");

  // The rarest pillar must not sit at either end, where it lands next to its
  // own repeat across the cycle boundary.
  const ask = cycle.indexOf("ask");
  assert.ok(ask > 0 && ask < 9, `the ask is at position ${ask} — adjacent to itself next cycle`);

  // And no pillar may take four in a row, which is the clumping this prevents.
  let run = 1;
  for (let i = 1; i < cycle.length; i++) {
    run = cycle[i] === cycle[i - 1] ? run + 1 : 1;
    assert.ok(run <= 3, `${cycle[i]} appears ${run} days running`);
  }
});

/** Over a cycle the mix is the one lib/content.ts asks for. */
test("a fortnight matches the posting mix that was decided", () => {
  const twenty = plannedPosts("2026-09-07", 20);
  for (const pillar of PILLARS) {
    const got = twenty.filter((p) => p.pillar === pillar.id).length;
    assert.equal(got, pillar.share * 2, `${pillar.id}: ${got} posts in 20 days, not ${pillar.share * 2}`);
  }
});

/**
 * The subject index counts CYCLES, not days. Passing the day number means a
 * pillar with five slots advances its subject by ten each turn, multiplying
 * the stride by ten and destroying the coprimality the rotation depends on.
 */
test("each pillar uses every subject it has before repeating one", () => {
  const long = plannedPosts("2026-09-07", 200);
  for (const pillar of PILLARS) {
    const subjects = long.filter((p) => p.pillar === pillar.id).map((p) => p.subject);
    const available = ideaCount(pillar.id);
    assert.ok(available > 0, `${pillar.id} has nothing to post about`);
    const distinct = new Set(subjects).size;
    /**
     * The property, not a round number: over enough turns you should see every
     * subject the pillar HAS. Asserting "at least four different ones" would
     * have passed the parity bug this test was written for — three of four app
     * screens is more than four across twelve posts, and the fourth screen was
     * unreachable.
     */
    assert.equal(distinct, Math.min(subjects.length, available),
      `${pillar.id} used ${distinct} of its ${available} subjects across ${subjects.length} posts`);
  }
});

test("a bad date does not produce a plan built on NaN", () => {
  assert.equal(dayIndex("not a date"), 0);
  const plan = plannedPosts("2026-09-07", 3);
  assert.ok(plan.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date)), "a date came out malformed");
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}


/**
 * The invariant the cycle is built on. `pillarCycle` lays PILLARS out over ten
 * slots; shares that sum to anything else either leave a day with no post or
 * silently drop the pillar that did not fit.
 */
test("the pillar shares fill the cycle exactly", () => {
  const total = PILLARS.reduce((n, p) => n + p.share, 0);
  assert.equal(total, pillarCycle().length,
    `the shares sum to ${total} but the cycle is ${pillarCycle().length} days — change both or neither`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ACTUAL JOB THE STRIDE DOES.
 *
 * Coverage is not it — the turn number is consecutive, so plain modulo would
 * reach everything. Each pillar's list is several catalogues concatenated, and
 * walking it in order posts every strength standard before the first recipe
 * collection: a month of one thing, from a schedule whose whole purpose is a
 * feed worth following.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a run of posts in one pillar is not all from the same catalogue", () => {
  const long = plannedPosts("2026-09-07", 200);
  const problem = long.filter((p) => p.pillar === "problem");
  assert.ok(problem.length >= 6, "not enough posts to judge the ordering");

  const catalogue = (href?: string) => (href ?? "/").split("/")[1] ?? "";
  for (let i = 0; i + 4 <= problem.length; i++) {
    const window = problem.slice(i, i + 4).map((p) => catalogue(p.href));
    assert.ok(new Set(window).size > 1,
      `four problem posts running all came from /${window[0]}/ — the catalogues are not interleaved`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE SCREEN HAS TO ACTUALLY USE IT.
 *
 * Every rule above passes with plannedPosts written, exported, tested and
 * reached by nobody — which is precisely the state the content engine was
 * already in: four good tools, each behind an empty text box.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the content engine opens on the schedule and drafts from it", () => {
  const src = readFileSync(new URL("../components/ContentEngine.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  assert.match(src, /plannedPosts\(from, 7\)/, "the schedule is not built from the plan");
  assert.match(src, /useState<Tab>\("schedule"\)/,
    "the engine still opens on advice rather than on what to post today");

  // The topic goes to the writer verbatim — the whole point is that nobody has
  // to type one.
  assert.match(src, /topic: post\.topic/, "the draft button does not use the planned topic");
  // And with the post's OWN fact groups, not everything: a post about one drill
  // has no business quoting the protein index.
  assert.match(src, /post\.factGroups\.includes\(g\.id\)/,
    "the writer is handed every fact rather than the ones this post may use");

  // Seven at once against a rate-limited free tier fails as five drafts and two
  // errors, which is worse than waiting.
  assert.ok(!/Promise\.all\(posts/.test(src), "the batch fires every request at once");
  assert.match(src, /for \(const post of posts\)[\s\S]{0,200}?await draft\(post\)/,
    "the batch is not sequential");
});
