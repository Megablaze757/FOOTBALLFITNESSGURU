// =============================================================================
// Who has a page, asked once at build time.
//
// Separate from lib/public-profile.ts because that one is pure and this one
// talks to the network — so the shaping rules stay testable without a fetch,
// and this file stays small enough to read in one go.
// =============================================================================

import { publishable, type PublicAthlete } from "./public-profile";

/**
 * The opted-in athletes, or none.
 *
 * NEVER THROWS. A local build points NEXT_PUBLIC_SUPABASE_URL at a placeholder
 * and this call fails; a CI build without the variable set has nothing to call
 * at all. Either must produce a site with no athlete pages rather than no site
 * — the profiles are an addition to the export, and an addition that can break
 * the build is a bad trade for a page.
 *
 * Cached for the process, because generateStaticParams and generateMetadata
 * both ask, and a build should not make the same request twice per athlete.
 */
let cached: Promise<PublicAthlete[]> | null = null;

export function publicAthletes(): Promise<PublicAthlete[]> {
  cached ??= fetchPublicAthletes();
  return cached;
}

/**
 * The URL to ask, or null for "do not ask".
 *
 * Pulled out of the fetch so the decision is testable without a network call,
 * because the decision is the part that has a wrong answer. `example.supabase.co`
 * is the placeholder every local and e2e build uses: it resolves, so the fetch
 * does not fail fast — it hangs on DNS or returns somebody else's 404, and a
 * build that waits on that is a build that looks broken.
 */
export function athletesUrl(
  url: string | undefined,
  key: string | undefined,
): string | null {
  if (!url || !key) return null;
  if (url.includes("example.supabase.co")) return null;
  return `${url.replace(/\/$/, "")}/rest/v1/public_athletes`
    + "?select=username,sport,position,xp,created_at&order=xp.desc&limit=5000";
}

async function fetchPublicAthletes(): Promise<PublicAthlete[]> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const endpoint = athletesUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, key);
  if (!endpoint || !key) return [];

  try {
    const res = await fetch(
      endpoint,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      // Loud in the build log, quiet in the output. A missing view or a policy
      // that says no is worth seeing in CI; it is not worth failing a deploy of
      // 820 other pages.
      console.warn(`public_athletes: HTTP ${res.status} — no athlete pages in this build`);
      return [];
    }
    return publishable(await res.json());
  } catch (e) {
    console.warn(`public_athletes: ${e instanceof Error ? e.message : e} — no athlete pages in this build`);
    return [];
  }
}
