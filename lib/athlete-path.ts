// =============================================================================
// A PROFILE LINK THAT WORKS THE MOMENT SOMEBODY TURNS THEIR PAGE ON.
//
// ═══════════════════════════════════════════════════════════════════════════
// "THE SOCIAL PROFILES WE MADE DONT WORK."
//
// They did not, and the reason is structural rather than a broken query. This
// site is a STATIC EXPORT: /a/<username>/ exists only as a file, and that file
// is written at build time from whoever was public when the build ran. Turn
// your page on this afternoon and there is no file at your address — so the
// card shows you a URL, the "View it" button opens it, and GitHub Pages
// answers 404. Until somebody pushes a commit. Which might be days.
//
// Verified rather than assumed: out/a/ contained only the index and the miss
// page, and a real profile URL returned HTTP 404 on the live site.
//
// THE FIX IS THE 404 ITSELF. GitHub Pages serves 404.html for any path it does
// not have, and Next exports app/not-found.tsx as exactly that file — a full
// app shell that boots. So the 404 page can look at the address it was reached
// by, and if it is an athlete address, fetch that athlete and render the page.
// The URL is unchanged, so a link somebody shared still works and still points
// where they meant.
//
// The status code stays 404, which is the right trade rather than a
// compromise: a crawler should not index a page built from a client-side
// fetch, and every athlete who existed at build time has a REAL prerendered
// page with a 200 and its own metadata. This path is for the hours or days
// between publishing and the next build — which is a human reading a link, not
// a crawler.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * The username in an athlete address, or null.
 *
 * STRICT ON PURPOSE. This value is put into a database query and used to build
 * a URL, and it comes from the address bar — where anybody can type anything.
 * Usernames are `[a-z0-9_]` (see migration 0108's constraint), so anything
 * else is not a username and must not be treated as one.
 */
export function athleteFromPath(pathname: string): string | null {
  // String(), not `pathname || ""`. This is handed window.location.pathname in
  // production, but it is exported and called from tests and from a component
  // that reads a value it did not create — and `.toLowerCase()` on anything
  // that is not a string throws, from inside a parser whose whole job is to
  // say "no" to input it does not recognise.
  const match = /^\/a\/([a-z0-9_]{2,32})\/?$/.exec(String(pathname ?? "").toLowerCase());
  /**
   * No special case for the miss page, and that is deliberate rather than an
   * omission. MISS_PARAM is "not-found" with a HYPHEN, chosen for exactly this
   * reason: a hyphen cannot appear in a username, so the exported miss route
   * can never collide with somebody's address and this pattern can never match
   * it. A guard for it was written here and deleted — it compared against the
   * wrong string AND could not be reached, which is the worst kind of check.
   * lib/athlete-path.test.ts asserts the property instead.
   */
  return match ? match[1] : null;
}
