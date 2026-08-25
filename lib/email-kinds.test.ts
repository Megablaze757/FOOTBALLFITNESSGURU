import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMAIL_KINDS, emailKindOf, countByKind } from "./email-kinds";

const row = (over: Partial<{ trigger_kind: string | null; email_category: string | null; status: string }> = {}) =>
  ({ trigger_kind: null, email_category: null, status: "sent", ...over });

/**
 * TWO DIFFERENT THINGS WERE SHOWN IN ONE COLUMN, which is why it never read
 * clearly. `trigger_kind` says WHY it was sent — that is what somebody means by
 * "what type of email". `email_category` is the unsubscribe bucket, a
 * preference switch rather than a description, and only answers when there was
 * no notification behind the send.
 */
test("the reason wins over the bucket", () => {
  assert.equal(emailKindOf(row({ trigger_kind: "check_in_reminder", email_category: "essential" })).label,
    "Check-in reminder");
  assert.equal(emailKindOf(row({ email_category: "weekly" })).label, "Weekly digest");
});

test("a send with nothing recorded says so rather than showing a dash", () => {
  assert.equal(emailKindOf(row()).label, "Unrecorded");
  assert.equal(emailKindOf(row({ trigger_kind: "  " })).label, "Unrecorded");
});

/**
 * THE WORKER SHIPS SEPARATELY AND IS ROUTINELY AHEAD OF THIS APP. A kind added
 * there must not render as a blank cell — humanising the key is right often
 * enough to be useful and is never worse than the key itself.
 */
test("a kind this app has never heard of is humanised, not dropped", () => {
  const unknown = emailKindOf(row({ trigger_kind: "referral_bonus_awarded" }));
  assert.equal(unknown.label, "Referral bonus awarded");
  assert.equal(unknown.id, "referral_bonus_awarded");
  assert.match(unknown.when, /not described in this app yet/i);
});

test("every described kind is distinct and says when it goes out", () => {
  assert.equal(new Set(EMAIL_KINDS.map((k) => k.id)).size, EMAIL_KINDS.length, "duplicate ids");
  for (const k of EMAIL_KINDS) {
    assert.match(k.id, /^[a-z_]+$/, `${k.id} is not a stored key`);
    assert.ok(k.label && k.label !== k.id, `${k.id} has no human label`);
    assert.ok(k.when.length > 10, `${k.id} does not say when it is sent`);
  }
});

// --- counting -----------------------------------------------------------------

test("counts group by kind, most first", () => {
  const counts = countByKind([
    row({ trigger_kind: "check_in_reminder" }),
    row({ trigger_kind: "check_in_reminder" }),
    row({ trigger_kind: "weekly_summary" }),
  ]);
  assert.equal(counts[0].kind.id, "check_in_reminder");
  assert.equal(counts[0].total, 2);
  assert.equal(counts[1].kind.id, "weekly_summary");
});

/**
 * "We sent 200 check-in reminders" and "we attempted 200 and 190 bounced" are
 * the same number and opposite situations — and the second is the whole reason
 * to open this screen.
 */
test("failures are counted apart from sends, and sort to the top", () => {
  const counts = countByKind([
    ...Array.from({ length: 5 }, () => row({ trigger_kind: "weekly_summary" })),
    row({ trigger_kind: "billing", status: "bounced" }),
  ]);
  assert.equal(counts[0].kind.id, "billing", "the failing kind is what you came to see");
  assert.equal(counts[0].failed, 1);
  assert.equal(counts[0].sent, 0);
  assert.equal(counts[1].sent, 5);
  assert.equal(counts[1].failed, 0);
});

test("every failure status counts as a failure", () => {
  for (const status of ["failed", "bounced", "complained"]) {
    assert.equal(countByKind([row({ trigger_kind: "billing", status })])[0].failed, 1, status);
  }
  for (const status of ["sent", "delivered", "attempted", "delayed", "skipped"]) {
    assert.equal(countByKind([row({ trigger_kind: "billing", status })])[0].failed, 0, status);
  }
});

test("no rows is an empty list, not a crash", () => {
  assert.deepEqual(countByKind([]), []);
  assert.deepEqual(countByKind(undefined as never), []);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LIST HAS TO DESCRIBE THE WORKER THAT IS ACTUALLY DEPLOYED.
 *
 * Every kind the Worker names in NOTIFICATION_CTA is one it can send, so an
 * admin can see it in the audit. If this app has no description for one, the
 * screen shows a humanised key — survivable, but it means the list has gone
 * stale, and stale is how a screen stops being trusted.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every kind the Worker can send is described here", () => {
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const block = /const NOTIFICATION_CTA[^{]*\{([\s\S]*?)\n\};/.exec(worker);
  assert.ok(block, "NOTIFICATION_CTA is gone from the Worker — this test needs updating with it");

  const kinds = [...block[1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
  assert.ok(kinds.length >= 8, `only found ${kinds.length} kinds — the scanner is probably broken`);

  const described = new Set(EMAIL_KINDS.map((k) => k.id));
  const missing = kinds.filter((k) => !described.has(k));
  assert.deepEqual(missing, [], `the Worker sends kinds this screen cannot name: ${missing.join(", ")}`);
});

/** And the same for the delivery buckets it stamps on a send. */
test("every email_category the Worker stamps is described here", () => {
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  const cats = [...worker.matchAll(/email_category:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(cats.length > 0, "no categories found — the scanner is probably broken");

  const described = new Set(EMAIL_KINDS.map((k) => k.id));
  const missing = [...new Set(cats)].filter((c) => !described.has(c));
  assert.deepEqual(missing, [], `the Worker stamps categories this screen cannot name: ${missing.join(", ")}`);
});
