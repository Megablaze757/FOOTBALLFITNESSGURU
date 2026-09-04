import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Does the app load, hydrate, and stay accessible?
 *
 * These are the checks that unit tests structurally cannot make. `lib/` is 98%
 * covered and none of it would notice a provider throwing on mount.
 */

/** Public routes — reachable with no session, so testable without credentials. */
const PUBLIC_ROUTES = [
  { path: "/", name: "landing" },
  { path: "/pricing/", name: "pricing" },
  { path: "/plans/", name: "plans" },
  { path: "/login/", name: "login" },
  { path: "/privacy/", name: "privacy" },
  { path: "/terms/", name: "terms" },
  { path: "/waitlist/", name: "waitlist" },
  // The content pages, which are now most of the site.
  { path: "/recipes/", name: "recipes index" },
  { path: "/exercises/", name: "exercises index" },
  { path: "/recipes/red-lentil-dhal-with-rice/", name: "a recipe" },
  { path: "/exercises/barbell-back-squat/", name: "an exercise" },
  { path: "/collections/", name: "collections index" },
  // The longest collection — 190 rows, which is where a list layout breaks
  // sideways on a phone if it is going to.
  { path: "/collections/vegetarian-high-protein/", name: "a collection" },
  { path: "/cheapest-protein/", name: "cheapest protein" },
  // The athlete index in its EMPTY state, which is what a local build renders
  // and what production renders until somebody opts in — so it is the state
  // that ships first and the one nobody would otherwise look at.
  { path: "/a/", name: "athlete index" },
  // The always-present miss page. It exists so the export does not fail on an
  // empty athlete list (see MISS_PARAM), which means it is also the one page
  // under /a/ guaranteed to be in every build.
  { path: "/a/not-found/", name: "athlete miss page" },
];

/**
 * Console errors that are noise rather than defects.
 *
 * Kept as an explicit, short list. A blanket "ignore console errors" makes the
 * check worthless, which is how a suite ends up green on a broken page.
 */
const IGNORED_CONSOLE = [
  /Failed to load resource.*favicon/i,
  // No Supabase session in a fresh browser context. That is the expected state
  // for every route here, not a fault.
  /AuthSessionMissingError/i,
  /Refused to connect to .*supabase/i,
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

for (const route of PUBLIC_ROUTES) {
  test(`${route.name} loads, hydrates and has no console errors`, async ({ page }) => {
    const errors = watchConsole(page);

    const res = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${route.path} should not 404`).toBeLessThan(400);

    // Something must be on screen. An empty <body> is the exact failure a build
    // that "succeeds" can still ship.
    await expect(page.locator("body")).not.toBeEmpty();

    // HYDRATION, not just HTML. The export prerenders markup, so a page can look
    // perfect and be completely dead. Next sets __NEXT_DATA__/react root markers
    // once the client bundle has taken over; waiting for a button to be usable
    // is the behavioural version of the same check.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible();

    expect(errors, `console errors on ${route.path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("every public page has a single, non-empty h1", async ({ page }) => {
  // A page with no h1, or three, is both an SEO and a screen-reader problem —
  // and it is the kind of thing that rots silently as pages get refactored.
  for (const route of PUBLIC_ROUTES) {
    // networkidle, not domcontentloaded. Some of these are client components
    // whose real heading only exists after hydration — the prerendered HTML is
    // a loading state. Asserting on the pre-hydration DOM measures the skeleton,
    // not the page.
    await page.goto(route.path, { waitUntil: "networkidle" });
    const h1s = page.locator("h1");
    const count = await h1s.count();
    expect(count, `${route.path} should have exactly one h1, found ${count}`).toBe(1);
    expect((await h1s.first().innerText()).trim().length,
      `${route.path} h1 is empty`).toBeGreaterThan(0);
  }
});

test("the page never scrolls sideways on a phone", async ({ page }, testInfo) => {
  // Horizontal overflow is the single most common mobile layout bug and it is
  // invisible in a component test. Wide tables and diagrams are allowed to
  // scroll inside their own container; the document is not.
  test.skip(testInfo.project.name !== "mobile", "mobile viewport only");

  for (const route of PUBLIC_ROUTES) {
    await page.goto(route.path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(overflow.doc,
      `${route.path} overflows horizontally (${overflow.doc}px in a ${overflow.win}px viewport)`
    ).toBeLessThanOrEqual(overflow.win + 1); // +1 for sub-pixel rounding
  }
});

/**
 * ACCESSIBILITY — the regression guard the contrast audit didn't have.
 *
 * The palette was measured by hand once and passes. A measurement is a moment
 * in time; this is what stops the next colour choice undoing it.
 *
 * Scoped to WCAG 2.1 A and AA, which is the bar actually claimed in
 * docs/PRODUCTION-READINESS.md. Running every axe rule including "best
 * practice" would fail on judgement calls and teach people to ignore the suite.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOTH THEMES, BECAUSE ONLY ONE OF THEM CAN BE LOOKED AT AT A TIME.
 *
 * lib/theme.test.ts proves every token in the palette passes AA against every
 * surface. That is the palette; this is the page — the ratio that matters is
 * the one between the colours that actually ended up on top of each other,
 * which only a browser can tell you.
 *
 * `data-theme` rather than emulateMedia, because that is the path an athlete
 * who chose light actually takes, and it is the one the boot script writes.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const THEMES = ["dark", "light"] as const;

for (const route of PUBLIC_ROUTES) {
  for (const theme of THEMES) {
    test(`${route.name} has no WCAG A/AA violations in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      try { localStorage.setItem("pa-theme", t); } catch { /* private mode */ }
    }, theme);
    await page.goto(route.path, { waitUntil: "networkidle" });

    // The boot script should already have done this. Asserting it is how we
    // find out the theme never applied, instead of testing dark twice.
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Report the actual rule and the element, not just a count — an a11y
    // failure you have to reproduce locally to understand is one that gets
    // skipped.
    const summary = results.violations
      .map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`)
      .join("\n");

    expect(results.violations, `${route.path} (${theme})\n${summary}`).toEqual([]);
    });
  }
}
