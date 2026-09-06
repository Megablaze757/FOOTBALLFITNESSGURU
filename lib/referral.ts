import { SIGNUP_HREF } from "./signup-link";
// Referral attribution: an affiliate's link carries ?ref=CODE. We stash the code
// in the browser on arrival and write it onto the profile at signup, so the
// admin panel can attribute each new client to whoever brought them in.

// Deliberately NOT renamed with the brand. This key lives in real browsers with
// real pending attributions in it; renaming it on every rebrand would silently
// drop affiliate credit for anyone mid-signup. The value is internal and never
// shown to a user.
const REF_KEY = "guru_ref";
const LEGACY_REF_KEY = "apex_ref";

/** Call on page load — persists ?ref=CODE so it survives the signup journey. */
export function captureRef(): void {
  if (typeof window === "undefined") return;
  const code = new URLSearchParams(window.location.search).get("ref");
  if (code) localStorage.setItem(REF_KEY, code.trim().slice(0, 40));
}

export function getRef(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REF_KEY) ?? localStorage.getItem(LEGACY_REF_KEY);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VISIT TO AN ATHLETE'S PAGE IS A REFERRAL, BUT ONLY IF NOTHING ELSE IS.
 *
 * /a/sam has no ?ref= on it — that is the point, the link stays short enough
 * to read off a screenshot — so the page credits `sam` itself.
 *
 * WRITES ONLY WHEN THE SLOT IS EMPTY, which is the whole guard. captureRef()
 * above is last-touch: every ?ref= it sees overwrites. If this behaved the same
 * way, somebody who clicked a paid affiliate's link and then happened to open
 * an athlete profile before signing up would have that affiliate's commission
 * silently replaced by a username that pays nobody. That is money leaving a
 * real person's account because of an incidental page view.
 *
 * So an explicit code always wins: on the profile page captureRef() runs first,
 * and if it wrote anything this does nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function setRefIfUnset(code: string): void {
  if (typeof window === "undefined") return;
  const clean = code.trim().slice(0, 40);
  if (!clean) return;
  if (getRef()) return;
  localStorage.setItem(REF_KEY, clean);
}

export function clearRef(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REF_KEY);
  localStorage.removeItem(LEGACY_REF_KEY);
}

function linkTo(page: string, code: string): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "";
  /**
   * `?` OR `&`, decided rather than assumed.
   *
   * This hard-coded `?ref=`, which was correct while every destination was a
   * bare path. The signup link carries `?new=1`, so the same line would have
   * produced "/login?new=1?ref=CODE" — a URL where `new` parses as
   * "1?ref=CODE" and `ref` does not parse at all. The affiliate would have
   * kept sharing it and quietly stopped being credited for anybody.
   */
  const join = page.includes("?") ? "&" : "?";
  return `${base}${path}${page}${join}ref=${encodeURIComponent(code)}`;
}

/** The shareable link for an affiliate code — lands on the marketing page. */
export function referralLink(code: string): string {
  return linkTo("/", code);
}

/**
 * Straight to the signup form.
 *
 * This pointed at /waitlist, which was right before launch: sending somebody
 * to the form they are meant to fill in converts better than hoping they
 * navigate to it. The form they are meant to fill in is the signup one now,
 * and an affiliate sending traffic to a waitlist is an affiliate paid for a
 * signup that did not happen.
 *
 * The landing link still works either way — the code is stashed on arrival and
 * survives the walk — but only if the visitor makes that walk.
 */
export function signupLink(code: string): string {
  return linkTo(SIGNUP_HREF, code);
}
