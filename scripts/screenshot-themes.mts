#!/usr/bin/env node
// =============================================================================
// Photograph the app in both themes, so somebody can look at it.
//
// WHY THIS EXISTS. The contrast tests prove every colour is READABLE. They
// cannot tell you it looks right, and the first light mode passed all of them
// while turning the brand's gold button into a muddy brown — because the one
// token was doing two jobs, a readable label on white and a recognisable gold
// fill, and only the first of those is a ratio.
//
// Nothing here asserts. It writes PNGs to look at, which is the part no test
// was ever going to do.
//
//   npm run build              # the pages come from out/
//   npx serve out -l 4173 &
//   PW_CHROMIUM=... npm run shots
// =============================================================================

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = "screenshots";
const BASE = process.env.SHOT_BASE ?? "http://localhost:4173";
const PAGES: [string, string][] = [
  ["landing", "/"],
  ["plans", "/plans/"],
  ["recipes", "/recipes/"],
  ["protein", "/cheapest-protein/"],
  ["collections", "/collections/"],
];

/**
 * Pages behind a login, which is most of the app and all of the screens people
 * report problems with.
 *
 * The session goes in localStorage where the client already looks for one and
 * Supabase is answered over the wire — the same trick e2e/signed-in.spec.ts
 * uses, and for the same reason: nothing in the app is mocked, so what gets
 * photographed is what deploys.
 */
const SIGNED_IN: [string, string][] = [
  ["training", "/coach/"],
  ["home", "/home/"],
  ["journal", "/journal/"],
  ["nutrition", "/nutrition/"],
];

const SUPABASE = "https://example.supabase.co";
const USER_ID = "00000000-0000-4000-8000-000000000001";

const PROFILE = {
  id: USER_ID, full_name: "E2E Athlete", role: "athlete", onboarded: true,
  sport: "football", position: "Centre-back", sex: "male", age: 24,
  health_data_consent: true,
  health_data_consent_at: "2026-08-18T00:00:00Z",
  // Must match HEALTH_CONSENT_VERSION or every page is the consent gate.
  health_data_consent_version: "2026-08-17",
};

const ROWS: Record<string, unknown[]> = {
  profiles: [PROFILE],
  // Without an active subscription every training screen is the paywall.
  subscriptions: [{
    user_id: USER_ID, tier: "gold", status: "active",
    stripe_customer_id: "cus_stub", stripe_subscription_id: "sub_stub",
    cancel_at_period_end: false, current_period_end: "2099-01-01T00:00:00Z",
  }],
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });

for (const theme of ["light", "dark"] as const) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // The same path an athlete takes: the boot script reads this before paint.
  await context.addInitScript((t) => {
    try { localStorage.setItem("pa-theme", t as string); } catch { /* private mode */ }
  }, theme);

  const page = await context.newPage();
  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    console.log(`${OUT}/${name}-${theme}.png`);
  }
  await context.close();

  // --- and the same pages behind a login ---------------------------------
  const signedIn = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signedIn.addInitScript((t) => {
    try { localStorage.setItem("pa-theme", t as string); } catch { /* private mode */ }
  }, theme);
  await signedIn.addInitScript(([key, value]) => {
    window.localStorage.setItem(key as string, value as string);
  }, ["sb-example-auth-token", JSON.stringify({
    access_token: "stub.access.token", refresh_token: "stub-refresh", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 86400, expires_in: 86400,
    user: {
      id: USER_ID, aud: "authenticated", role: "authenticated", email: "shots@example.com",
      created_at: "2026-08-01T00:00:00Z", app_metadata: {}, user_metadata: { full_name: "E2E Athlete" },
    },
  })] as const);

  const authed = await signedIn.newPage();
  await authed.route(`${SUPABASE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/auth/v1/user")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ id: USER_ID, email: "shots@example.com", aud: "authenticated" }) });
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
    const body = ROWS[table] ?? [];
    const wantsOne = (route.request().headers()["accept"] ?? "").includes("object");
    if (wantsOne) {
      const one = body[0];
      return one
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(one) })
        : route.fulfill({ status: 406, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  for (const [name, path] of SIGNED_IN) {
    await authed.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await authed.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
    console.log(`${OUT}/${name}-${theme}.png`);
  }
  await signedIn.close();
}

await browser.close();
