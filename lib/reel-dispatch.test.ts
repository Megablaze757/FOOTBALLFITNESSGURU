import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAROUSEL_EVENT, REEL_EVENT, REEL_SCRIPTS, dispatchBody, reelRequestProblem } from "./reel-dispatch";
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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A PARSER IS NOT AN ERROR HANDLER.
   *
   * The sign-in was one line: curl piped straight into a JSON parser. When the
   * response was not JSON, the run's entire explanation was a Python traceback
   * ending "Expecting value: line 1 column 1" — which says nothing about
   * sign-in, nothing about which request, and nothing about what to do. And
   * `continue-on-error` reported the step as SUCCESS, so the job listing said
   * it had worked.
   * ═══════════════════════════════════════════════════════════════════════
   */
  /**
   * BOTH requests, not one. There are two — sign in, then upload — and a
   * pattern that merely finds the string passes while the first one goes
   * unchecked, which is the exact request that failed.
   */
  const statusChecks = (upload.match(/-w "%\{http_code\}"/g) ?? []).length;
  assert.ok(statusChecks >= 2, `only ${statusChecks} of the two requests checks its status`);
  assert.ok(
    !/curl[^\n]*\|\s*python3/.test(upload),
    "curl is piped straight into a parser, so a non-JSON response becomes a traceback",
  );
  assert.match(upload, /::error::Sign-in to Supabase failed \(HTTP/,
    "a failed sign-in does not say that it failed");
  // The likeliest cause of an upload failure, named rather than left to guess.
  assert.match(upload, /apply-0088-0111\.sql/,
    "a missing bucket does not point at the migration that creates it");

  // Credentials are built by a JSON encoder, not string-concatenated into a
  // shell-quoted literal where a quote in a password would break the request.
  assert.match(upload, /json\.dumps/,
    "the credentials are interpolated into JSON by hand, which a quote in a password breaks");

  // Said BEFORE the three minutes, not after them.
  const early = workflow.slice(0, workflow.indexOf("Put it in the dashboard"));
  assert.match(early, /What is configured/, "nothing reports the configuration up front");
  assert.match(early, /secrets\.REEL_EMAIL != ''/, "the report does not check the secret");
  assert.ok(!/echo "\$\{\{ secrets\./.test(workflow), "a secret's value is echoed into the log");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE INVISIBLE CHARACTER, THREE WASTED RUNS.
 *
 * The NEXT_PUBLIC_SUPABASE_URL repository variable was saved with a trailing
 * carriage return. The log showed it and nobody could see it:
 *
 *     SUPABASE_URL: https://txqhstackgidjqkkrzyj.supabase.co\r
 *     curl: (3) URL rejected: Malformed input to a URL function
 *
 * curl quit before making a request, so the upload step took ZERO SECONDS and
 * — under continue-on-error — reported success. Three runs recorded a reel
 * perfectly and put none of them in the dashboard.
 *
 * And the error handler was no better: `code=$(curl -w "%{http_code}" ... ||
 * echo "000")` APPENDS to curl's output rather than replacing it, and curl
 * already prints 000 on failure. The code was "000000", which matched no case,
 * so the run's whole explanation was "HTTP 000000" and a blank line.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a pasted newline in a settings box cannot break a run again", () => {
  const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");

  // Stripped ONCE, up front — a second place to clean is a second place to
  // forget. Everything downstream reads the cleaned value out of $GITHUB_ENV.
  const setup = workflow.slice(0, workflow.indexOf("actions/checkout"));
  /**
   * THE URL LINE, not merely the string somewhere in the step. A guard that
   * only asks whether the strip exists passes while the URL — the one value
   * that actually broke — loses it, because the key and API lines still carry
   * one. A guard matched by the wrong occurrence is the bug this file has now
   * caught four times, and it caught this version of itself.
   */
  for (const [name, raw] of [["url", "RAW_URL"], ["key", "RAW_KEY"], ["api", "RAW_API"]]) {
    assert.match(
      setup,
      new RegExp(`${name}=\\$\\(printf '%s' "\\$${raw}" \\| tr -d '\\[:space:\\]'\\)`),
      `${raw} is used without stripping whitespace, so a pasted newline survives into the request`,
    );
  }
  assert.match(setup, /SUPABASE_URL=\$url/,
    "the cleaned URL never reaches \$GITHUB_ENV, so later steps cannot use it");

  /**
   * The RAW variable is read in exactly one place. Every later use that
   * reaches back for `vars.` gets the carriage return again — which is how a
   * bug fixed in one step survives in the next.
   */
  const raws = (workflow.match(/vars\.NEXT_PUBLIC_SUPABASE_URL/g) ?? []).length;
  assert.equal(raws, 1,
    `the raw variable is read in ${raws} places; only the step that cleans it may read it`);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ env\.SUPABASE_URL \}\}/,
    "the build bakes the raw variable into the bundle, newline and all");

  // A URL that still is not one says so before three minutes are spent.
  assert.match(setup, /does not look like a Supabase URL/,
    "a malformed URL is discovered by curl at the last step instead of at the first");

  /**
   * `|| echo "000"` on a curl that already prints %{http_code} concatenates
   * two codes. Nothing may do that again — on EITHER request.
   */
  const upload = workflow.slice(workflow.indexOf("Put it in the dashboard"));
  assert.ok(
    !/%\{http_code\}[\s\S]*?\|\| echo "000"\)/.test(upload),
    'a curl still appends `|| echo "000"` to its own status code, producing "000000"',
  );
  const captured = (upload.match(/^\s*(?:if ! )?(?:code|up)=\$\(curl/gm) ?? []).length;
  assert.equal(captured, 2, `${captured} of the two requests capture curl's status`);
  assert.equal((upload.match(/^\s*if ! (?:code|up)=\$\(curl/gm) ?? []).length, 2,
    "a request does not capture curl's own exit status, so a refused URL is indistinguishable from a reply");

  // A newline pasted into a SECRET is the same hazard as one in a variable.
  assert.match(upload, /REEL_PASSWORD=\$\(printf '%s' "\$REEL_PASSWORD" \| tr -d/,
    "a trailing newline on the password is sent to Supabase as part of the password");
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
  assert.match(panel, /"Recording[^"]*close this/,
    "the confirmation does not say they can put the phone down");
  /**
   * The carousel gets its OWN wait, and a short one. Telling somebody a
   * forty-second job takes three minutes is the same lie as the other way
   * round — they go away and come back long after it finished.
   */
  assert.match(panel, /"Making the slides[^"]*"/,
    "the carousel reuses the reel's three-minute message");

  /**
   * THE BUTTON AND THE LISTING, both. A carousel that can be made and never
   * appears is worse than one that cannot be made at all — the whole reason
   * any of this went into the dashboard was not having to go and find it.
   */
  assert.match(panel, /make\("", "carousel"\)/,
    "nothing in the panel starts a carousel");
  assert.match(panel, /\\\.\(mp4\|png\)/,
    "the library still lists only video, so a carousel would never show up");
});

test("the reels bucket is private and admin-read", () => {
  const sql = readFileSync("supabase/migrations/0111_reels.sql", "utf8");
  assert.match(sql, /'reels', 'reels', false/, "the bucket is public");
  assert.match(sql, /for select to authenticated\s*\n\s*using \(bucket_id = 'reels' and public\.is_admin\(\)\)/,
    "anybody signed in can read the reels");
  assert.match(sql, /file_size_limit/, "an open insert policy with no size cap is somebody's disk quota");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAROUSEL GOES THROUGH THE SAME DOOR.
 *
 * One route, one validator, one place where the admin token is checked. A
 * second endpoint for the still-image post would be a second copy of all of
 * that, and one of the two copies is always the one that stops being checked.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a carousel is dispatched to its own workflow", () => {
  const body = dispatchBody({ script: "", voice: false, kind: "carousel" });
  assert.equal(body.event_type, CAROUSEL_EVENT);
  assert.notEqual(body.event_type, REEL_EVENT, "the carousel starts the reel workflow");
});

test("a request with no kind is still a reel", () => {
  // Every caller written before the carousel existed omits it, including the
  // deployed Worker until it is redeployed.
  assert.equal(dispatchBody({ script: "demo-cost", voice: true }).event_type, REEL_EVENT);
  assert.equal(reelRequestProblem({ script: "demo-cost", voice: true }), null);
});

test("a carousel needs no script, and a reel still does", () => {
  assert.equal(reelRequestProblem({ kind: "carousel", voice: false }), null,
    "a carousel is refused for not naming one of four reel scripts");
  assert.equal(reelRequestProblem({ kind: "carousel", voice: false, script: "" }), null);

  assert.ok(reelRequestProblem({ kind: "reel", voice: false }), "a reel was allowed with no script");
  assert.ok(reelRequestProblem({ voice: false }), "a request with no kind and no script was allowed");
});

test("an unknown kind is refused rather than treated as a reel", () => {
  for (const kind of ["video", "story", "", "REEL", "carousel; rm -rf /"]) {
    assert.ok(reelRequestProblem({ kind: kind as never, voice: false, script: "demo-cost" }),
      JSON.stringify(kind));
  }
});
