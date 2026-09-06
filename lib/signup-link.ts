/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE "SIGN UP FOR FREE TODAY" GOES. One place, because it is the site's
 * primary call to action and it is rendered on 859 pages.
 *
 * The site asked people to JOIN A WAITLIST — in the header of every public
 * page, and at the foot of every guide, recipe and exercise. That was right
 * before there was an app to sign up to and is a lost signup now: the door is
 * open and the sign on it said "come back later".
 *
 * THE DESTINATION IS NOT JUST "/login". Account creation lives on the login
 * page behind a toggle, and that page opens on SIGN IN — so a button reading
 * "Sign up for free today" that linked to /login would land a first-time
 * visitor on a form asking for a password they have never set. The query
 * string is what makes the button honest.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Account creation lives on the login page, behind a mode toggle. */
export const SIGNUP_PATH = "/login";

/** Opens that page on the create-account side rather than sign-in. */
export const SIGNUP_QUERY = "new";

/** The href for every "sign up" call to action on the public site. */
export const SIGNUP_HREF = `${SIGNUP_PATH}?${SIGNUP_QUERY}=1`;

/** The words. Full form for a section CTA with room around it. */
export const SIGNUP_CTA = "Sign up for free today";

/** For the header, where a long label wraps on a phone. */
export const SIGNUP_CTA_SHORT = "Sign up free";

/**
 * Whether the login page should open on the create-account form.
 *
 * THIS FLAG ONLY. Arriving with `?plan=` also opens sign-up, and that stays in
 * app/login/page.tsx where it belongs: it is not the same decision. That path
 * checks the plan is the one actually on sale and remembers which tier was
 * wanted, so an old `?plan=gold` link does not walk somebody into a signup
 * expecting a tier they can no longer buy. Folding it in here would quietly
 * drop both halves of that.
 *
 * Never throws. This parses whatever is in the address bar, and a malformed
 * query string is not a reason to fail to render a login page.
 */
export function wantsSignUp(search: string | null | undefined): boolean {
  try {
    const flag = new URLSearchParams(String(search ?? "").replace(/^\?/, "")).get(SIGNUP_QUERY);
    return flag !== null && flag !== "0" && flag !== "false";
  } catch {
    return false;
  }
}
