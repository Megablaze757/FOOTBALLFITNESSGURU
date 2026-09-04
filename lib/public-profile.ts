// =============================================================================
// The athlete page: /a/<username>.
//
// ═══════════════════════════════════════════════════════════════════════════
// PRE-RENDERED FROM THE DATABASE AT BUILD TIME, WHICH IS AN UNUSUAL THING TO
// DO AND THE ONLY THING THAT WORKS HERE.
//
// The site is `output: "export"`. There is no server, so a page per athlete
// cannot be rendered on request — and the alternatives are worse: a
// query-string page (/a?u=sam) is one URL to a crawler however many athletes
// exist, and a 404-rewritten SPA route serves a 404 status to the crawler that
// is meant to index it.
//
// So the build asks the database who has opted in and writes one static page
// each. They are real, fast, indexable pages. The cost is that a new athlete's
// page appears at the next deploy rather than the moment they tick the box,
// which is a fair trade for a page that costs nothing to serve and cannot be
// slow.
//
// A BUILD WITHOUT CREDENTIALS MUST STILL BUILD. Local builds point at a
// placeholder Supabase URL, so the fetch fails — and a failed fetch here must
// produce no pages, never a broken build. See fetchPublicAthletes.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { sportLabel, trimToMeta } from "./seo";
import type { SportId } from "./exercises";

export interface PublicAthlete {
  /**
   * The display name AND the URL. There is no separate handle: the username is
   * the one name on the profiles table the person chose knowing it was a name,
   * and full_name is deliberately never published. A `handle` column derived
   * from the username shipped first and made the page print the same string
   * twice under two labels.
   */
  username: string;
  sport: string | null;
  position: string | null;
  xp: number;
  created_at: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE PAGE UNDER /a/ THAT IS NOT AN ATHLETE.
 *
 * `output: "export"` will not build a dynamic route whose generateStaticParams
 * returns an empty list — Next.js reports it as "missing generateStaticParams()"
 * and the whole export fails. And an empty list is the NORMAL case: every local
 * build points at a placeholder Supabase URL, every e2e build does, and
 * production does too until the first person ticks the box. So a feature that
 * nobody has opted into yet would break every build of the site.
 *
 * One page always exists, therefore. It is the miss state — "no public page at
 * that address" — which is a page worth having anyway: a profile that was
 * public last month and is not today leaves links behind, and an explanation
 * beats a 404.
 *
 * A HYPHEN IS WHAT MAKES IT SAFE. Usernames are [a-z0-9_] by the check
 * constraint in migration 0047, so no athlete can ever hold this address and
 * shadow it — or be shadowed by it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MISS_PARAM = "not-found";

/** A username as it may appear in a URL. Matches the profiles check constraint. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;

export function isPublicUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value) && !value.includes("__");
}

/**
 * Rows the build may publish, filtered again on this side.
 *
 * The view already excludes anybody who has not opted in — this is the second
 * check, on the shape rather than the permission. A row whose username could
 * not appear in a URL is a row that would produce a page nobody can reach, and
 * one whose username is missing entirely is a bug upstream that should not
 * become a page called "/a/undefined".
 */
export function publishable(rows: unknown): PublicAthlete[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is PublicAthlete => {
      if (!r || typeof r !== "object") return false;
      const row = r as Partial<PublicAthlete>;
      return typeof row.username === "string" && isPublicUsername(row.username);
    })
    .map((r) => ({
      username: r.username,
      sport: r.sport ?? null,
      position: r.position ?? null,
      xp: Number.isFinite(r.xp) ? Number(r.xp) : 0,
      created_at: r.created_at ?? "",
    }));
}

/**
 * How long they have been at it, in words.
 *
 * Months, not a date: "member since 3 August 2026" is a fact nobody asked for
 * and a small privacy leak besides. "Eight months in" is the part that means
 * something next to a rank.
 */
export function membershipLength(createdAt: string, now = new Date()): string | null {
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const months = Math.floor((now.getTime() - start.getTime()) / (30 * 86_400_000));
  if (months < 1) return "New this month";
  if (months === 1) return "One month in";
  if (months < 12) return `${months} months in`;
  const years = Math.floor(months / 12);
  return years === 1 ? "A year in" : `${years} years in`;
}

/**
 * The <title>, which the root layout appends " | PocketAthlete" to.
 *
 * So it must NOT say "on PocketAthlete" itself — the first version did, and
 * every athlete page rendered "@sam on PocketAthlete | PocketAthlete". The
 * sport and position go here instead: they cost nothing, they are the words
 * somebody searching for a player would actually type, and a bare "@sam" is a
 * title tag with almost no surface.
 *
 * Trimmed at 60 because that is roughly where a search result cuts, and the
 * brand the template adds has to fit after it.
 */
export const PROFILE_TITLE_MAX = 44;

export function profileTitle(a: PublicAthlete): string {
  const who = [a.position, a.sport ? sportLabel(a.sport as SportId) : null].filter(Boolean).join(", ");
  const full = who ? `@${a.username} — ${who}` : `@${a.username}`;
  return full.length <= PROFILE_TITLE_MAX ? full : `${full.slice(0, PROFILE_TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * CLAMPED, BECAUSE THIS IS THE ONE DESCRIPTION ON THE SITE BUILT FROM USER
 * INPUT.
 *
 * Every other page's description is written by hand and checked once. This one
 * interpolates a username of up to 20 characters and a free-text position, so
 * the length is not something a glance at the template settles — a long
 * position alone pushes it past where Google truncates. trimToMeta cuts on a
 * word and adds the ellipsis.
 */
export function profileDescription(a: PublicAthlete, rank: string): string {
  // The label, not the id: the page's own tags render "Football", so a
  // description reading "football" is the raw column leaking into the search
  // result.
  const sport = a.sport ? sportLabel(a.sport as SportId) : null;
  const who = [a.position, sport].filter(Boolean).join(", ");
  const tail = `${rank} on PocketAthlete, where every session and every meal is logged and costed.`;
  return trimToMeta(who ? `@${a.username} — ${who}. ${tail}` : `@${a.username} — ${tail}`);
}
