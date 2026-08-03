import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests.
 *
 * WHY THESE EXIST. Everything in `lib/` is pure and unit-tested to 98% — but
 * nothing checked that the app *boots*. A broken import, a bad provider order,
 * or a client component throwing on mount would pass 632 unit tests, pass
 * `next build`, and ship a white screen. That gap closed twice by luck this
 * week: a nav bug that only reproduced in a real browser, and a ring layout
 * whose overlap was invisible in the markup.
 *
 * WHAT THEY DELIBERATELY DON'T DO. No signed-in journeys. Auth is Supabase with
 * a real session in localStorage, and faking one in CI means either shipping a
 * test account's credentials or stubbing so much that the test stops resembling
 * the app. The authenticated shell is covered by unit tests plus the fact that
 * every gated page renders its header before the query resolves. These tests
 * cover the thing unit tests structurally cannot: does it load, does it hydrate,
 * is it accessible.
 *
 * The suite runs against the real static export in `out/`, not a dev server —
 * that is the artefact that actually ships, and `next dev` differs from it in
 * exactly the ways that hide bugs (no export-time prerender, different asset
 * paths, React strict-mode double-renders).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  // Serve the built export. `npm run build` must have run first; CI does it in
  // the same job so the tests and the deployed bundle are the same bytes.
  webServer: {
    command: "npx serve out -l 4321 --no-clipboard",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "on-first-retry",
    // The sandbox this repo is developed in ships Chromium at a fixed path and
    // blocks `playwright install`. CI has no such restriction, so honour the
    // override when it's set and use Playwright's own download otherwise.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },

  projects: [
    // A phone first, because that is what an athlete actually holds — and the
    // two real UI bugs this week were both mobile-only.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
