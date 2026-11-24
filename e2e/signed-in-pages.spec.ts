import { test, expect } from "@playwright/test";
import { freshAthlete, watchConsole, dismissInstallPrompt } from "./harness";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES EVERY PAGE BEHIND THE CONSENT GATE ACTUALLY RENDER?
 *
 * signed-in.spec.ts asks this of eight routes and makes the argument for why
 * it matters: a component that throws on mount, reads a field off a null row,
 * or renders a list before its query returns will pass every unit test, pass
 * `next build`, and ship a white screen to everybody who has an account and
 * nobody who does not.
 *
 * ITS ATHLETE NEVER GETS PAST THE CONSENT GATE. app/(app) wraps every page in
 * HealthConsentGate, which renders a consent screen until the profile has
 * `health_data_consent_at`. The fixture behind those eight routes has no
 * profile at all, so what they prove is that the GATE renders — eight times.
 *
 * The same file DOES go behind the gate, for one page: two tests give /coach a
 * consented, subscribed athlete and check that training with no program offers
 * a session. So this is nineteen pages that have never rendered their real
 * contents in a browser, not twenty — worth stating exactly, because "nothing
 * is tested" is the kind of claim that gets repeated and is nearly always too
 * strong.
 *
 * It still means "/journal renders for a signed-in athlete" has been green
 * throughout every change to the check-in, including the four questions added
 * this week, while never once rendering the form.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT COUNTS AS RENDERING, AND WHY THE ERROR BOUNDARY IS THE REAL TEST.
 *
 * Not "is there markup" — a thrown render produces plenty of markup, because
 * app/error.tsx catches it and draws a tidy "Something went wrong" card. That
 * page has a heading, a paragraph and two buttons, so every is-there-content
 * check passes on a page that is completely broken. This is not hypothetical:
 * it is what the whole app did when its build lacked NEXT_PUBLIC_SUPABASE_URL,
 * and it looked fine to anything not specifically looking for it.
 *
 * So: no error boundary, no console errors, no unhandled rejection, and real
 * text on the page — and the empty account is the state being rendered,
 * because "absent is not zero" is the bug family this codebase keeps meeting.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Every page an athlete reaches once they are signed in. */
const ROUTES = [
  { path: "/home/", name: "home" },
  { path: "/journal/", name: "today's log" },
  { path: "/body/", name: "body" },
  { path: "/library/", name: "library" },
  { path: "/dashboard/", name: "dashboard" },
  { path: "/nutrition/", name: "nutrition" },
  { path: "/history/", name: "history" },
  { path: "/rewards/", name: "rewards" },
  { path: "/profile/", name: "profile" },
  { path: "/coach/", name: "coach" },
  { path: "/squad/", name: "squad" },
  { path: "/plans/", name: "plans" },
  { path: "/train/", name: "train" },
  { path: "/report/", name: "weekly report" },
  { path: "/exercises/", name: "exercises" },
  { path: "/recipes/", name: "recipes" },
  { path: "/collections/", name: "collections" },
  { path: "/benchmarks/", name: "benchmarks" },
  { path: "/drills/", name: "drills" },
  { path: "/standards/", name: "standards" },
];

for (const route of ROUTES) {
  test(`${route.name} renders behind the consent gate with no data`, async ({ page }) => {
    const errors = watchConsole(page);
    await freshAthlete(page);

    await page.goto(route.path, { waitUntil: "networkidle" });
    // The gate shows a spinner while it reads the profile; give the page past
    // it before judging what is on screen.
    await page.waitForTimeout(1200);

    // THE ONE THAT MATTERS. app/error.tsx renders a complete, well-formed
    // page, so a check for "is there content" passes on a page that threw.
    await expect(
      page.getByRole("heading", { name: /something went wrong/i }),
      `${route.name} threw and rendered the error boundary`,
    ).toHaveCount(0);

    // And it is not still sitting on the consent screen, which would mean the
    // fixture stopped clearing the gate and every assertion here is about a
    // page nobody visited.
    await expect(
      page.getByRole("button", { name: /i agree|continue|accept/i }),
      `${route.name} is still on the consent gate — the fixture no longer clears it`,
    ).toHaveCount(0);

    const text = (await page.locator("body").innerText()).trim();
    expect(text.length, `${route.name} rendered an empty body`).toBeGreaterThan(40);

    expect(page.url(), `${route.name} redirected to login`).not.toContain("/login");
    expect(errors, `${route.name} logged console errors:\n${errors.join("\n")}`).toEqual([]);
  });
}

/**
 * The check on the check: this suite must be able to see a broken page.
 *
 * Every assertion above is a negative — no boundary, no errors, no redirect —
 * and a suite of negatives passes beautifully when it is looking at nothing at
 * all. A fixture that stopped clearing the gate, a route list that stopped
 * matching the app, a goto that silently 404s: each leaves twenty green ticks.
 *
 * So one page is broken on purpose, with the app untouched, and the boundary
 * has to appear. If this test ever passes while the twenty above also pass,
 * the twenty are not measuring what they claim.
 */
test("a page that throws is actually noticed", async ({ page }) => {
  await freshAthlete(page);

  // Break one thing the app reads on mount, before any of its code runs.
  await page.addInitScript(() => {
    const broken = () => { throw new Error("e2e: deliberately broken storage"); };
    Object.defineProperty(window, "localStorage", { get: broken, configurable: true });
  });

  await page.goto("/journal/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const brokenSomething =
    (await page.getByRole("heading", { name: /something went wrong/i }).count()) > 0 ||
    (await page.locator("body").innerText()).trim().length <= 40 ||
    page.url().includes("/login");

  expect(
    brokenSomething,
    "breaking localStorage outright changed nothing on the page, so the checks " +
    "above would not notice a page that threw either",
  ).toBe(true);
});

/**
 * The install card is dismissed here rather than left up, because this file is
 * about whether pages render and the other file is about what covers them.
 * Keeping the two questions apart means a failure here is never "something was
 * in the way".
 */
test("the pages still render once the install card is gone", async ({ page }) => {
  const errors = watchConsole(page);
  await freshAthlete(page);

  await page.goto("/home/", { waitUntil: "networkidle" });
  await dismissInstallPrompt(page);
  await page.waitForTimeout(500);

  await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
  expect(errors, `dismissing the card logged errors:\n${errors.join("\n")}`).toEqual([]);
});
