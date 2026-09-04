/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELLING THE LEADERBOARD WHAT YOUR RANK ACTUALLY IS.
 *
 * The rank badge beside a name needs that athlete's LIFETIME XP, and the
 * leaderboard cannot work it out. leaderboard_stats returns seven days of
 * activity — computing XP from that gives a few hundred, which is level 1, so
 * every athlete on the board wore an Iron badge whatever they had done.
 *
 * It cannot be computed in SQL either without duplicating the bodyweight-
 * relative strength standards, and two copies of a scoring rule is a worse bug
 * than the one being fixed: the badge and the rewards screen would disagree.
 *
 * So the athlete's own client publishes it. The rewards screen already
 * computes the real number from real lifetime stats with the one
 * implementation of computeXp; this stores it so other people's boards can
 * read it back.
 *
 * WRITES ONLY WHEN IT CHANGED. XP moves a few times a week at most, and a
 * write on every render of a screen people open daily is a lot of pointless
 * traffic. The last published value is remembered per athlete, so the common
 * case costs nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const KEY_PREFIX = "pa-xp-published:";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE STREAK RIDES ALONG, FOR EXACTLY THE REASON XP DOES.
 *
 * Streaks survive one missed day now if a rest day was earned (lib/load.ts),
 * and leaderboard_stats counted them the strict old way — so the board showed
 * a smaller streak than the athlete's own Home screen, which is the kind of
 * disagreement people notice immediately and never trust again.
 *
 * Reimplementing the insurance rule in plpgsql is the mistake this file was
 * written to avoid: two copies of a scoring rule is how a badge and a rewards
 * screen end up disagreeing. So the client publishes the number it already
 * computed, in the write it was already making.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface PublishedStats {
  xp: number;
  streak: number;
}

/** The XP last written for this athlete, or null if we have never written. */
export function lastPublished(userId: string): number | null {
  return readSnapshot(userId)?.xp ?? null;
}

function readSnapshot(userId: string): PublishedStats | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (raw === null) return null;
    /**
     * A BARE NUMBER IS THE OLD SHAPE, AND REAL BROWSERS HOLD IT.
     *
     * Before the streak went in this key was `String(xp)`. Treating that as
     * corrupt would be harmless-looking and wrong in a specific way: the very
     * next publish is unconditional, so every returning athlete would make one
     * pointless write. Reading it as an XP with no known streak costs nothing
     * and is what it actually means.
     */
    const n = Number(raw);
    if (Number.isFinite(n)) return { xp: n, streak: Number.NaN };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Partial<PublishedStats>;
    return {
      xp: Number.isFinite(o.xp) ? Number(o.xp) : Number.NaN,
      streak: Number.isFinite(o.streak) ? Number(o.streak) : Number.NaN,
    };
  } catch {
    return null;
  }
}

export function rememberPublished(userId: string, stats: PublishedStats): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(stats));
  } catch { /* private mode — it will simply write again next time */ }
}

/**
 * Whether this is worth a round trip.
 *
 * Negative and non-finite values are refused outright rather than stored: the
 * column has a `xp >= 0` check and a rejected write is a console error on a
 * screen the athlete is looking at.
 *
 * NaN on the previous side means "we do not know", which must publish — that is
 * how an athlete whose key still holds the old bare-number shape gets a streak
 * onto the board at all. `NaN !== NaN` does that on its own; it is written out
 * because relying on that silently is how it gets "tidied" away later.
 */
export function shouldPublish(next: PublishedStats, previous: PublishedStats | null): boolean {
  if (!Number.isFinite(next.xp) || next.xp < 0) return false;
  if (!Number.isFinite(next.streak) || next.streak < 0) return false;
  if (previous === null) return true;
  if (!Number.isFinite(previous.xp) || !Number.isFinite(previous.streak)) return true;
  return Math.round(next.xp) !== Math.round(previous.xp)
    || Math.round(next.streak) !== Math.round(previous.streak);
}

export interface XpWriter {
  from(table: string): {
    update(values: Record<string, number>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
  };
}

/**
 * Publish, if it changed. Never throws and never blocks what the caller is
 * doing — a badge on somebody else's screen is not worth an error on this one,
 * and a database without migration 0105 has no column to write to.
 */
export interface PublishedStore {
  get(userId: string): PublishedStats | null;
  set(userId: string, stats: PublishedStats): void;
}

/**
 * The browser's memory of what was last sent.
 *
 * Injectable because localStorage does not exist under the test runner, and a
 * "writes only when it changed" rule that cannot be tested is a rule that will
 * quietly become "writes every time".
 */
export const browserStore: PublishedStore = {
  get: readSnapshot,
  set: rememberPublished,
};

export async function publishXp(
  client: XpWriter,
  userId: string,
  stats: PublishedStats,
  store: PublishedStore = browserStore,
): Promise<boolean> {
  if (!shouldPublish(stats, store.get(userId))) return false;
  const values = { xp: Math.round(stats.xp), streak: Math.round(stats.streak) };
  try {
    const { error } = await client.from("profiles").update(values).eq("id", userId);
    if (error) return false;
    store.set(userId, stats);
    return true;
  } catch {
    return false;
  }
}
