import { test, expect, type Page } from "@playwright/test";
import { SUPABASE, CONSENTED, signIn, stubSupabase, dismissInstallPrompt } from "./harness";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO PROMISES THE CHECK-IN MAKES ABOUT NOT LOSING YOUR WORK.
 *
 * components/JournalForm.tsx is built around them and says so at length:
 * everything typed is kept in a draft as you go ("a backgrounded mobile PWA
 * gets frozen"), and a save with no signal is queued on the device rather than
 * lost ("a gym in a basement has no signal, and losing the entry is the worst
 * possible outcome on a product built around a daily streak").
 *
 * Both are tested as pure functions — lib/drafts.ts and lib/offline-queue.ts
 * have thorough suites — and neither has ever been exercised through the form
 * in a browser. That gap is exactly where this kind of promise breaks: the
 * rules can be perfect while the component forgets to put a field in the draft
 * it saves, or reads one back under a different name. Nothing types-checks
 * that, because every field is optional.
 *
 * It is also where MY OWN CHANGE is least covered. Migration 0115's four
 * answers had to be threaded through the draft shape, the restore, the ref the
 * autosave reads, and the effect's dependency list. A field missed in any one
 * of those fails silently and only ever shows up as work that quietly was not
 * kept.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE OF THOSE FOUR CANNOT BE TESTED FROM HERE, AND SAYING SO IS BETTER THAN
 * IMPLYING OTHERWISE.
 *
 * Taking the new fields out of the autosave effect's DEPENDENCY LIST breaks
 * nothing these tests can see. Every other mutation tried — dropping them
 * from the draft shape, from the restore, from the dirty check, and from
 * "start fresh" — fails one of them.
 *
 * The reason is a second mechanism: the form also flushes the draft on
 * visibilitychange and pagehide, reading a ref rather than state precisely so
 * it cannot close over stale values. A reload fires pagehide, so the entry is
 * written on the way out whether or not the debounced timer was ever
 * scheduled. The dependency list is still right — a stale timer is a real
 * risk and the lint rule asks for it — but it is belt to the flush's braces,
 * and no test here can tell the two apart.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Fill in enough of the quick check-in to be worth keeping. */
async function fillQuickCheckIn(page: Page) {
  await page.getByRole("button", { name: "7 hrs" }).click();
  await page.getByRole("button", { name: "🙂 Well" }).click();
  await page.getByRole("button", { name: "🥱 Heavy" }).click();
}

/**
 * Wait for the form, whichever mode it opens in.
 *
 * NOT the quick mode's "How many hours did you sleep?", which is what this
 * was first written against and why two tests failed: the draft records where
 * the athlete WAS, so a reload after using the full form reopens the full
 * form, where that question is a number field labelled "Hours slept". The
 * heading is in both.
 */
async function waitForForm(page: Page) {
  await expect(page.getByRole("heading", { name: /today.s log/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Save today's log" })).toBeVisible({ timeout: 15_000 });
}

async function openJournal(page: Page) {
  await page.goto("/journal/", { waitUntil: "networkidle" });
  await waitForForm(page);
  await dismissInstallPrompt(page);
}

test("what you typed is still there after the app is closed and reopened", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [CONSENTED] } });
  await openJournal(page);

  await fillQuickCheckIn(page);
  // The autosave is debounced by 400ms; a slider drag would otherwise
  // serialise the whole form on every pixel.
  await page.waitForTimeout(900);

  // Not a soft navigation: a full reload is the closest this can get to the
  // app being killed in the background, which is the case the draft exists
  // for and the one a router push would not reproduce.
  await page.reload({ waitUntil: "networkidle" });
  await waitForForm(page);

  // Each answer comes back selected. aria-pressed rather than a colour: the
  // styling is a class string that a redesign changes and this does not.
  await expect(
    page.getByRole("button", { name: "7 hrs" }),
    "hours of sleep was not kept — check it is in the draft shape AND in the autosave's dependency list",
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "🙂 Well" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "🥱 Heavy" })).toHaveAttribute("aria-pressed", "true");

  // And it says so, rather than silently restoring and leaving somebody to
  // wonder why yesterday's answers are on screen.
  await expect(page.getByText(/picked up where you left off/i)).toBeVisible();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "START FRESH" HAS TO CLEAR EVERYTHING, AND IT DID NOT CLEAR MINE.
 *
 * The handler's own comment states the rule — "Someone who says 'no, start
 * again' must not have the draft re-saved from the state that's still on
 * screen" — and it reset the pain map, the three sliders, weight, match day
 * and the training log. Migration 0115 added four more answers and they were
 * not added here, so they stayed on screen after "start fresh" and the next
 * autosave wrote them straight back into the new draft. The one action
 * offered for getting rid of a restored entry left four of its answers
 * behind.
 *
 * Found by reading the markup while fixing a test assertion, which is worth
 * recording: the three restore tests above were all passing, because
 * restoring was the half that worked.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("start fresh clears the new answers too", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [CONSENTED] } });
  await openJournal(page);

  await page.getByRole("button", { name: "7 hrs" }).click();
  await page.getByRole("button", { name: /pain detail and sliders/i }).click();
  await page.getByRole("button", { name: "+ Add stress" }).click();
  await page.getByLabel("Stress", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Period" }).click();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await waitForForm(page);
  await dismissInstallPrompt(page);
  await page.getByRole("button", { name: "Start fresh" }).click();

  // Start fresh resets the POSITION as well as the values, so this lands back
  // in quick mode — where hours is the tap scale.
  await expect(
    page.getByRole("button", { name: "7 hrs" }),
    "hours of sleep survived start fresh",
  ).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: /pain detail and sliders/i }).click();
  await expect(
    page.getByRole("button", { name: "+ Add stress" }),
    "stress survived start fresh — the slider is still showing an answer",
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Period" }),
    "the cycle phase survived start fresh",
  ).toHaveAttribute("aria-pressed", "false");

  // And it does not come back: the state on screen must not be re-saved into
  // a brand new draft by the autosave that fires right after.
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: "networkidle" });
  await waitForForm(page);
  await expect(
    page.getByText(/picked up where you left off/i),
    "start fresh cleared the draft and the autosave wrote it straight back",
  ).toHaveCount(0);
});

test("the full form's answers are kept too, including the cycle phase", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [CONSENTED] } });
  await openJournal(page);

  await page.getByRole("button", { name: /pain detail and sliders/i }).click();
  await page.getByRole("button", { name: "+ Add soreness" }).click();
  await page.getByLabel("Soreness", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Luteal" }).click();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await waitForForm(page);

  // The draft records where they were, so this reopens in the full form
  // already — the mode is not remembered ACROSS days (a localStorage
  // preference used to do that and trapped people in it), but it is kept
  // within the one being filled in.
  await expect(
    page.getByRole("button", { name: /use the quick version/i }),
    "the reload did not come back in the full form, so the draft lost the athlete's position",
  ).toBeVisible();

  await expect(
    page.getByLabel("Soreness", { exact: true }),
    "soreness was not kept across a reload",
  ).toHaveValue("8");
  await expect(
    page.getByRole("button", { name: "Luteal" }),
    "the cycle phase was not kept across a reload",
  ).toHaveAttribute("aria-pressed", "true");
});

test("an untouched form does not pretend to restore anything", async ({ page }) => {
  // The other half, and the reason lib/drafts.ts has a dirty check at all:
  // opening the check-in and closing it again used to write a draft of
  // untouched defaults, so the next visit announced "restored from 2 hours
  // ago" over a form nobody had filled in.
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [CONSENTED] } });
  await openJournal(page);
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await waitForForm(page);

  await expect(
    page.getByText(/we restored|restored from/i),
    "an untouched form claimed to have restored something",
  ).toHaveCount(0);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BASEMENT. No signal, and the entry must not be lost.
 *
 * The form's own words: "losing the entry is the worst possible outcome on a
 * product built around a daily streak". It queues on the device and tells the
 * athlete their streak is safe — a promise made in the UI, so worth keeping
 * where it can be seen rather than only where it can be unit-tested.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a check-in with no signal is kept, and says so", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { rows: { profiles: [CONSENTED] } });
  await openJournal(page);
  await fillQuickCheckIn(page);

  // Cut the writes only. The page has already loaded; this is the gym, not a
  // cold start, and killing reads too would test a different thing.
  await page.route(`${SUPABASE}/rest/v1/daily_check_ins**`, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    return route.abort("internetdisconnected");
  });

  await page.getByRole("button", { name: "Save today's log" }).click();

  // The readiness score still appears, computed on-device: the only thing
  // waiting is the upload.
  await expect(page.getByText(/readiness/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/offline|saved on your phone|will upload/i).first(),
    "an entry was queued and the athlete was not told",
  ).toBeVisible();

  // And it is really on the device, not just a reassuring sentence.
  const queued = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const value = localStorage.getItem(key) ?? "";
      if (/check_in/.test(value) && /sleep_hours|sleep_quality/.test(value)) return value.slice(0, 400);
    }
    return null;
  });
  expect(queued, "nothing resembling a queued check-in is in localStorage").not.toBeNull();
  expect(queued, "the queued entry does not carry the hours that were tapped").toContain("sleep_hours");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND IT HAS TO COME BACK OUT AGAIN.
 *
 * The test above proves the entry is kept. Kept is only half the promise —
 * the screen says it "will upload automatically when you're back on signal",
 * and an entry that sits in localStorage for ever is lost with extra steps.
 *
 * components/PWA.tsx drains the queue on mount and on the browser's `online`
 * event. That path is the one migration 0115 changed: it writes through
 * upsertWithOptional now, splitting the four new columns out so a database
 * that has not had the migration applied cannot reject the row and strand it
 * until lib/offline-queue.ts's fourteen-entry cap drops it.
 *
 * Nothing had ever run it in a browser.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a queued check-in uploads when the signal comes back", async ({ page }) => {
  await signIn(page);
  const written: Record<string, unknown>[] = [];
  await stubSupabase(page, {
    rows: { profiles: [CONSENTED] },
    capture: { daily_check_ins: written },
  });
  await openJournal(page);
  await fillQuickCheckIn(page);

  // The basement. Writes only — the page is already loaded.
  let offline = true;
  await page.route(`${SUPABASE}/rest/v1/daily_check_ins**`, async (route) => {
    if (offline && route.request().method() !== "GET") return route.abort("internetdisconnected");
    return route.fallback();
  });

  await page.getByRole("button", { name: "Save today's log" }).click();
  await expect(page.getByText(/offline|saved on your phone|will upload/i).first()).toBeVisible();
  expect(written, "the write reached the database while it was supposed to be offline").toEqual([]);

  // Back on signal. The drain listens for the browser's own event, so that is
  // what gets fired — not an exported function reached into from the test,
  // which would prove the function works and not that anything calls it.
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect
    .poll(() => written.length, { timeout: 15_000, message: "the queued entry never uploaded" })
    .toBeGreaterThan(0);

  const row = written[written.length - 1];
  expect(row.sleep_quality, "the uploaded row is not the check-in that was queued").not.toBeUndefined();
  expect(row.sleep_hours, "the hours tapped before going offline did not survive the queue").toBe(7);
});

/**
 * THE DATABASE REFUSING THE NEW COLUMNS MUST NOT STRAND THE ENTRY.
 *
 * The window is real: the site deploys on a push and the SQL is applied by
 * hand afterwards, so for a while the browser knows about columns the
 * database has not got. PostgREST rejects the whole row, not the columns it
 * does not recognise — and in the queue that rejection is silent, retried
 * for ever, until the fourteen-entry cap pushes the entry off the end.
 *
 * `42703` is what Postgres says. The row should land the second time without
 * the four optional answers, which is a visible one-day loss rather than a
 * check-in that quietly never existed.
 */
test("an unmigrated database costs the new answers, not the check-in", async ({ page }) => {
  await signIn(page);
  const written: Record<string, unknown>[] = [];
  await stubSupabase(page, {
    rows: { profiles: [CONSENTED] },
    capture: { daily_check_ins: written },
  });
  await openJournal(page);
  await fillQuickCheckIn(page);

  // A database from before migration 0115: anything naming sleep_hours is
  // refused, exactly as PostgREST refuses an unknown column.
  await page.route(`${SUPABASE}/rest/v1/daily_check_ins**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    if ((req.postData() ?? "").includes("sleep_hours")) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "42703", message: 'column daily_check_ins.sleep_hours does not exist' }),
      });
    }
    return route.fallback();
  });

  await page.getByRole("button", { name: "Save today's log" }).click();

  // The check-in still saved, and the athlete sees their score.
  await expect(page.getByText(/readiness/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/could not be kept|ahead of its database/i),
    "the athlete was not told which answers did not save",
  ).toBeVisible();

  // Two attempts: the full row refused, then the settled columns on their own.
  const landed = written.filter((r) => !("sleep_hours" in r));
  expect(landed.length, `nothing was written without the new columns: ${JSON.stringify(written)}`)
    .toBeGreaterThan(0);
  expect(landed[0].sleep_quality, "the retry dropped more than the new columns").not.toBeUndefined();
  expect(landed[0].pain_map, "the retry dropped the pain map").not.toBeUndefined();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO FAILURES AT ONCE, WHICH IS THE ONE THAT LOSES THE ENTRY.
 *
 * Offline AND a database without migration 0115. Each alone is handled and
 * each alone is tested above — but they overlap exactly when it matters, in
 * the window between a deploy going out and the SQL being applied by hand,
 * which is also when somebody is in a gym with no signal.
 *
 * The queued payload carries the four new columns. If the replay sends them
 * whole, PostgREST refuses the row, components/PWA.tsx leaves the item for
 * next time, and lib/offline-queue.ts keeps only the last fourteen entries —
 * so it is retried silently, day after day, until it is pushed off the end
 * and gone. That is the failure the queue exists to prevent, caused by the
 * feature it was carrying.
 *
 * A mutation run is what put this test here: making the replay stop splitting
 * the payload broke nothing, because every other test gives it a database
 * that accepts everything.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a queued entry still lands when the database is behind the app", async ({ page }) => {
  await signIn(page);
  const written: Record<string, unknown>[] = [];
  await stubSupabase(page, {
    rows: { profiles: [CONSENTED] },
    capture: { daily_check_ins: written },
  });
  await openJournal(page);
  await fillQuickCheckIn(page);

  let offline = true;
  await page.route(`${SUPABASE}/rest/v1/daily_check_ins**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    if (offline) return route.abort("internetdisconnected");
    // Back on signal, onto a database from before 0115.
    if ((req.postData() ?? "").includes("sleep_hours")) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "42703", message: "column daily_check_ins.sleep_hours does not exist" }),
      });
    }
    return route.fallback();
  });

  await page.getByRole("button", { name: "Save today's log" }).click();
  await expect(page.getByText(/offline|saved on your phone|will upload/i).first()).toBeVisible();

  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // The entry lands without the four answers the database cannot take, rather
  // than being retried for ever and dropped.
  await expect
    .poll(() => written.filter((r) => !("sleep_hours" in r)).length,
          { timeout: 15_000, message: "the queued entry never landed: the replay sent the new columns and gave up" })
    .toBeGreaterThan(0);

  const landed = written.filter((r) => !("sleep_hours" in r))[0];
  expect(landed.sleep_quality, "the retry dropped more than the unmigrated columns").not.toBeUndefined();
  expect(landed.pain_map, "the retry dropped the pain map").not.toBeUndefined();
});
