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

/** The value last written for this athlete, or null if we have never written. */
export function lastPublished(userId: string): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function rememberPublished(userId: string, xp: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, String(xp));
  } catch { /* private mode — it will simply write again next time */ }
}

/**
 * Whether this XP is worth a round trip.
 *
 * Negative and non-finite values are refused outright rather than stored: the
 * column has a `xp >= 0` check and a rejected write is a console error on a
 * screen the athlete is looking at.
 */
export function shouldPublish(xp: number, previous: number | null): boolean {
  if (!Number.isFinite(xp) || xp < 0) return false;
  return previous === null || Math.round(xp) !== Math.round(previous);
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
  get(userId: string): number | null;
  set(userId: string, xp: number): void;
}

/**
 * The browser's memory of what was last sent.
 *
 * Injectable because localStorage does not exist under the test runner, and a
 * "writes only when it changed" rule that cannot be tested is a rule that will
 * quietly become "writes every time".
 */
export const browserStore: PublishedStore = {
  get: lastPublished,
  set: rememberPublished,
};

export async function publishXp(
  client: XpWriter,
  userId: string,
  xp: number,
  store: PublishedStore = browserStore,
): Promise<boolean> {
  if (!shouldPublish(xp, store.get(userId))) return false;
  try {
    const { error } = await client.from("profiles").update({ xp: Math.round(xp) }).eq("id", userId);
    if (error) return false;
    store.set(userId, xp);
    return true;
  } catch {
    return false;
  }
}
