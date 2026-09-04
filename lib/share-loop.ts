// =============================================================================
// HOW MUCH OF THE GROWTH CAME FROM SOMEBODY SHARING.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE PANEL WAS COUNTING THE WRONG THING, AND UNDERSTATING ITS OWN LOOP.
//
// It read "links issued" off the `affiliates` table, and its empty state said
// so out loud: "the plain address for most athletes, their own for anyone with
// an affiliate row." That was true when it was written and stopped being true
// at migration 0107, which made EVERY USERNAME a referral code that resolves.
// Almost nobody is an affiliate; almost everybody has a username. So the one
// screen meant to answer "is the share loop working" was reporting a number
// that ignored nearly all of it.
//
// The two kinds are not interchangeable and the panel must not merge them:
//
//   AN AFFILIATE CODE creates a commission line. It is growth that costs money
//   and is therefore capped, checked and paid — see lib/affiliate.ts.
//
//   AN ATHLETE'S USERNAME creates nothing. It brings a signup in and no payout
//   with it, which makes it the only channel here whose marginal cost is zero
//   and the one worth growing hardest.
//
// A NUMBER THAT MATCHES NOTHING IS ALSO WORTH SEEING. A code typed by hand at
// signup that resolves to neither is attribution that was offered and lost —
// invisible in every other view, and the only one of these three that points
// at a bug rather than at a result.
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure and separate from the panel, because the interesting part is the
// classification and the panel is a grid of numbers.
// =============================================================================

export type CodeKind = "affiliate" | "athlete" | "unknown";

export interface LoopInput {
  /** Affiliate codes that exist, whatever their case. */
  affiliateCodes: string[];
  /** Usernames that exist. Since 0107 each is a working referral code. */
  usernames: string[];
  /** referral_code as written on each profile. Nulls already filtered out. */
  attributed: string[];
  /** Every profile, for the share-of-signups figures. */
  totalProfiles: number;
  /** Athletes who published a page — the strongest share target there is. */
  publicProfiles: number;
}

export interface SourceCount {
  code: string;
  kind: CodeKind;
  signups: number;
}

export interface LoopStats {
  /** How many people COULD share with attribution, by kind. */
  canShare: { affiliates: number; athletes: number; withPage: number };
  /** Signups that arrived carrying a code, by what the code turned out to be. */
  signups: { affiliate: number; athlete: number; unknown: number; total: number };
  /** Attributed signups as a percentage of all profiles, rounded. */
  sharePct: number;
  /** Busiest codes first, then by code so the order cannot wobble. */
  sources: SourceCount[];
}

/** Codes are matched case-insensitively: 0107's validator lowercases both sides. */
const norm = (s: string) => s.trim().toLowerCase();

/**
 * What a code on a profile turned out to be.
 *
 * AFFILIATES ARE CHECKED FIRST, and that ordering is not cosmetic — it mirrors
 * `referral_code_valid` in migration 0107, which resolves to the paid side when
 * a code somehow matches both. Classifying a paid referral as a free one here
 * would show a commission-bearing signup as costing nothing.
 */
export function classify(code: string, affiliates: Set<string>, usernames: Set<string>): CodeKind {
  const c = norm(code);
  if (!c) return "unknown";
  if (affiliates.has(c)) return "affiliate";
  if (usernames.has(c)) return "athlete";
  return "unknown";
}

export function loopStats(input: LoopInput): LoopStats {
  const affiliates = new Set(input.affiliateCodes.map(norm).filter(Boolean));
  const usernames = new Set(input.usernames.map(norm).filter(Boolean));

  const counts = new Map<string, SourceCount>();
  const signups = { affiliate: 0, athlete: 0, unknown: 0, total: 0 };

  for (const raw of input.attributed) {
    const code = norm(raw);
    if (!code) continue;
    const kind = classify(code, affiliates, usernames);
    signups[kind]++;
    signups.total++;
    const held = counts.get(code);
    if (held) held.signups++;
    else counts.set(code, { code, kind, signups: 1 });
  }

  return {
    canShare: {
      affiliates: affiliates.size,
      // Not `usernames.size - affiliates.size`: 0107's trigger already forbids
      // a username equalling an affiliate code, so they cannot overlap, and
      // subtracting would quietly under-report if that trigger ever went.
      athletes: usernames.size,
      withPage: input.publicProfiles,
    },
    signups,
    sharePct: input.totalProfiles > 0 ? Math.round((signups.total / input.totalProfiles) * 100) : 0,
    sources: [...counts.values()].sort((a, b) => b.signups - a.signups || a.code.localeCompare(b.code)),
  };
}

/**
 * The one line worth putting under the numbers, or null when there is nothing
 * to say yet.
 *
 * Says what is WRONG rather than what is going well, because the panel already
 * shows what is going well and a warning nobody has to look for is the only
 * kind that gets read.
 */
export function loopWarning(stats: LoopStats): string | null {
  if (stats.signups.unknown > 0) {
    return `${stats.signups.unknown} signup${stats.signups.unknown === 1 ? "" : "s"} arrived with a code `
      + "that matches no affiliate and no username. That attribution is lost — check the code was typed "
      + "as it was given.";
  }
  if (stats.canShare.athletes === 0) {
    return "No athlete has a username, so nobody's share card carries a link back to them. "
      + "Usernames are assigned at signup — if this is zero, migration 0050 has not run.";
  }
  if (stats.canShare.withPage === 0 && stats.canShare.athletes > 0) {
    return "Nobody has published a public page yet. A share that links to the athlete's own page "
      + "is the one people actually click — it is opt-in from Profile.";
  }
  return null;
}
