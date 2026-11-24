import { type Page, type Route } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE SIGNED-IN HARNESS, USED BY EVERY SPEC THAT NEEDS ONE.
 *
 * Three files were each carrying their own copy of the session fixture and the
 * Supabase route handler — forty-odd lines apiece, differing in small ways
 * that nobody chose. The third copy is where that stops being duplication and
 * starts being a liability: the day one of them learns something (a new table
 * that must answer, a header the client started sending), the others quietly
 * test a different app.
 *
 * Nothing here is mocked in the app itself. Supabase is reached over HTTPS, so
 * the session goes in localStorage where the client already looks for it and
 * the REST calls are answered over the wire. The code under test is the same
 * bytes that deploy — see the long note at the top of signed-in.spec.ts, which
 * is where this approach is argued for.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SUPABASE = "https://example.supabase.co";
export const USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * A profile that has cleared the consent gate.
 *
 * NOT A RIG, AND WORTH BEING CLEAR ABOUT WHY. app/(app) wraps every page in
 * HealthConsentGate, which renders a consent screen until
 * `health_data_consent_at` is set. So a fixture without it tests the gate, not
 * the page behind it — which is how /journal came to have no browser coverage
 * of its actual contents at all, despite being in the signed-in route list.
 *
 * Consenting once is what every athlete who uses this app has done. One field,
 * and the pages behind it become reachable.
 */
export const CONSENTED = {
  id: USER_ID,
  health_data_consent_at: "2026-01-01T00:00:00Z",
  sex: "female",
  sport: "football",
  distance_unit: "km",
  created_at: "2026-01-01T00:00:00Z",
};

/**
 * A session the client will accept, in the place it looks for one.
 *
 * localStorage rather than a cookie: this app deliberately uses the implicit
 * flow with localStorage persistence — see lib/supabase/client.ts, which
 * explains at length why it is not using @supabase/ssr. A cookie would test
 * nothing.
 */
export async function signIn(page: Page) {
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
    ["sb-example-auth-token", JSON.stringify(session)] as const,
  );
}

export interface StubOptions {
  /** Rows to answer with, by table name. Anything unnamed answers empty. */
  rows?: Record<string, unknown[]>;
  /** Collects every row written to these tables, for assertions on the wire. */
  capture?: Record<string, Record<string, unknown>[]>;
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
export async function stubSupabase(page: Page, options: StubOptions = {}) {
  const { rows = {}, capture } = options;

  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

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

    /**
     * CORS PREFLIGHT, ANSWERED AND NEVER RECORDED.
     *
     * The browser sends OPTIONS before a cross-origin write, and an OPTIONS
     * has no body. Capturing every non-GET swept those in as `{}` and the
     * assertions then read an empty object as "the answer never arrived" —
     * eight tests failing on requests that are not writes at all.
     */
    if (method === "OPTIONS") {
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        },
        body: "",
      });
    }

    /**
     * ONLY METHODS THAT CARRY ROWS ARE RECORDED.
     *
     * `method !== "GET"` swept in two kinds of bodiless request and recorded
     * each as `{}`: the CORS preflight above, and the HEAD that
     * `select(..., { count: "exact", head: true })` sends — components/
     * FeatureTip.tsx counts check-ins that way on every page load. An
     * assertion reading the last captured row then saw an empty object and
     * reported that the athlete's answer never arrived.
     */
    const writesRows = method === "POST" || method === "PATCH" || method === "PUT";
    if (method !== "GET") {
      if (capture && capture[table] && writesRows) {
        try {
          const body = JSON.parse(route.request().postData() ?? "{}");
          capture[table].push(...(Array.isArray(body) ? body : [body]));
        } catch {
          // Left unrecorded on purpose: a caller asserting on these rows will
          // see an empty list and say so, which is more useful than a throw
          // inside a route handler that Playwright reports as a timeout.
        }
      }
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }

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

/** Signed in, consented, and holding no data — the first day of an account. */
export async function freshAthlete(page: Page, options: StubOptions = {}) {
  await signIn(page);
  await stubSupabase(page, {
    ...options,
    rows: { profiles: [CONSENTED], ...(options.rows ?? {}) },
  });
}

/**
 * Console errors worth failing on.
 *
 * The exclusions are the stub's own boundary rather than things being swept
 * under: the fixture user is not a real Supabase user, so anything that
 * re-validates the token server-side complains, and the push subscription
 * cannot work against a stub.
 */
export const IGNORED_CONSOLE = [
  /Failed to load resource.*favicon/i,
  /AuthSessionMissingError/i,
  /Refused to connect/i,
  /\[push\]/i,
];

export function watchConsole(page: Page): string[] {
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
 * The install card covers the bottom of the screen until it is dismissed.
 *
 * Dismissed the way an athlete does, not clicked through with `force`: a
 * forced click proves a button can be dispatched at, not that somebody could
 * press it. e2e/no-blocked-controls.spec.ts is the file that cares about that
 * distinction, and it exists because this card was eating taps.
 */
export async function dismissInstallPrompt(page: Page) {
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.count()) await notNow.first().click();
}
