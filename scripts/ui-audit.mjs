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
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });

  // Every Supabase call, plus the Worker API, answered locally.
  await ctx.route("**://*.supabase.co/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(stubBody(route.request().url())),
    });
  });

  await ctx.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    [`sb-${PROJECT_REF}-auth-token`, SESSION]
  );

  const results = [];

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      results.push({ route, error: "navigation timeout" });
      await page.close();
      continue;
    }

    /**
     * WAIT FOR FONTS BEFORE MEASURING ANYTHING.
     *
     * This tool reported two undersized tap targets on one run and zero on the
     * next, with no code change in between — which makes every number it prints
     * suspect. The cause was measuring mid-layout: a control whose height is
     * exactly the 44px floor comes back as 43.99 while a fallback font is still
     * in place, and rounds to "44" in the output, so the report looked like a
     * contradiction rather than a timing bug.
     *
     * A flaky measuring instrument is worse than none: it trains you to ignore
     * it.
     */
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(150);

    // Did we actually get in, or bounce to /login?
    const landed = new URL(page.url()).pathname;
    const gated = landed.includes("/login");

    const audit = await page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
      };
      const text = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 46);

      // --- Playbook: tap targets. 48px ideal, 44px is this codebase's floor. ---
      const small = [];
      for (const el of document.querySelectorAll('a, button, [role="button"], input[type="checkbox"], input[type="radio"], select, summary')) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        // A link inside a sentence is prose, not a control — excluding it is
        // the same carve-out WCAG 2.5.8 makes for inline targets.
        const inline = el.tagName === "A" && el.closest("p, li, span");
        if (inline && r.height < 30) continue;
        // A checkbox wrapped in its <label> is not a 20px target: the whole
        // label is clickable, and that is what a thumb actually hits. Measure
        // the label instead, or this reports every well-built checkbox in the
        // app as a failure and the real ones get lost in the noise.
        const lab = el.closest("label");
        if (lab) {
          const lr = lab.getBoundingClientRect();
          if (lr.height >= 44 && lr.width >= 44) continue;
        }
        // Half a pixel of tolerance. An element with `min-height: 44px` can
        // measure 43.996 at a 2.625x device pixel ratio — that is layout
        // rounding, not a design failure, and flagging it buries the real ones.
        // Deliberately small: 2px of slack would start hiding genuine misses.
        const FLOOR = 43.5;
        if (r.height < FLOOR || r.width < FLOOR) {
          small.push({ h: +r.height.toFixed(2), w: +r.width.toFixed(2), t: text(el), tag: el.tagName });
        }
      }

      // --- Playbook: line length 45-75 characters. ---
      const longLines = [];
      for (const el of document.querySelectorAll("p, li, dd, blockquote")) {
        if (!vis(el)) continue;
        if (el.querySelector("p, li, div")) continue;
        const t = (el.innerText || "").trim();
        if (t.length < 90) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        const w = el.getBoundingClientRect().width;
        // ~0.5em per character is the standard approximation for a proportional face.
        const chars = Math.round(w / (fs * 0.5));
        if (chars > 75) longLines.push({ chars, w: Math.round(w), fs, t: text(el) });
      }

      // --- Playbook: proximity. A label must sit nearer its own field than the previous one. ---
      const proximity = [];
      for (const lab of document.querySelectorAll(".field-label, label")) {
        if (!vis(lab)) continue;
        const lr = lab.getBoundingClientRect();
        const field = lab.parentElement?.querySelector("input, select, textarea, .field");
        if (!field || !vis(field)) continue;
        const fr = field.getBoundingClientRect();
        const gapBelow = fr.top - lr.bottom;
        if (gapBelow < 0 || gapBelow > 24) continue;
        proximity.push({ gap: Math.round(gapBelow), t: text(lab) });
      }

      // --- Playbook: centre-aligned long text is hard to read. ---
      const centred = [];
      for (const el of document.querySelectorAll("p, li, h1, h2, h3")) {
        if (!vis(el)) continue;
        if (getComputedStyle(el).textAlign !== "center") continue;
        const t = (el.innerText || "").trim();
        if (t.length > 90) centred.push({ len: t.length, t: text(el) });
      }

      // --- Bare empty states: a dead end with no way forward. ---
      const empties = [];
      // A lone em-dash is the app's "not measured" placeholder inside a
      // labelled stat cell, not an empty state — the label next to it carries
      // the meaning. Matching it flagged five populated cards as dead ends.
      const EMPTY_RE = /^(no |nothing |none\b|empty\b)/i;
      for (const el of document.querySelectorAll("p, div, span, li")) {
        if (!vis(el)) continue;
        if (el.children.length > 0) continue;
        const t = (el.innerText || "").trim();
        if (t.length === 0 || t.length > 70) continue;
        if (!EMPTY_RE.test(t)) continue;
        // A CTA nearby is what turns a dead end into a next step.
        const scope = el.closest("div, section, li") || el;
        const cta = scope.querySelector("a, button");
        empties.push({ t, cta: !!cta });
      }

      // --- Horizontal scroll: the whole page sliding sideways on a phone. ---
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1
        ? { scrollW: document.documentElement.scrollWidth, inner: window.innerWidth }
        : null;

      const h1s = [...document.querySelectorAll("h1")].filter(vis).map(text);

      return { small, longLines, proximity, centred, empties, overflow, h1s };
    });

    // The signed-in half of the app has never been scanned. `e2e/smoke.spec.ts`
    // runs axe over the seven public routes and structurally cannot reach these
    // — which is most of the app, and all of the part people use daily.
    let axe = [];
    try {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      axe = r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
    } catch (e) {
      axe = [{ id: `axe failed: ${String(e).slice(0, 80)}`, impact: "error", n: 0 }];
    }

    results.push({ route, gated, landed, axe, consoleErrors: consoleErrors.slice(0, 3), ...audit });
    await page.close();
  }

  await browser.close();

  // ---- Report ----
  let totals = { small: 0, longLines: 0, centred: 0, empties: 0, overflow: 0, gated: 0, axe: 0 };
  for (const r of results) {
    if (r.error) { console.log(`\n### ${r.route}  ERROR: ${r.error}`); continue; }
    if (r.gated) { totals.gated++; console.log(`\n### ${r.route}  BOUNCED TO ${r.landed}`); continue; }
    const issues =
      r.small.length + r.longLines.length + r.centred.length + r.axe.length +
      r.empties.filter((e) => !e.cta).length + (r.overflow ? 1 : 0);
    console.log(`\n### ${r.route}   ${issues === 0 ? "clean" : issues + " issue(s)"}   h1=${JSON.stringify(r.h1s)}`);
    if (r.consoleErrors.length) console.log(`  console: ${r.consoleErrors.join(" | ").slice(0, 200)}`);
    if (r.overflow) { totals.overflow++; console.log(`  OVERFLOW scrollW=${r.overflow.scrollW} viewport=${r.overflow.inner}`); }
    for (const s of r.small) { totals.small++; console.log(`  TAP  ${String(s.h).padStart(3)}x${String(s.w).padStart(4)}  <${s.tag.toLowerCase()}> ${s.t}`); }
    for (const l of r.longLines) { totals.longLines++; console.log(`  LINE ${l.chars}ch @${l.fs}px w=${l.w}  ${l.t}`); }
    for (const c of r.centred) { totals.centred++; console.log(`  CENTRED ${c.len} chars  ${c.t}`); }
    for (const e of r.empties) if (!e.cta) { totals.empties++; console.log(`  EMPTY no-CTA  "${e.t}"`); }
    // Every page needs exactly one. Zero leaves a screen reader nothing to land
    // on; two means the page is claiming to be two documents.
    if (r.h1s.length !== 1) { totals.h1 = (totals.h1 ?? 0) + 1; console.log(`  H1 COUNT ${r.h1s.length}`); }
    for (const a of r.axe) { totals.axe++; console.log(`  AXE  ${a.impact}  ${a.id}  ×${a.n}`); }
  }
  console.log(`\n===== TOTALS ${JSON.stringify(totals)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
