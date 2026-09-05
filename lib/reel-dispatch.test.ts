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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RUNNER HAS NO ffmpeg, AND THREE RUNS DIED PROVING IT.
 *
 * The workflow was written asserting "CI runners have one". They do not:
 * ubuntu-latest ships without it. Every run filmed the app perfectly, produced
 * the webm, the wav and the srt, and then failed on
 * `ffmpeg: command not found` at the one step that turns them into something
 * anybody can post.
 *
 * Playwright's bundled build is not a substitute — VP8 only, no audio, and it
 * cannot even read a wav.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the workflow installs the ffmpeg it depends on", () => {
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");
  assert.match(workflow, /apt-get install[^\n]*ffmpeg/,
    "the mux step runs ffmpeg and nothing installs it");
  assert.ok(
    workflow.indexOf("apt-get install -y -qq ffmpeg") < workflow.indexOf("-c:v libx264"),
    "ffmpeg is installed after the step that uses it",
  );
  assert.match(workflow, /libx264/, "an ffmpeg without H.264 produces a file the platforms refuse");
});

/**
 * A run that skips the upload and reports success is a run where nothing
 * appears in the app and nothing says why. The reel is still an artefact — the
 * log has to say that too.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A STEP THAT SKIPS ITSELF REPORTS SUCCESS.
 *
 * The upload was gated on `if: env.REEL_EMAIL != ''`. With the secret unset it
 * skipped, the run went green, the reel was made, and nothing appeared in the
 * app — the only clue a grey "skipped" on step sixteen that nobody scrolls to.
 *
 * So the check moved INSIDE the step, beside the thing it is checking for,
 * where it can say what to do about it. And the run reports what it can see up
 * front rather than at the end of three minutes.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a run that cannot upload says so rather than passing quietly", () => {
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");

  const upload = workflow.slice(workflow.indexOf("Put it in the dashboard"));
  assert.ok(
    !/^\s*if:/m.test(upload.split("run: |")[0]),
    "the upload step gates itself again, so a missing secret is a silent skip",
  );
  assert.match(upload, /if \[ -z "\$\{REEL_EMAIL:-\}" \]/,
    "nothing inside the step notices the credentials are missing");
  assert.match(upload, /::warning::REEL_EMAIL\/REEL_PASSWORD are empty/,
    "the skip is silent, so the run looks like it worked");
  assert.match(upload, /Variable of the same name will not work/,
    "the commonest way to get this wrong is not named");

  // Said BEFORE the three minutes, not after them.
  const early = workflow.slice(0, workflow.indexOf("Put it in the dashboard"));
  assert.match(early, /What is configured/, "nothing reports the configuration up front");
  assert.match(early, /secrets\.REEL_EMAIL != ''/, "the report does not check the secret");
  assert.ok(!/echo "\$\{\{ secrets\./.test(workflow), "a secret's value is echoed into the log");
});

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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * "IT'S STUCK IN LOADING."
   *
   * The panel renders "Loading…" until a request settles, so any request that
   * never settles is a spinner with no way out and nothing to read. A storage
   * call can hang on a stalled token refresh or a network that accepted the
   * connection and went quiet — neither of which rejects.
   *
   * The same failure as the share card's image loader, which left a button
   * reading "Creating…" forever. A timeout is what stops a screen having a
   * terminal state that says nothing.
   * ═══════════════════════════════════════════════════════════════════════
   */
  assert.match(panel, /Promise\.race/, "a hung request leaves the panel loading forever with nothing to read");
  assert.match(panel, /LOAD_TIMEOUT_MS/, "the timeout has no bound");

  // createSignedUrls([]) asks the API to sign nothing — a round trip on the
  // common case (no reels yet) that can only fail.
  assert.match(panel, /files\.length\s*\n?\s*\?/,
    "it signs an empty list, which is a request that should never be made");
  // Said, because a button that appears to do nothing gets pressed again — and
  // again is another three minutes of somebody's compute.
  assert.match(panel, /three minutes/, "nothing says how long it takes");

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * IT CARRIES ON WITHOUT THE TAB, AND THE PANEL HAS TO BOTH SAY SO AND
   * BEHAVE THAT WAY.
   *
   * Once GitHub accepts the request the work is server-side — the runner
   * films, narrates and uploads whether or not anybody is watching. The panel
   * refreshed on a three-minute setTimeout, which is exactly what a
   * backgrounded mobile tab throttles into never firing: the one case where a
   * refresh matters is the case a timer cannot cover.
   *
   * Coming back to the tab is the reliable signal and the exact moment
   * somebody wants to know.
   * ═══════════════════════════════════════════════════════════════════════
   */
  /**
   * The ADD, not the remove. Deleting the subscription leaves
   * `removeEventListener("visibilitychange", ...)` in the cleanup, so a guard
   * looking for the bare event name passes on a panel that never subscribes.
   */
  assert.match(panel, /addEventListener\("visibilitychange"/,
    "the list only refreshes on a timer, which a backgrounded phone throttles into never firing");
  // And the handler has to DO something. An empty one subscribes correctly and
  // refreshes nothing, which passes any guard looking only for the listener.
  assert.match(panel, /visibilityState === "visible"\) void load\(\)/,
    "the visibility handler is subscribed but never re-reads the list");

  /**
   * The message shown after pressing it — not the paragraph above the button,
   * which also says the recording survives. Two places say it and only one of
   * them is read at the moment somebody is deciding whether to wait.
   */
  assert.match(panel, /setNote\("Recording[^"]*close this/,
    "the confirmation does not say they can put the phone down");
});

test("the reels bucket is private and admin-read", () => {
  const sql = readFileSync("supabase/migrations/0111_reels.sql", "utf8");
  assert.match(sql, /'reels', 'reels', false/, "the bucket is public");
  assert.match(sql, /for select to authenticated\s*\n\s*using \(bucket_id = 'reels' and public\.is_admin\(\)\)/,
    "anybody signed in can read the reels");
  assert.match(sql, /file_size_limit/, "an open insert policy with no size cap is somebody's disk quota");
});
