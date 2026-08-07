import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY BACKEND CALL THE APP MAKES HAS TO LAND SOMEWHERE.
 *
 * There are two backends. The Cloudflare Worker, reached when
 * NEXT_PUBLIC_API_URL is set, whose source is edited by hand in the dashboard
 * and is not reliably in this repository. And the Supabase Edge Functions,
 * reached when it isn't, which are in `supabase/functions/`.
 *
 * They do NOT serve the same routes, and nothing anywhere checked that. The
 * Worker answers 18; the Edge Functions cover 4 of the 14 the app calls. So
 * unsetting NEXT_PUBLIC_API_URL — which was done to get the meal photo
 * estimator onto a backend that can see — silently took TEN features with it,
 * including subscription management and account deletion. Neither of those has
 * an on-device fallback, and neither can have one: you cannot cancel a Stripe
 * subscription from a phone with no server.
 *
 * The photo estimator did not need that change. `estimateFood` already routes
 * photos to the Edge Function on its own when the Worker reports no vision
 * (see lib/api.ts), independently of NEXT_PUBLIC_API_URL.
 *
 * This test is the check that was missing. It is deliberately a static scan of
 * the repo rather than a live probe: it has to fail in CI, on a laptop, with no
 * network and no deployment, at the moment somebody adds the call.
 */

const ROOT = new URL("..", import.meta.url).pathname;

/** Function names the app asks a backend for. */
function calledFunctions(): Set<string> {
  const names = new Set<string>();
  const pattern =
    /(?:invokeAI|invokeEdge)\s*(?:<[^>]*>)?\s*\(\s*["']([a-z0-9-]+)["']|functions\.invoke\s*\(\s*["']([a-z0-9-]+)["']/g;

  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const src = readFileSync(join(ROOT, rel), "utf8");
        for (const m of src.matchAll(pattern)) names.add(m[1] ?? m[2]);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  return names;
}

/** Routes the Worker in this repo answers. */
function workerRoutes(): Set<string> {
  const src = readFileSync(join(ROOT, "cloudflare/worker.js"), "utf8");
  const out = new Set<string>();
  for (const m of src.matchAll(/pathname\.endsWith\("\/([a-z0-9-]+)"\)/g)) out.add(m[1]);
  return out;
}

/** Edge Functions that exist in version control. */
function edgeFunctions(): Set<string> {
  return new Set(
    readdirSync(join(ROOT, "supabase/functions"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "_shared")
      .map((e) => e.name)
  );
}

/**
 * Routes that exist ONLY in the Worker, knowingly.
 *
 * Every name here is a feature that breaks the moment NEXT_PUBLIC_API_URL is
 * unset, because the fallback path has nowhere to send it. The list is written
 * down so that state is a decision somebody made rather than something an
 * athlete discovers by tapping "Cancel subscription" and getting a 404.
 *
 * Shrinking this list is the work. Adding to it should hurt.
 */
const WORKER_ONLY = new Set([
  // Billing. Cannot have an on-device fallback — it talks to Stripe.
  "billing-portal",
  "cancel-subscription",
  "pause-subscription",
  "resume-subscription",
  // Account deletion. Also cannot: it clears Stripe and storage server-side.
  "delete-account",
  // Wearable OAuth/token exchange — needs the provider secrets.
  "connect-wearable",
  // Have on-device fallbacks, so these degrade rather than break.
  "generate-challenges",
  "injury-plan",
  // No fallback and no Edge equivalent: the button reports the error and that
  // is all it can do. Found by this test rather than by reading the code —
  // a hand-written list of these calls had already missed it once.
  "generate-content",
  // Admin-only, and gated behind a role the athlete app never has.
  "admin-create-user",
]);

test("every backend call the app makes is served by some backend", () => {
  const called = calledFunctions();
  const worker = workerRoutes();
  const edge = edgeFunctions();

  assert.ok(called.size >= 10, `only found ${called.size} backend calls — the scanner is probably broken`);

  const orphans = [...called].filter((fn) => !worker.has(fn) && !edge.has(fn));
  assert.deepEqual(
    orphans, [],
    `these are called but no backend serves them:\n  ${orphans.join("\n  ")}`
  );
});

test("nothing quietly becomes Worker-only", () => {
  const called = calledFunctions();
  const edge = edgeFunctions();

  const workerOnly = [...called].filter((fn) => !edge.has(fn)).sort();
  const declared = [...WORKER_ONLY].filter((fn) => called.has(fn)).sort();

  assert.deepEqual(
    workerOnly, declared,
    "The set of features that break when NEXT_PUBLIC_API_URL is unset has changed.\n" +
      `  now Worker-only: ${workerOnly.join(", ") || "(none)"}\n` +
      `  declared:        ${declared.join(", ") || "(none)"}\n` +
      "Either add the Supabase Edge Function, or add the name to WORKER_ONLY and\n" +
      "accept that the feature dies whenever the app falls back to Edge."
  );
});

/**
 * The list is allowed to shrink without editing this file, but never to grow
 * unnoticed — a stale entry is harmless, a missing one is a dead button.
 */
test("the Worker-only list has no entries the app no longer calls", () => {
  const called = calledFunctions();
  const stale = [...WORKER_ONLY].filter((fn) => !called.has(fn));
  assert.deepEqual(stale, [], `WORKER_ONLY lists functions nothing calls: ${stale.join(", ")}`);
});
