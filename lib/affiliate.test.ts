import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitCommission, chainFor, pctOf, wouldCycle, totalPayoutPct, poundsFromPennies,
  MAX_LEVEL, MAX_TOTAL_PCT, DEFAULT_RATES, estimateStripeFee, netAfterFee, type AffiliateNode,
} from "./affiliate";

const a = (id: string, over: Partial<AffiliateNode> = {}): AffiliateNode => ({
  id, code: id, parentId: null, ratePct: null, active: true, ...over,
});

function world(...nodes: AffiliateNode[]) {
  return {
    byId: new Map(nodes.map((n) => [n.id, n])),
    byCode: new Map(nodes.map((n) => [n.code, n])),
  };
}

// £20/month in pennies — the real subscription price.
const MONTH = 2000;

test("pctOf floors, never rounds up", () => {
  // Paying a fraction of a penny more than was earned is the error that stops
  // the ledger balancing.
  assert.equal(pctOf(2000, 20), 400);
  assert.equal(pctOf(333, 20), 66);   // 66.6 -> 66
  assert.equal(pctOf(1, 50), 0);
  assert.equal(pctOf(0, 20), 0);
  assert.equal(pctOf(-500, 20), 0, "a refund must not earn commission");
  assert.equal(pctOf(2000, 0), 0);
  assert.equal(pctOf(2000, -5), 0);
});

test("a direct referral earns the level-1 rate", () => {
  const w = world(a("x"));
  const lines = splitCommission({ referralCode: "x", paidPennies: MONTH, stripeFeePennies: 0, ...w });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 1);
  assert.equal(lines[0].ratePct, DEFAULT_RATES[1]);
  assert.equal(lines[0].amountPennies, 400); // 20% of £20, no fee
});

test("two levels both earn, from the same payment", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss" });
  // Fee pinned to zero so this exercises the rate split, not the fee maths.
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, stripeFeePennies: 0, ...world(boss, rep) });
  assert.deepEqual(lines.map((l) => [l.affiliateId, l.level, l.amountPennies]), [
    ["rep", 1, 400],  // 20%
    ["boss", 2, 100], // 5%
  ]);
});

test("the chain stops at the level cap", () => {
  const l3 = a("l3");
  const l2 = a("l2", { parentId: "l3" });
  const l1 = a("l1", { parentId: "l2" });
  const lines = splitCommission({ referralCode: "l1", paidPennies: MONTH, ...world(l1, l2, l3) });
  assert.equal(lines.length, MAX_LEVEL, "a third level must not be paid");
  assert.ok(!lines.some((l) => l.affiliateId === "l3"));
});

test("a custom rate applies to the direct referrer only", () => {
  // One person's negotiated deal must not inflate what their upline earns.
  const boss = a("boss", { ratePct: 90 });
  const rep = a("rep", { parentId: "boss", ratePct: 30 });
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) });
  assert.equal(lines[0].ratePct, 30, "direct referrer uses their own rate");
  assert.equal(lines[1].ratePct, DEFAULT_RATES[2], "upline uses the scheme rate, not their own 90%");
});

test("nothing is earned without a referral code", () => {
  const w = world(a("x"));
  assert.deepEqual(splitCommission({ referralCode: null, paidPennies: MONTH, ...w }), []);
  assert.deepEqual(splitCommission({ referralCode: "", paidPennies: MONTH, ...w }), []);
  assert.deepEqual(splitCommission({ referralCode: "unknown", paidPennies: MONTH, ...w }), []);
});

test("nothing is earned on a zero or negative payment", () => {
  // A free trial, a 100% discount, or a refund. Commission is a share of money
  // actually collected — that's the whole legal basis of the scheme.
  const w = world(a("x"));
  assert.deepEqual(splitCommission({ referralCode: "x", paidPennies: 0, ...w }), []);
  assert.deepEqual(splitCommission({ referralCode: "x", paidPennies: -2000, ...w }), []);
});

test("a paused affiliate earns nothing, and blocks the chain above them", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss", active: false });
  assert.deepEqual(splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) }), []);
});

test("an inactive upline stops the chain but the direct referrer still earns", () => {
  const boss = a("boss", { active: false });
  const rep = a("rep", { parentId: "boss" });
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].affiliateId, "rep");
});

test("you cannot earn commission on your own subscription", () => {
  // The first thing anybody tries.
  const me = a("me", { userId: "user-1" });
  const lines = splitCommission({
    referralCode: "me", paidPennies: MONTH, payerUserId: "user-1", ...world(me),
  });
  assert.deepEqual(lines, []);
});

test("nor on your recruit's subscription if you are the payer", () => {
  const boss = a("boss", { userId: "user-1" });
  const rep = a("rep", { parentId: "boss" });
  const lines = splitCommission({
    referralCode: "rep", paidPennies: MONTH, payerUserId: "user-1", ...world(boss, rep),
  });
  assert.deepEqual(lines, [], "the whole payment is void, not just the upline line");
});

test("a cycle in the hierarchy terminates instead of paying forever", () => {
  const x = a("x", { parentId: "y" });
  const y = a("y", { parentId: "x" });
  const w = world(x, y);
  assert.ok(chainFor("x", w.byCode, w.byId).length <= MAX_LEVEL);
  const lines = splitCommission({ referralCode: "x", paidPennies: MONTH, ...w });
  assert.ok(lines.length <= MAX_LEVEL);
  assert.equal(new Set(lines.map((l) => l.affiliateId)).size, lines.length, "nobody paid twice");
});

test("an affiliate is never paid twice for one payment", () => {
  const self = a("self", { parentId: "self" }); // their own parent
  const lines = splitCommission({ referralCode: "self", paidPennies: MONTH, ...world(self) });
  assert.equal(lines.length, 1);
});

test("wouldCycle catches direct, indirect and existing loops", () => {
  const x = a("x"), y = a("y", { parentId: "x" }), z = a("z", { parentId: "y" });
  const byId = new Map([["x", x], ["y", y], ["z", z]]);
  assert.ok(wouldCycle("x", "x", byId), "self-parenting");
  assert.ok(wouldCycle("x", "z", byId), "x under z would loop, since z is under x");
  assert.ok(!wouldCycle("z", "x", byId), "z under x is already the case and is fine");
  const q = a("q");
  byId.set("q", q);
  assert.ok(!wouldCycle("q", "x", byId), "an unrelated affiliate can be placed anywhere");
});

test("total payout stays inside the margin", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss" });
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) });
  // Measured against GROSS, because that's the question that matters: how much
  // of the headline price leaves the business. It's under the nominal 25%
  // precisely because the rates apply to the net.
  const pct = totalPayoutPct(lines, MONTH);
  assert.ok(pct < 25, `${pct}% — rates apply after Stripe's fee, so this must be under the nominal 25%`);
  // With the fee and the AI budget on a £20 subscription, much past a third
  // means the customer costs more than they bring in.
  assert.ok(pct <= 35, `paying out ${pct}% of revenue is more than the margin supports`);
});

test("a misconfigured rate cannot pay out more than came in", () => {
  // Defence in depth: the schema constrains rates, but a hand-run UPDATE
  // shouldn't be able to invent money.
  const greedy = a("greedy", { ratePct: 500 });
  const lines = splitCommission({ referralCode: "greedy", paidPennies: MONTH, ...world(greedy) });
  const total = lines.reduce((n, l) => n + l.amountPennies, 0);
  assert.ok(total <= MONTH, `paid out ${total} on a payment of ${MONTH}`);
  assert.equal(lines[0].ratePct, MAX_TOTAL_PCT, "clamped to the ceiling");
});

test("the ceiling trims the upline first, not the person who did the work", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss", ratePct: MAX_TOTAL_PCT });
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) });
  assert.equal(lines[0].ratePct, MAX_TOTAL_PCT, "the direct referrer keeps their full share");
  assert.equal(lines.length, 1, "there is nothing left for the upline, so no line is written");
});

test("total across all lines never exceeds the ceiling", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss", ratePct: 55 });
  const lines = splitCommission({ referralCode: "rep", paidPennies: MONTH, ...world(boss, rep) });
  const pct = lines.reduce((n, l) => n + l.ratePct, 0);
  assert.ok(pct <= MAX_TOTAL_PCT, `${pct}% exceeds the ${MAX_TOTAL_PCT}% ceiling`);
});

test("pennies format as pounds", () => {
  assert.equal(poundsFromPennies(400), "£4.00");
  assert.equal(poundsFromPennies(2000), "£20.00");
  assert.equal(poundsFromPennies(66), "£0.66");
  assert.equal(poundsFromPennies(0), "£0.00");
});

// --- Stripe fees -------------------------------------------------------------

test("commission comes off the net, not the headline price", () => {
  // £20 with a real fee of 50p leaves £19.50. 20% of that is £3.90, not £4.00.
  const lines = splitCommission({
    referralCode: "x", paidPennies: MONTH, stripeFeePennies: 50, ...world(a("x")),
  });
  assert.equal(lines[0].netPennies, 1950);
  assert.equal(lines[0].amountPennies, 390);
});

test("without a real fee, one is estimated rather than assumed zero", () => {
  const lines = splitCommission({ referralCode: "x", paidPennies: MONTH, ...world(a("x")) });
  assert.ok(lines[0].netPennies < MONTH, "a fee must always be deducted");
  assert.equal(lines[0].netPennies, MONTH - estimateStripeFee(MONTH));
});

test("the estimate matches Stripe's UK card pricing", () => {
  assert.equal(estimateStripeFee(2000), 50);  // 1.5% of £20 = 30p, + 20p
  assert.equal(estimateStripeFee(10000), 170); // 1.5% of £100 = £1.50, + 20p
  assert.equal(estimateStripeFee(0), 0);
});

test("a fee larger than the payment leaves nothing, never a negative", () => {
  assert.equal(netAfterFee(10, 50), 0);
  assert.equal(netAfterFee(10), 0, "the 20p fixed fee alone exceeds 10p");
  const lines = splitCommission({
    referralCode: "x", paidPennies: 10, stripeFeePennies: 50, ...world(a("x")),
  });
  assert.deepEqual(lines, [], "nobody earns on a payment that cost more to take");
});

test("an international card's higher fee reduces commission accordingly", () => {
  // 3.25% + 20p rather than 1.5% + 20p. Estimating would have overpaid here.
  const uk = splitCommission({ referralCode: "x", paidPennies: MONTH, stripeFeePennies: 50, ...world(a("x")) });
  const intl = splitCommission({ referralCode: "x", paidPennies: MONTH, stripeFeePennies: 85, ...world(a("x")) });
  assert.ok(intl[0].amountPennies < uk[0].amountPennies);
});

test("both levels are calculated on the same net figure", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss" });
  const lines = splitCommission({
    referralCode: "rep", paidPennies: MONTH, stripeFeePennies: 50, ...world(boss, rep),
  });
  assert.equal(lines[0].netPennies, lines[1].netPennies, "one payment, one net figure");
  assert.equal(lines[0].amountPennies, 390); // 20%
  assert.equal(lines[1].amountPennies, 97);  // 5% of 1950 = 97.5 -> 97
});

test("total payout still fits the margin once fees are taken", () => {
  const boss = a("boss");
  const rep = a("rep", { parentId: "boss" });
  const lines = splitCommission({
    referralCode: "rep", paidPennies: MONTH, stripeFeePennies: 50, ...world(boss, rep),
  });
  const paidOut = lines.reduce((n, l) => n + l.amountPennies, 0);
  const kept = MONTH - 50 - paidOut;
  assert.ok(kept > 0, "the business must keep something");
  assert.equal(kept, 1463); // £20 - 50p fee - £3.90 - 97p
});
