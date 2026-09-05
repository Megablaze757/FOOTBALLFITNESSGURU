import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REEL_EVENT, REEL_SCRIPTS, dispatchBody, reelRequestProblem } from "./reel-dispatch";
import { SCRIPTS } from "./reel-script";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("every reel the app can make is one this will send", () => {
  assert.deepEqual([...REEL_SCRIPTS].sort(), SCRIPTS.map((s) => s.id).sort(),
    "the dispatch list and the script list have drifted — a button that names a script this refuses");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHECKED IN THE WORKER, NOT TRUSTED FROM THE BROWSER.
 *
 * These values become arguments in a workflow that runs shell. "It came from
 * our own admin page" is not a reason to hand an arbitrary string to one — the
 * page is served from a static host and anybody with an admin session can post
 * whatever they like to the route.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("only a script this app actually has may be requested", () => {
  for (const script of REEL_SCRIPTS) {
    assert.equal(reelRequestProblem({ script, voice: true }), null, script);
  }
  for (const bad of ["", "   ", "nonsense", "demo-cost; rm -rf /", "../../etc/passwd", "DEMO-COST"]) {
    assert.ok(reelRequestProblem({ script: bad, voice: true }), JSON.stringify(bad));
  }
  assert.ok(reelRequestProblem(null));
  assert.ok(reelRequestProblem(undefined));
  assert.ok(reelRequestProblem({}));
});

test("a subject may be a drill name and nothing stranger", () => {
  for (const subject of [
    "Five-spot shooting", "Bench press", "Copenhagen plank (football)",
    "30g protein: what it costs", "Pacing ladder — running", "",
  ]) {
    assert.equal(reelRequestProblem({ script: "drill", voice: true, subject }), null, subject);
  }
  for (const bad of [
    "$(rm -rf /)", "`whoami`", "a; shutdown", "x | tee /etc/passwd", "a\nb",
    "<script>", "x".repeat(200),
  ]) {
    assert.ok(reelRequestProblem({ script: "drill", voice: true, subject: bad }), JSON.stringify(bad));
  }
  assert.ok(reelRequestProblem({ script: "drill", voice: true, subject: 42 as unknown as string }));
});

/**
 * Strings on both sides. A GitHub Actions expression comparing a JSON boolean
 * from client_payload against a workflow input is a comparison nobody can read
 * and half the internet gets wrong.
 */
test("the payload speaks the workflow's language", () => {
  const on = dispatchBody({ script: "demo-cost", voice: true });
  assert.equal(on.event_type, REEL_EVENT);
  assert.equal(on.client_payload.voice, "true");
  assert.equal(typeof on.client_payload.voice, "string");
  assert.equal(dispatchBody({ script: "demo-cost", voice: false }).client_payload.voice, "false");
  assert.equal(dispatchBody({ script: "drill", voice: true }).client_payload.subject, "",
    "an absent subject must be an empty string, not undefined — the workflow tests it with [ -n ]");
});

// --- both ends have to agree -------------------------------------------------

test("the workflow listens for the event the Worker sends", () => {
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");
  assert.match(workflow, new RegExp(`types: \\[${REEL_EVENT}\\]`),
    "the workflow does not listen for the event this sends, so the button does nothing at all");
  assert.match(workflow, /client_payload\.script/, "the workflow ignores which reel was asked for");
  assert.match(workflow, /client_payload\.voice/, "the workflow ignores whether it was asked to narrate");
});

/**
 * repository_dispatch, not workflow_dispatch: the two need different token
 * permissions and only one of them matches the token that already exists.
 */
test("the Worker uses the dispatch that the existing token can do", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /\/dispatches`/, "nothing asks GitHub to start a run");
  assert.ok(!/actions\/workflows\/[^`]*\/dispatches/.test(worker),
    "workflow_dispatch needs Actions: write — the token only has Contents: write");
  assert.match(worker, /reelRequestProblem\(body\)/, "the Worker sends whatever it was given");
  // 204 is success for this endpoint and has no body. A check for `ok` would
  // pass too, but the next person's "fix" to `res.ok && res.json()` would not.
  assert.match(worker, /sent\.status === 204/, "success is not recognised by its actual status");
});

test("the panel makes a reel and shows the ones that exist", () => {
  const panel = code("components/admin/ReelLibrary.tsx");
  assert.match(panel, /invokeAI<[^>]*>\("record-reel"/, "the button does not ask for a recording");
  assert.match(panel, /from\("reels"\)/, "nothing lists the finished reels");
  assert.match(panel, /createSignedUrls/, "a private bucket cannot be played without signed links");
  // Said, because a button that appears to do nothing gets pressed again — and
  // again is another three minutes of somebody's compute.
  assert.match(panel, /three minutes/, "nothing says how long it takes");
});

test("the reels bucket is private and admin-read", () => {
  const sql = readFileSync("supabase/migrations/0111_reels.sql", "utf8");
  assert.match(sql, /'reels', 'reels', false/, "the bucket is public");
  assert.match(sql, /for select to authenticated\s*\n\s*using \(bucket_id = 'reels' and public\.is_admin\(\)\)/,
    "anybody signed in can read the reels");
  assert.match(sql, /file_size_limit/, "an open insert policy with no size cap is somebody's disk quota");
});
