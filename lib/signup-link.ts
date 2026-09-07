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
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SAME CALL TO ACTION, OUT LOUD, BECAUSE THE REELS WERE NOT MAKING ONE.
 *
 * Every reel ended on the front page in silence with a card on it, and the
 * voice asked for nothing at any point — which is the whole of "the scripts
 * feel unpromotional". A reel can be watched to the end and still leave the
 * viewer with no idea what the thing is called or where it is, and that is a
 * reel that spent thirty seconds teaching somebody else's audience.
 *
 * The published guidance on short-form is blunt about it: the CTA is the beat
 * creators skip and the one that decides whether a view becomes anything.
 *   — stratboost.ai/blogs/ai-script-templates-2026-viral-structure
 *   — automateed.com/content-hooks-for-short-form-videos
 *
 * ONE CONSTANT, NOT FOUR HAND-WRITTEN SIGN-OFFS. Four reels with four endings
 * is four chances to drift, and a sign-off only builds recognition if it is
 * the same sign-off. lib/reel-script.ts refuses to build a script that does
 * not end on this line.
 *
 * SPOKEN, so it is contracted and short: this is read aloud over the last two
 * seconds of footage, not set in a button.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ONE SENTENCE, WHICH IS WHY IT IS PUNCTUATED LIKE THIS.
 *
 * The first draft was "PocketAthlete. It's free. Link's in the bio." — three
 * SENTENCES, and lib/caption-lines.ts never merges those, because the voice
 * pauses between them. Three captions, each floored at MIN_CAPTION_MS whether
 * it needs it or not: seven words cost 4.8 seconds on a reel with a 30-second
 * ceiling. As one sentence it costs 3.0.
 *
 * It still comes out as TWO captions, not one — fitSentence breaks on the
 * comma even though the whole thing fits in a line — and that is fine. The
 * expensive thing was the full stops, not the commas.
 */
export const SIGNUP_SPOKEN = "PocketAthlete, free, link in the bio.";

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
