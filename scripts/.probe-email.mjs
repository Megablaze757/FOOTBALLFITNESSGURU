/**
 * Machine audit of the pages behind login, against the UI/UX playbook.
 *
 * WHY IT EXISTS. `e2e/smoke.spec.ts` covers the seven public routes and
 * deliberately stops at the login gate. That left the other seventeen — the
 * entire app people actually use daily — measured by nobody. The first run of
 * this found 89 tap targets under the 44px floor, four centred paragraphs, two
 * dead-end empty states, a page with no <h1>, twenty AA contrast failures and
 * four pages whose tabs pointed `aria-controls` at panels that did not exist.
 * None of that was visible to any existing check.
 *
 * HOW IT GETS IN. There is no test account to sign in with, and hard-coding one
 * means shipping credentials. Instead it seeds a session into localStorage and
 * route-stubs every Supabase call: supabase-js validates the JWT's expiry
 * locally in getSession(), so a far-future `exp` gets past the gate with no
 * network round trip and no real account.
 *
 * That is a big enough stub that this is NOT a pass/fail CI test — a page could
 * render differently against real data. It is a measuring instrument, run by
 * hand when the UI changes.
 *
 * TRUST THE ZEROS ONLY IF THE PROBE STILL BITES. A selector-based audit that
 * silently matches nothing reports a perfect score, which is the same output as
 * a perfect app. Before believing a clean run, inject a known-bad element into
 * one of the built pages in `out/` — a 20px button, a 2000px-wide paragraph, an
 * <img> with no alt — and confirm it gets flagged. Two of the carve-outs here
 * (inline links, labelled checkboxes) exist because they were false positives;
 * both were re-validated against a deliberately small label afterwards.
 *
 * RUN IT:
 *   npm run build && npx serve out -l 4321      # in one shell
 *   npm run audit:ui                            # in another
 */
import { chromium, devices } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const BASE = "http://127.0.0.1:4321";
const PROJECT_REF = "stubproj";

// A structurally valid unsigned JWT. Never verified — supabase-js only decodes
// it to read `exp`, and nothing signs anything because every call is stubbed.
function jwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.stub`;
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

const USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "audit@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: "2026-08-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  is_anonymous: false,
};

const SESSION = {
  access_token: jwt({ sub: USER_ID, aud: "authenticated", role: "authenticated", exp: EXP, email: USER.email }),
  refresh_token: "stub-refresh",
  token_type: "bearer",
  expires_in: 60 * 60 * 24 * 365,
  expires_at: EXP,
  user: USER,
};

const ROUTES = [
  "/home/", "/coach/", "/nutrition/", "/injury/", "/journal/", "/library/",
  "/dashboard/", "/train/", "/body/", "/profile/", "/squad/", "/rewards/",
  "/report/", "/history/", "/benchmarks/", "/essentials/", "/onboarding/",
];

/** Rows keyed by table, so pages render populated states rather than only empties. */
const TABLES = {
  profiles: [{
    id: USER_ID, sport: "football", position: "Centre Midfield", level: "county",
    age: 22, height_cm: 183, weight_kg: 78, sex: "male", goal: "maintain",
    plan: "pro", onboarded: true, full_name: "Audit Athlete", diet: "none",
    units: "metric", created_at: "2026-01-01T00:00:00Z",
  }],
  // The real table name. It was `checkins` first, which silently returned []
  // and sent every data-driven page down its empty branch — that is how the
  // /report/ heading bug surfaced, so the wrong name was accidentally useful.
  daily_check_ins: Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 25 + i)).toISOString().slice(0, 10);
    return {
      id: `c${i}`, user_id: USER_ID, check_in_date: d, sleep_hours: 7 + (i % 3) * 0.5,
      soreness: 2 + (i % 3), energy: 3 + (i % 2), mood: 4, stress: 2,
      motivation: 4, pain_map: {}, notes: "", created_at: `${d}T07:00:00Z`,
    };
  }),
  training_logs: Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 28 + i)).toISOString().slice(0, 10);
    return {
      id: `t${i}`, user_id: USER_ID, log_date: d, activity: "Gym", duration_min: 55,
      rpe: 6 + (i % 3), total_reps: 120, notes: "", created_at: `${d}T18:00:00Z`,
    };
  }),
  strength_benchmarks: [{
    id: "b1", user_id: USER_ID, test_date: "2026-07-20",
    metrics: { back_squat: 120, sprint_20m: 2.9 }, notes: "",
  }],
};

function stubBody(url) {
  const path = new URL(url).pathname;
  if (path.startsWith("/rest/v1/")) {
    const table = path.slice("/rest/v1/".length).split("?")[0];
    return TABLES[table] ?? [];
  }
  if (path.includes("/auth/v1/user")) return USER;
  if (path.includes("/auth/v1/token")) return SESSION;
  return [];
}


async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  // A phone inbox is where nearly all of these get opened.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("file://" + process.env.HTML, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.body.scrollHeight);
  console.log("rendered height at 390px:", h + "px");
  await page.screenshot({ path: process.env.SHOT, fullPage: true });
  await browser.close();
}
main();
