import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAN EVERY BUTTON ON THE PAGE ACTUALLY BE PRESSED?
 *
 * Not "is it in the DOM", not "is it visible" — can a finger land on it. A
 * control can render perfectly, pass every unit test and photograph fine in a
 * screenshot while something floating above it eats the tap.
 *
 * THIS IS NOT HYPOTHETICAL AND IT HAS HAPPENED TWICE, in opposite directions,
 * to the same element. components/PWA.tsx shows an install card fixed near the
 * bottom of the screen. It first sat UNDER the tab bar, where its own "Not
 * now" could not be pressed — the comment in that file records the fix.
 * Raising it above the bar made it pressable and put it over the end of every
 * page instead, which is worse: what it covers there is the thing the page is
 * for.
 *
 * Measured on a Pixel 7, scrolled to the bottom of /journal, that card took
 * the tap meant for "Save today's log". An athlete fills in their check-in,
 * presses save, and nothing happens — on the one screen the whole product is
 * a daily habit around, for every phone visitor who had not dismissed the
 * card, which is every new one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW IT CHECKS, AND WHY THAT WAY.
 *
 * elementFromPoint at the centre of each control, which is what the browser
 * itself does with a tap. If what comes back is not that control, something is
 * over it. No guessing at z-index, no list of known overlays: a new floating
 * thing is caught the day it is added.
 *
 * Scrolled to the BOTTOM, because that is where fixed furniture lives and
 * where the submit buttons end up. A page checked at the top passes while its
 * last control is buried.
 *
 * Three things are deliberately not failures. A control genuinely off-screen
 * is not blocked, it is somewhere else. A control covered by its own
 * descendant is a tap that still reaches it. And an open modal is SUPPOSED to
 * cover the page — none of these pages opens one, so nothing is excluded for
 * it here, and if one ever does the right answer is to close it in the test
 * rather than to loosen this.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUPABASE = "https://example.supabase.co";
const USER_ID = "00000000-0000-4000-8000-000000000001";

/** Consented so the pages render, and nothing else. See checkin-questions.spec.ts. */
const PROFILE = {
  id: USER_ID,
  health_data_consent_at: "2026-01-01T00:00:00Z",
  sex: "female",
  sport: "football",
  distance_unit: "km",
  created_at: "2026-01-01T00:00:00Z",
};

/** Where an athlete spends their time, and where a blocked tap would cost most. */
const PAGES = ["/journal/", "/home/", "/nutrition/", "/body/", "/dashboard/"];

async function signedIn(page: Page) {
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
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
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
}

/**
 * Controls that Playwright itself refuses to click.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS WAS HAND-ROLLED GEOMETRY THREE TIMES AND WAS WRONG THREE TIMES.
 *
 *  1. Hit-testing at one scroll position reported everything under the sticky
 *     header — true at that instant, meaningless to a user with a thumb.
 *  2. `scrollIntoView({ block: "center", inline: "center" })` scrolled NOTHING
 *     on this page: `main` has `overflow-x: clip`, which gives it a scrollable
 *     inline axis, so `inline: "center"` took the call and the block axis
 *     never moved. Two controls were then hit-tested off-screen and reported
 *     as blocked. The app was fine; the probe was broken.
 *  3. Scrolling the document by hand fixed that and still mis-reported, this
 *     time because `elementFromPoint` returned `body` for a control whose
 *     rectangle said it was right there — a clipped ancestor, a stale frame,
 *     or something else I would have had to keep digging to name.
 *
 * Every one of those cost more time than the bug did, and the last one would
 * have shipped a test that fails for a reason nobody could explain. So the
 * question goes to the code that already answers it: `click({ trial: true })`
 * runs Playwright's full actionability check — visible, stable, enabled, and
 * RECEIVES POINTER EVENTS — and performs no click. It scrolls the way a real
 * click scrolls and it knows what "covered" means, which is the whole of what
 * this file is asking.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function unclickable(page: Page) {
  const out: string[] = [];
  const controls = page.locator('button:visible, a[href]:visible, [role="button"]:visible');
  const n = await controls.count();
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    const label = ((await el.textContent()) ?? "").trim().replace(/\s+/g, " ").slice(0, 40)
      || (await el.getAttribute("aria-label")) || `control ${i}`;
    try {
      // Short, because a control that is reachable is reachable at once. The
      // only thing a long timeout buys here is a slow suite.
      await el.click({ trial: true, timeout: 1500 });
    } catch {
      /**
       * THE TAB BAR HIDES ITSELF ON THE WAY DOWN, on purpose — it slides to
       * translate-y-[150%] while scrolling down and comes back on the way up.
       * This loop scrolls, so by the time it reaches the bar the four primary
       * destinations are legitimately off-screen, and a first pass reported
       * "Training, Food, Recovery, Progress" as unclickable on two pages.
       * That is the designed behaviour, not a defect, and reporting it would
       * have been the fourth false alarm from this file.
       *
       * So anything that fails gets one more go from the top of the page,
       * where nothing is hidden by scroll position. What still refuses there
       * is genuinely unreachable.
       */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);  // the bar's 200ms slide, twice over
      try {
        await el.click({ trial: true, timeout: 2000 });
      } catch {
        out.push(label);
      }
    }
  }
  return out;
}

/**
 * The page really can be scrolled, checked before anything is judged.
 *
 * A scroll that silently does nothing made the previous version of this file
 * report two controls as unreachable when they were simply off-screen. If the
 * document cannot move, every result below is meaningless and should say so
 * rather than read as a list of bugs.
 */
async function assertScrolls(page: Page) {
  const moved = await page.evaluate(async () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return "short";          // nothing to scroll; fine
    window.scrollTo(0, max);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const at = Math.round(window.scrollY);
    window.scrollTo(0, 0);
    return at > 0 ? "yes" : "no";
  });
  expect(moved, "the document would not scroll, so no reachability result here means anything")
    .not.toBe("no");
}

for (const path of PAGES) {
  test(`nothing covers a control on ${path} with the install card up`, async ({ page }) => {
    await signedIn(page);
    await page.goto(path, { waitUntil: "networkidle" });

    // The card is the thing under test, so make sure it is actually there —
    // otherwise this passes by testing a page with no overlay on it.
    const card = page.getByText("Add PocketAthlete to your home screen");
    await expect(card, "the install card did not appear, so this proves nothing").toBeVisible({ timeout: 15_000 });

    // The shell's padding grows by the card's measured reach; let the
    // ResizeObserver and the resulting reflow settle before measuring.
    await page.waitForTimeout(500);
    await assertScrolls(page);

    const blocked = await unclickable(page);
    expect(
      blocked,
      `Playwright refuses to click these on ${path}, with the install card up:\n` +
      blocked.map((b) => `  "${b}"`).join("\n"),
    ).toEqual([]);
  });
}

/**
 * The one that broke first, kept as its own test because it is the one whose
 * failure means an install prompt nobody can get rid of.
 */
test("the install card's own buttons can be pressed", async ({ page }) => {
  await signedIn(page);
  await page.goto("/journal/", { waitUntil: "networkidle" });

  const notNow = page.getByRole("button", { name: "Not now" });
  await expect(notNow).toBeVisible({ timeout: 15_000 });
  await notNow.click(); // unforced: a forced click would prove nothing
  await expect(page.getByText("Add PocketAthlete to your home screen")).toHaveCount(0);
});


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO THINGS THE FIX IS, AND WHICH ONE DOES WHICH JOB.
 *
 * Mutation-tested until the answer stopped moving, and it moved twice.
 *
 * `pointer-events: none` on the card's wrapper is what makes the taps work.
 * Removing it alone fails the checks above. It covers even the case geometry
 * cannot: /journal has controls that overflow main's box by about 50px, so no
 * scroll position clears a fixed card and only falling through does.
 *
 * MOVING THE CARD DOES NOT MAKE ANY TAP WORK — with the pointer events gone
 * through, the card at its old bottom-28 passes every check here. It is still
 * right, for a reason this file cannot test: a button you cannot SEE is not a
 * button you can press, and at bottom-28 the card sat squarely on top of the
 * floating Home link. So that is pinned by geometry instead, below.
 *
 * A third thing was written and then deleted: room reserved on the document
 * for the card's measured height, with a ResizeObserver behind it. Once the
 * pointer events were right, nothing could make its absence fail — so it was
 * forty lines claiming to protect something already protected. Unverified
 * protection reads as considered and nothing says when it stops working.
 *
 * WHAT NEITHER FIXES, also measured: a card forced to 420px on an 839px screen
 * buries the middle of the form whatever it does with pointer events, because
 * the athlete cannot see what they are tapping. That is a card that must never
 * be half the screen — a different rule, and not one this file can enforce.
 * The real card is 198px.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the card lets taps through to the page beneath it", async ({ page }) => {
  await signedIn(page);
  await page.goto("/journal/", { waitUntil: "networkidle" });
  await expect(page.getByText("Add PocketAthlete to your home screen")).toBeVisible({ timeout: 15_000 });

  const through = await page.evaluate(() => {
    const el = document.querySelector('div.fixed.z-\\[70\\]') as HTMLElement | null;
    return el ? getComputedStyle(el).pointerEvents : "missing";
  });
  expect(through, "the card swallows taps on its own surface again").toBe("none");
});

test("the card does not sit on top of the floating Home button", async ({ page }) => {
  await signedIn(page);
  await page.goto("/journal/", { waitUntil: "networkidle" });
  await expect(page.getByText("Add PocketAthlete to your home screen")).toBeVisible({ timeout: 15_000 });

  // Both are fixed, so this is true at every scroll position or none.
  const overlap = await page.evaluate(() => {
    const card = document.querySelector('div.fixed.z-\\[70\\]');
    const home = [...document.querySelectorAll("a")].find(
      (a) => getComputedStyle(a).position === "fixed" && /^home$/i.test(a.getAttribute("aria-label") ?? ""));
    if (!card || !home) return { found: false };
    const c = card.getBoundingClientRect(), h = home.getBoundingClientRect();
    return {
      found: true,
      overlaps: c.bottom > h.top && c.top < h.bottom && c.right > h.left && c.left < h.right,
      card: { top: Math.round(c.top), bottom: Math.round(c.bottom) },
      home: { top: Math.round(h.top), bottom: Math.round(h.bottom) },
    };
  });

  expect(overlap.found, "no floating Home button found, so this proves nothing").toBe(true);
  expect(
    overlap.overlaps,
    `the install card covers the Home button: card ${JSON.stringify(overlap.card)}, ` +
    `home ${JSON.stringify(overlap.home)}. Taps fall through, but nobody can see what they are aiming at.`,
  ).toBe(false);
});
