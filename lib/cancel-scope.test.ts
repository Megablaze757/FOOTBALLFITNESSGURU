import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
const flow = readFileSync(new URL("../components/CancelFlow.tsx", import.meta.url), "utf8");

/** One function's body, brace-matched, comments stripped. */
function fn(name: string): string {
  const start = worker.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} has moved — this guard is reading nothing`);
  const open = worker.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < worker.length; i++) {
    if (worker[i] === "{") depth++;
    else if (worker[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  return worker.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANCEL THE DUPLICATES. NEVER A DIFFERENT PRODUCT.
 *
 * Two failures, pointing opposite ways, and both cost real money.
 *
 * The one that was reported: `subscriptions` holds ONE row per user, so a
 * customer with two live subscriptions had the second overwrite the first.
 * Cancel touched one; the other billed monthly, invisible to the whole app.
 *
 * The one the first fix introduced: cancelling EVERYTHING live. The Team plan
 * is sold separately at £150/mo, so a coach on Pro and Team who cancelled Pro
 * would silently have lost Team as well — fixing an overcharge by cancelling
 * something somebody pays for on purpose is the same failure reversed.
 *
 * The rule is DUPLICATE, not live: same price, or same tier in the metadata
 * the checkout wrote. Anything else is reported, not cancelled.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("cancellation is scoped to duplicates of the plan being cancelled", () => {
  const body = fn("cancellationPlanFor");

  assert.match(body, /const sameThing =/, "there is no test for what counts as the same plan");
  assert.match(body, /priceOf\(sub\) === priceOf\(anchor\)/,
    "a duplicate on the same Stripe price is not recognised as a duplicate");
  assert.match(body, /sub\.metadata\.tier === anchor\.metadata\?\.tier/,
    "a duplicate of the same tier is not recognised — the bug is two of the same plan");

  assert.match(body, /keep: live\.filter\(\(sub\) => !sameThing\(sub\)\)/,
    "everything live is being cancelled again, which takes out the Team plan");
  assert.ok(!/cancel: live\.map/.test(body), "the cancellation is unscoped");
});

/** A separate product left running has to be named, or it is the same
 *  silent overcharge from the other direction. */
test("anything left running is reported to the athlete", () => {
  assert.match(worker, /alsoActive: plan\.keep\.map/, "the endpoint does not say what it left alone");
  assert.match(flow, /alsoActive/, "the confirmation screen never mentions it");
  assert.match(flow, /different plan/, "it lists them without saying why they were kept");
});

/**
 * The original bug, still fixed. A cancel that touches only the row in our own
 * table is the thing that was charging people.
 */
test("cancel asks Stripe what is billing, not our own table", () => {
  const body = fn("cancellationPlanFor");
  assert.match(body, /subscriptions\?customer=/, "it is back to trusting the single row we recorded");
  assert.match(body, /STILL_BILLING\.includes\(sub\.status\)/, "a trialing or past_due subscription is not counted");
  assert.match(body, /!sub\.cancel_at_period_end/, "an already-ending subscription is cancelled again");
});

/**
 * WHEN IT CANNOT TELL, IT MUST NOT GUESS WIDE.
 *
 * No customer on file, or a listing that failed: fall back to the ONE id we
 * hold. Guessing wide here cancels somebody's Team plan on a network error.
 */
test("an unreadable listing narrows to the known subscription, never widens", () => {
  const body = fn("cancellationPlanFor");
  const fallbacks = body.match(/return \{ cancel: known \? \[known\] : \[\], keep: \[\] \}/g) ?? [];
  assert.ok(fallbacks.length >= 2,
    "the no-customer and failed-listing paths do not both fall back to the single known id");
  assert.match(body, /catch \(e\)/, "a failed Stripe listing is not handled at all");
});

/** And the screen must never say "cancelled" over something still billing. */
test("the confirmation refuses to lie about a partial cancellation", () => {
  assert.match(flow, /res\?\.stillBilling/, "a partial cancellation is shown as a success");
  assert.match(flow, /may still be charged/, "it does not say what the consequence is");
});
