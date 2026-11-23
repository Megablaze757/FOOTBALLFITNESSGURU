import { test, expect, type Page, type Route } from "@playwright/test";

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

const SUPABASE = "https://example.supabase.co";
const USER_ID = "00000000-0000-4000-8000-000000000001";

/** An athlete who has consented, with sex recorded. See the note above. */
const PROFILE = {
  id: USER_ID,
  health_data_consent_at: "2026-01-01T00:00:00Z",
  sex: "female",
  sport: "football",
  distance_unit: "km",
  created_at: "2026-01-01T00:00:00Z",
};

async function signIn(page: Page) {
  const session = {
    access_token: "stub.access.token",
    refresh_token: "stub-refresh",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    expires_in: 60 * 60 * 24,
    user: {
      id: USER_ID, aud: "authenticated", role: "authenticated",
      email: "e2e@example.com", created_at: "2026-08-01T00:00:00Z",
      app_metadata: {}, user_metadata: {},
    },
  };
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    ["sb-example-auth-token", JSON.stringify(session)] as const,
  );
}

/** Every write to daily_check_ins, in order, as the browser sent it. */
type Sent = Record<string, unknown>[];

async function stub(page: Page): Promise<Sent> {
  const sent: Sent = [];
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.startsWith("/auth/v1/user")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ id: USER_ID, email: "e2e@example.com", aud: "authenticated" }),
      });
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];

    if (table === "daily_check_ins" && method === "POST") {
      try {
        const body = JSON.parse(route.request().postData() ?? "{}");
        sent.push(...(Array.isArray(body) ? body : [body]));
      } catch { /* recorded as nothing, which the assertions will show */ }
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }

    const rows = table === "profiles" ? [PROFILE] : [];
    const wantsOne = (route.request().headers()["accept"] ?? "").includes("object");
    if (wantsOne) {
      const one = rows[0];
      return one === undefined
        ? route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ message: "no rows" }) })
        : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
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

/**
 * The "Add PocketAthlete to your home screen" card sits over the bottom of the
 * form and swallows clicks meant for it.
 *
 * Dismissing it is what an athlete does, so the test does it too rather than
 * clicking through it with force: a forced click proves a button can be
 * dispatched at, not that somebody could press it. If this card ever covered a
 * control that could not be dismissed, that would be a real bug and forcing
 * the click is exactly what would hide it.
 */
async function dismissInstallPrompt(page: Page) {
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.count()) await notNow.first().click();
  await expect(notNow).toHaveCount(0);
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
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/auth/v1/user")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ id: USER_ID, email: "e2e@example.com", aud: "authenticated" }),
      });
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
    const rows = table === "profiles" ? [{ ...PROFILE, sex: "male" }] : [];
    const wantsOne = (route.request().headers()["accept"] ?? "").includes("object");
    if (wantsOne) {
      const one = rows[0];
      return one === undefined
        ? route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ message: "no rows" }) })
        : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.goto("/journal/", { waitUntil: "networkidle" });
  await expect(page.getByText("How many hours did you sleep?")).toBeVisible({ timeout: 15_000 });
  await dismissInstallPrompt(page);
  await page.getByRole("button", { name: /pain detail and sliders/i }).click();
  // The control the previous test found, on the form it must not appear on.
  await expect(page.getByText("Cycle phase")).toHaveCount(0);
});
