import { test, expect, type Page } from "@playwright/test";
import { SUPABASE, USER_ID, CONSENTED, signIn, stubSupabase, dismissInstallPrompt } from "./harness";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHECK-IN'S NEW QUESTIONS, DRIVEN IN A BROWSER, AND WHAT THE FORM
 * ACTUALLY PUTS ON THE WIRE.
 *
 * Migration 0115 added four answers. The scoring is unit-tested to death and
 * none of those tests touch the thing most likely to be wrong: the WIRING.
 * Fifteen separate places in components/JournalForm.tsx had to learn about
 * these fields — state, the draft shape, the restore, the ref the autosave
 * reads, the effect's dependency list, the dirty check, the payload split and
 * the write. Every one of them typechecks whether or not it is correct, and a
 * field missed in the dependency list or the draft ref fails silently, as work
 * quietly not kept.
 *
 * So this asserts on the REQUEST BODY. Not on a React state hook, not on a
 * class name: on the JSON the browser sends to PostgREST, which is the only
 * thing that decides whether an answer was recorded.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT THE TEST signed-in.spec.ts ARGUES AGAINST.
 *
 * That file explains why there is no browser check of the reel's moves: a
 * stubbed athlete is always brand new, /journal opens on the consent gate, and
 * getting past it would mean "stubbing consent, preferences and seeded
 * check-ins until the test passed — at which point it asserts against a
 * fixture rather than the app".
 *
 * That reasoning is right and this test stays inside it. The fixture here is
 * ONE profile row: an athlete who has consented and whose sex is recorded.
 * That is not a rig, it is the ordinary state of everybody who uses this app —
 * the gate is a one-time thing. Nothing else is seeded, the form starts empty
 * as a real one does, and every assertion below is about what the app did
 * rather than about what was handed to it.
 *
 * If the gate ever needs more than this to clear, the right answer is to stop
 * and say so rather than to keep adding fixtures until it goes green.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Every write to daily_check_ins, in order, as the browser sent it. */
type Sent = Record<string, unknown>[];

async function stub(page: Page): Promise<Sent> {
  const sent: Sent = [];
  await stubSupabase(page, {
    rows: { profiles: [CONSENTED] },
    // The point of this file: assert on the JSON the browser sends, because
    // that is the only thing deciding whether an answer was recorded.
    capture: { daily_check_ins: sent },
  });
  return sent;
}

async function openCheckIn(page: Page) {
  await signIn(page);
  const sent = await stub(page);
  await page.goto("/journal/", { waitUntil: "networkidle" });
  // The gate renders a spinner while it reads the profile; the question below
  // is the first thing that proves the form itself is up.
  await expect(page.getByText("How many hours did you sleep?")).toBeVisible({ timeout: 15_000 });
  await dismissInstallPrompt(page);
  return sent;
}

async function save(page: Page) {
  // By its exact name. A loose /save|log/i matched "Log the session — it feeds
  // your training load" first in quick mode, so three tests clicked a prompt
  // and then waited for a write that was never going to happen.
  await page.getByRole("button", { name: "Save today's log" }).click();
}

test("the quick check-in asks for hours and sends what was tapped", async ({ page }) => {
  const sent = await openCheckIn(page);

  // Seven hours. One tap, which is the whole design of quick mode.
  await page.getByRole("button", { name: "7 hrs" }).click();
  await save(page);

  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const row = sent[sent.length - 1];
  expect(row.sleep_hours, `the tapped hours never reached the database: ${JSON.stringify(row)}`).toBe(7);
});

test("tapping the chosen hours again clears it, and nothing is invented", async ({ page }) => {
  const sent = await openCheckIn(page);

  // A question with no default has to be un-answerable, or a mis-tap becomes
  // an answer the athlete cannot take back.
  await page.getByRole("button", { name: "7 hrs" }).click();
  await page.getByRole("button", { name: "7 hrs" }).click();
  await save(page);

  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const row = sent[sent.length - 1];
  expect(row.sleep_hours, "a cleared answer was sent as a number anyway").toBeNull();
});

test("a check-in nobody answered the new questions on sends nulls, not guesses", async ({ page }) => {
  const sent = await openCheckIn(page);
  await save(page);

  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const row = sent[sent.length - 1];
  // The common case by far, and the one that must not quietly re-score the
  // app's whole history. Null, never 0 and never a middling 5.
  for (const field of ["sleep_hours", "stress_score", "soreness_score", "cycle_phase"]) {
    expect(row[field], `${field} was sent as ${JSON.stringify(row[field])} rather than null`).toBeNull();
  }
  // And the settled columns still went, so the split did not eat them.
  expect(row.sleep_quality).not.toBeUndefined();
  expect(row.fatigue_score).not.toBeUndefined();
});

test("the full form collects stress, soreness and the cycle phase", async ({ page }) => {
  const sent = await openCheckIn(page);

  await page.getByRole("button", { name: /pain detail and sliders/i }).click();

  await page.getByRole("button", { name: "+ Add soreness" }).click();
  await page.getByRole("button", { name: "+ Add stress" }).click();

  // Sliders open at 5; drag them somewhere unambiguous so a default cannot
  // pass for an answer.
  const soreness = page.getByLabel("Soreness", { exact: true });
  await soreness.fill("8");
  const stress = page.getByLabel("Stress", { exact: true });
  await stress.fill("3");

  await page.getByRole("button", { name: "Luteal" }).click();
  await save(page);

  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const row = sent[sent.length - 1];
  expect(row.soreness_score).toBe(8);
  expect(row.stress_score).toBe(3);
  expect(row.cycle_phase).toBe("luteal");
});

test("the cycle question is offered here, and can be dismissed for the day", async ({ page }) => {
  await openCheckIn(page);
  await page.getByRole("button", { name: /pain detail and sliders/i }).click();

  await expect(page.getByText("Cycle phase")).toBeVisible();
  await page.getByRole("button", { name: "Not today" }).click();
  await expect(page.getByText("Cycle phase")).toBeHidden();
});

test("a male profile is never shown the cycle question", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [{ ...CONSENTED, sex: "male" }] } });

  await page.goto("/journal/", { waitUntil: "networkidle" });
  await expect(page.getByText("How many hours did you sleep?")).toBeVisible({ timeout: 15_000 });
  await dismissInstallPrompt(page);
  await page.getByRole("button", { name: /pain detail and sliders/i }).click();
  // The control the previous test found, on the form it must not appear on.
  await expect(page.getByText("Cycle phase")).toHaveCount(0);
});
