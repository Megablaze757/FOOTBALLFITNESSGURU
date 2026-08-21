import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const migration = read("supabase/migrations/0091_notifications_trials_and_consent.sql");
const worker = read("cloudflare/src/index.ts");
const edgeCheckout = read("supabase/functions/create-checkout/index.ts");
const wrangler = read("cloudflare/wrangler.toml");
const consent = read("lib/consent.ts");
const legal = read("lib/legal.ts");

test("notification rows are deduplicated and optional email stops after consent withdrawal", () => {
  assert.match(migration, /unique index if not exists notifications_user_dedupe_unique/);
  assert.match(migration, /n\.email_category = 'essential' or p\.health_data_consent_at is not null/);
  assert.match(migration, /p\.in_app_training_reminders[\s\S]*p\.health_data_consent_at is not null/);
  assert.match(worker, /resolution=ignore-duplicates,return=minimal/);
});

test("the free-trial reminder uses Stripe truth and remains an essential service message", () => {
  assert.match(worker, /async function createTrialEndingReminders/);
  assert.match(worker, /subscription\.status !== "trialing"/);
  assert.match(worker, /price\?\.unit_amount/);
  assert.match(worker, /email_category: "essential"/);
  assert.match(worker, /trial_reminder_created_at/);
});

test("both checkout backends grant the trial only on a first Stripe subscription", () => {
  for (const source of [worker, edgeCheckout]) {
    assert.match(source, /stripe_subscription_id/);
    assert.match(source, /trial_period_days/);
    assert.match(source, /eligibleForTrial/);
  }
});

test("email delivery failures stay retryable and both notification times are configured", () => {
  assert.match(worker, /if \(result\.ok\) completed\.push\(notification\.id\)/);
  assert.match(worker, /return response\.ok\s*\? \{ ok: true/);
  assert.match(wrangler, /"0 8 \* \* \*"/);
  assert.match(wrangler, /"0 19 \* \* \*"/);
});

test("the consent version is recorded consistently and terms avoid a blanket injury exclusion", () => {
  const version = consent.match(/HEALTH_CONSENT_VERSION\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(version, "health consent version is missing");
  assert.match(migration, new RegExp(version!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(legal, /not liable for injury, loss or damage arising from following guidance/i);
});
