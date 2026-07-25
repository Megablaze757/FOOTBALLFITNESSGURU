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

export function clearRef(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REF_KEY);
  localStorage.removeItem(LEGACY_REF_KEY);
}

function linkTo(page: string, code: string): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${base}${path}${page}?ref=${encodeURIComponent(code)}`;
}

/** The shareable link for an affiliate code — lands on the marketing page. */
export function referralLink(code: string): string {
  return linkTo("/", code);
}

/**
 * Straight to the waitlist, for sharing before launch. The landing link works
 * too — the code is stashed on arrival and survives the walk to /waitlist — but
 * only if the visitor makes that walk. Pre-launch, sending them to the form
 * they're meant to fill in converts far better than hoping they navigate.
 */
export function waitlistLink(code: string): string {
  return linkTo("/waitlist", code);
}
