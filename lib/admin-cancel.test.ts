import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const WORKER = strip(readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8"));
const USERS = strip(readFileSync(new URL("../components/admin/Users.tsx", import.meta.url), "utf8"));
const BUNDLE = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const MIGRATION = readFileSync(
  new URL("../supabase/migrations/0104_admin_cancellation_actor.sql", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BUTTON IS NOT A PERMISSION CHECK.
 *
 * This endpoint cancels a paying customer's subscription. It sits on an admin
 * page, which stops nobody: anyone can POST to a Worker URL with their own
 * token. The role has to be read server-side, from profiles, with the service
 * key — the same rule announce-launch is built on.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the endpoint refuses anyone who is not an admin", () => {
  const fn = WORKER.slice(
    WORKER.indexOf("async function adminSubscription("),
    WORKER.indexOf("async function recordAdminCancellation("));
  assert.ok(fn.length > 200, "adminSubscription is gone");

  assert.match(fn, /const actor = await authUser\(req, env\)/, "the caller is not identified");
  assert.match(fn, /if \(!\(await isAdmin\(env, actor\.id\)\)\) return json\(\{ error: "admins only" \}, 403\)/,
    "the role is not verified server-side");

  // The auth checks must come before anything reaches Stripe.
  assert.ok(fn.indexOf("isAdmin") < fn.indexOf("stripe("),
    "Stripe is called before the caller is authorised");
});

test("only the three known actions are accepted", () => {
  const fn = WORKER.slice(WORKER.indexOf("async function adminSubscription("));
  assert.match(fn, /\["cancel", "cancel_now", "resume"\]\.includes/,
    "an unrecognised action is not rejected");
  assert.match(fn, /if \(!userId\) return json\(\{ error: "userId required" \}, 400\)/);
});

/**
 * The default has to be the reversible one. "Cancel" typed by an admin who has
 * not read the docs must mean "at the end of what they paid for", never "now".
 */
test("immediate cancellation has to be asked for by name", () => {
  const fn = WORKER.slice(WORKER.indexOf("async function adminSubscription("));
  const immediate = fn.indexOf('action === "cancel_now"');
  assert.ok(immediate > 0, "there is no distinct immediate branch");
  assert.match(fn, /if \(action === "cancel_now"\) \{\s*sub = await stripe\([^)]*"DELETE"\)/,
    "immediate cancellation is not a DELETE to Stripe");
  assert.match(fn, /\} else \{\s*sub = await stripe\(env, `subscriptions\/\$\{row\.stripe_subscription_id\}`, \{ cancel_at_period_end: "true" \}\)/,
    "the fall-through is not cancel-at-period-end");
});

/** Cancelling and refunding are different decisions. */
test("nothing here issues a refund", () => {
  const fn = WORKER.slice(WORKER.indexOf("async function adminSubscription("),
    WORKER.indexOf("async function stripeSubIdFor("));
  assert.ok(!/refunds/.test(fn), "the admin cancel path calls the Stripe refunds API");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE METADATA TRAP.
 *
 * upsertSub attributes a subscription by sub.metadata.user_id, and returns
 * silently when it is missing. Everything created through create-checkout has
 * it; a subscription made by hand in the Stripe dashboard has neither user_id
 * nor tier — so cancelling one of those looked like it worked and left the
 * customer on their paid tier indefinitely.
 *
 * The admin path already knows who it is acting on. It must say so rather than
 * hope the metadata is there.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the admin path does not rely on Stripe metadata to attribute the row", () => {
  assert.match(WORKER, /const uid = sub\.metadata\?\.user_id \?\? known\?\.userId/,
    "upsertSub cannot be told who the subscription belongs to");
  assert.match(WORKER, /const tier = sub\.metadata\?\.tier \?\? known\?\.tier/);

  const fn = WORKER.slice(WORKER.indexOf("async function adminSubscription("));
  assert.match(fn, /await upsertSub\(env, sub, \{ userId, tier: row\.tier \?\? undefined \}\)/,
    "the admin path lets upsertSub fall back to metadata that may not exist");
});

test("an admin cannot use this on themselves", () => {
  const fn = WORKER.slice(WORKER.indexOf("async function adminSubscription("));
  assert.match(fn, /if \(userId === actor\.id\)/,
    "an admin cancelling themselves would log an admin action against their own churn");
});

/** Who did it, so a refund dispute is answerable. */
test("an admin cancellation is recorded with the admin who did it", () => {
  assert.match(WORKER, /actor_id: actorId/, "the audit row does not name the actor");
  assert.match(MIGRATION, /add column if not exists actor_id uuid references public\.profiles\(id\)/);
  assert.match(MIGRATION, /outcome: |'cancelled'|cancelled/);

  // Recording must never fail the request: Stripe has already been changed.
  const rec = WORKER.slice(WORKER.indexOf("async function recordAdminCancellation("));
  assert.match(rec, /try \{/, "a failed audit write would fail an already-completed cancellation");
  assert.match(rec, /catch/);
});

/**
 * Before 0104 the RPC returns no billing columns at all. `undefined` is not
 * `false`, and rendering a Cancel button for a row we know nothing about
 * produces a 404 and an admin who thinks the feature is broken.
 */
test("the button is hidden when the migration has not been applied", () => {
  assert.match(USERS, /has_billing\?: boolean;/, "has_billing is not optional");
  assert.match(USERS, /cancel_at_period_end\?: boolean;/);
  assert.match(USERS, /\{u\.has_billing && !u\.suspended_at && \(/,
    "the billing controls are not gated on there being billing");
  assert.match(MIGRATION, /\(s\.stripe_subscription_id is not null\)/,
    "the RPC does not return has_billing");
});

test("the panel changes Stripe, never the subscription row directly", () => {
  assert.match(USERS, /callWorker\("\/admin-subscription"/, "the panel no longer calls the Worker");
  // Writing status straight into the table would stop access and keep billing.
  assert.ok(!/from\("subscriptions"\)/.test(USERS),
    "the admin panel writes to the subscriptions table directly");
  assert.ok(!/admin_set_cancelled|admin_cancel/.test(USERS),
    "a database RPC is cancelling subscriptions without telling Stripe");
});

/** The bundle is what actually runs; the source is not deployed. */
test("the built bundle carries the endpoint and a bumped version", () => {
  assert.ok(BUNDLE.includes("/admin-subscription"),
    "the bundle predates this endpoint — run `node scripts/build-worker-bundle.mjs`");
  const version = WORKER.match(/const WORKER_VERSION = "([^"]+)"/)?.[1];
  assert.ok(version, "WORKER_VERSION is gone");
  assert.ok(BUNDLE.includes(version), `the bundle is not built from this source (expected ${version})`);
});
