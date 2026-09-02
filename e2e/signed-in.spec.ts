import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Does the app work once somebody is signed in?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GAP THE SMOKE SUITE NAMES AND LEAVES OPEN.
 *
 * smoke.spec.ts says it deliberately covers no signed-in journeys, because auth
 * is a real Supabase session and faking one means either shipping a test
 * account's credentials or stubbing so much the test stops resembling the app.
 * It then reasons that the authenticated shell is covered by unit tests "plus
 * the fact that every gated page renders its header before the query resolves".
 *
 * That last clause is an assumption, and it is the assumption worth testing —
 * because everything an athlete actually uses is behind it. A component that
 * throws on mount, reads a field off a null row, or renders a list before its
 * query returns will pass every unit test, pass `next build`, and ship a white
 * screen to everybody who has an account and nobody who does not.
 *
 * THERE IS A THIRD OPTION the original reasoning missed: stub the NETWORK, not
 * the app. Supabase is reached over HTTPS, so the session goes in localStorage
 * where the client already looks for it and the REST calls are intercepted and
 * answered with fixtures. Nothing in the app is mocked, no credentials are
 * shipped, and the code under test is the same bytes that deploy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUPABASE = "https://example.supabase.co";
const USER_ID = "00000000-0000-4000-8000-000000000001";

/** Routes an athlete spends their time on. Everything here was changed recently. */
const SIGNED_IN_ROUTES = [
  { path: "/home/", name: "home" },
  { path: "/journal/", name: "today's log" },
  { path: "/body/", name: "body" },
  { path: "/library/", name: "library" },
  { path: "/dashboard/", name: "dashboard" },
  { path: "/nutrition/", name: "nutrition" },
  { path: "/history/", name: "history" },
  { path: "/rewards/", name: "rewards" },
];

const IGNORED_CONSOLE = [
  /Failed to load resource.*favicon/i,
  // The fixture user is not a real Supabase user, so anything that insists on
  // re-validating the token server-side will say so. That is the stub's
  // boundary, not a defect in the page.
  /AuthSessionMissingError/i,
  /Refused to connect/i,
  /\[push\]/i,
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

/**
 * A session the client will accept, in the place it looks for one.
 *
 * localStorage rather than a cookie: this app deliberately uses the implicit
 * flow with localStorage persistence — see lib/supabase/client.ts, which
 * explains at length why it is not using @supabase/ssr. A cookie would test
 * nothing.
 */
async function signIn(page: Page) {
  const key = `sb-example-auth-token`;
  const session = {
    access_token: "stub.access.token",
    refresh_token: "stub-refresh",
    token_type: "bearer",
    // Far enough out that SessionKeepalive does not try to renew it mid-test.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    expires_in: 60 * 60 * 24,
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "e2e@example.com",
      created_at: "2026-08-01T00:00:00Z",
      app_metadata: {},
      user_metadata: { full_name: "E2E Athlete" },
    },
  };
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [key, JSON.stringify(session)] as const,
  );
}

/**
 * Answer Supabase over the wire.
 *
 * EVERY TABLE RETURNS AN EMPTY LIST BY DEFAULT, and that is the point rather
 * than laziness: a brand new account IS empty, it is the state every athlete
 * passes through exactly once, and "absent is not zero" is the bug family this
 * codebase keeps meeting. A page that renders a number from an empty table, or
 * throws reading a field off a row that is not there, fails here.
 */
async function stubSupabase(page: Page, rows: Record<string, unknown[]> = {}) {
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.startsWith("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: USER_ID, email: "e2e@example.com", aud: "authenticated" }),
      });
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    // PostgREST: /rest/v1/<table>. An RPC is /rest/v1/rpc/<name>.
    const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
    const body = rows[table] ?? [];
    // maybeSingle() sends Accept: application/vnd.pgrst.object+json and treats
    // an array as a shape error, so single-row requests get an object or 406.
    const wantsOne = (route.request().headers()["accept"] ?? "").includes("object");
    if (wantsOne) {
      const one = (body as unknown[])[0];
      return one === undefined
        ? route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ message: "no rows" }) })
        : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

for (const route of SIGNED_IN_ROUTES) {
  test(`${route.name} renders for a signed-in athlete with no data`, async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page);
    await stubSupabase(page);

    await page.goto(route.path, { waitUntil: "networkidle" });

    // Not a white screen: something with words in it is on the page.
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length, `${route.name} rendered an empty body`).toBeGreaterThan(40);

    // And it did not bounce to the login page, which would mean the session
    // shape the app writes is not the shape it reads.
    expect(page.url(), `${route.name} redirected to login`).not.toContain("/login");

    expect(errors, `${route.name} logged errors:\n${errors.join("\n")}`).toEqual([]);
  });
}

/**
 * The empty state is the FIRST state, and it is the one nobody looks at.
 *
 * Every athlete sees these screens with no rows behind them exactly once, on
 * the day they sign up — which is the day the app can least afford to look
 * broken. See lib/first-week.ts for what that day is worth.
 */
test("a brand new athlete's log offers something to do rather than a blank", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page);
  await page.goto("/journal/", { waitUntil: "networkidle" });

  const text = await page.locator("body").innerText();
  expect(text, "the empty log says nothing at all").toMatch(/log|sleep|today/i);
});

test("the body page survives having no weights at all", async ({ page }) => {
  const errors = watchConsole(page);
  await signIn(page);
  await stubSupabase(page);
  await page.goto("/body/", { waitUntil: "networkidle" });

  // The trend panel must not render a rank, a delta or a NaN off an empty
  // series — it should simply not be there.
  await expect(page.locator("body")).not.toContainText("NaN");
  expect(errors, errors.join("\n")).toEqual([]);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A BRAND NEW ATHLETE ACTUALLY MEETS FIRST.
 *
 * Written expecting the exercise catalogue and finding neither it nor an error:
 * the first screen behind a fresh session is an install-the-app prompt stacked
 * on a health-data consent wall, on every page, before any content at all.
 *
 * Both are legitimate — the consent gate is a legal requirement and the install
 * prompt is how a PWA gets onto a phone — and neither is a bug. But this is the
 * screen the entire first-week effort in lib/first-week.ts is trying to get
 * somebody past, and nobody had looked at it. Pinned here so a change to the
 * order is a decision rather than an accident.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the first screen is the consent gate, and it says what it is for", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page);
  await page.goto("/library/", { waitUntil: "networkidle" });

  const text = await page.locator("body").innerText();
  expect(text, "the consent gate no longer explains itself").toMatch(/health.*data|your choice/i);
  // It must name what it collects rather than asking for a blank cheque.
  expect(text).toMatch(/sleep|pain|injury|training/i);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAINING, WITH NO PLAN, IS NOT AN EMPTY ROOM.
 *
 * Reported as "when I click Training without a plan I can't access none of
 * the features". It was a program builder and nothing else: somebody who
 * wanted to train TODAY was offered a four-week commitment or a blank screen.
 *
 * A consented, subscribed athlete with no program is the exact state this is
 * about, and it is the state every new athlete passes through.
 */
const CONSENTED = {
  id: USER_ID, full_name: "E2E Athlete", role: "athlete", onboarded: true,
  sport: "football", position: "Centre-back", sex: "male", age: 24,
  health_data_consent: true,
  health_data_consent_at: "2026-08-18T00:00:00Z",
  health_data_consent_version: "2026-08-17",
};

const SUBSCRIBED = {
  user_id: USER_ID, tier: "gold", status: "active",
  stripe_customer_id: "cus_stub", stripe_subscription_id: "sub_stub",
  cancel_at_period_end: false, current_period_end: "2099-01-01T00:00:00Z",
};

test("training with no program offers a session you can do today", async ({ page }) => {
  const errors = watchConsole(page);
  await signIn(page);
  await stubSupabase(page, { profiles: [CONSENTED], subscriptions: [SUBSCRIBED] });
  await page.goto("/coach/", { waitUntil: "networkidle" });

  // Both errands, not just the four-week one.
  await expect(page.getByText("Give me a session for today")).toBeVisible();
  await expect(page.getByText("Just log what you did")).toBeVisible();

  // And it has to actually produce one — a button that builds nothing is the
  // same empty room with an extra tap in it.
  await page.getByText("Give me a session for today").click();
  const session = page.locator("text=/not saved/i");
  await expect(session).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body, "the generated session listed no drills").toMatch(/×|x\s?\d|reps|sets|m\b/i);

  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

test("the one-off session says it is not saved, before it is gone", async ({ page }) => {
  await signIn(page);
  await stubSupabase(page, { profiles: [CONSENTED], subscriptions: [SUBSCRIBED] });
  await page.goto("/coach/", { waitUntil: "networkidle" });
  await page.getByText("Give me a session for today").click();

  // A session that vanishes without warning reads as lost work, and the way
  // to keep it has to be offered where the warning is.
  const note = page.locator("text=/This one is not saved/i");
  await expect(note).toBeVisible();
  await expect(page.getByRole("link", { name: /Log what you do/i })).toBeVisible();
});
