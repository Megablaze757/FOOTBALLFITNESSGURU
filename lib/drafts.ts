// =============================================================================
// Drafts — half-finished work survives leaving the page.
//
// The check-in has a body map, four sliders, a weight and a training log. Fill
// half of it in, tap through to look up a drill, come back — and it was all
// gone. That's not a small annoyance on a product whose entire premise is doing
// something small every single day; it's the thing that ends the streak.
//
// Deliberately localStorage rather than the database:
//
//   * A draft is not data, it's an unfinished intention. Writing every slider
//     drag to Postgres would be a lot of traffic to store something the athlete
//     hasn't committed to.
//   * It works offline, which is where half these check-ins happen.
//   * Nothing leaves the device until they press save, so an abandoned draft
//     never becomes a row somebody has to think about deleting.
//
// Scoped per user AND per day, so a draft can't leak between accounts on a
// shared phone or resurface tomorrow as if it were today's answers.
// =============================================================================

const PREFIX = "pa:draft:";

/** How long a draft is worth keeping. Beyond this it's stale enough that
 *  restoring it would be surprising rather than helpful. */
const MAX_AGE_MS = 36 * 60 * 60 * 1000; // 36 hours — covers "last night" but not last week

interface Envelope<T> {
  savedAt: number;
  value: T;
}

function key(name: string, userId: string, scope?: string): string {
  return `${PREFIX}${name}:${userId}${scope ? `:${scope}` : ""}`;
}

export function saveDraft<T>(name: string, userId: string, value: T, scope?: string): void {
  try {
    const env: Envelope<T> = { savedAt: Date.now(), value };
    localStorage.setItem(key(name, userId, scope), JSON.stringify(env));
  } catch {
    // Quota, private mode, storage disabled. A draft is a convenience; failing
    // to save one must never interrupt what the person is actually doing.
  }
}

/** The saved draft, or null if there isn't one or it's too old. */
export function loadDraft<T>(name: string, userId: string, scope?: string): T | null {
  try {
    const raw = localStorage.getItem(key(name, userId, scope));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (typeof env?.savedAt !== "number") return null;
    if (Date.now() - env.savedAt > MAX_AGE_MS) {
      clearDraft(name, userId, scope);
      return null;
    }
    return env.value ?? null;
  } catch {
    // Corrupt draft: bin it rather than letting it break the form forever.
    clearDraft(name, userId, scope);
    return null;
  }
}

export function clearDraft(name: string, userId: string, scope?: string): void {
  try {
    localStorage.removeItem(key(name, userId, scope));
  } catch { /* nothing to do */ }
}

/** How long ago a draft was saved, in ms — for "restored from 10 minutes ago". */
export function draftAge(name: string, userId: string, scope?: string): number | null {
  try {
    const raw = localStorage.getItem(key(name, userId, scope));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<unknown>;
    return typeof env?.savedAt === "number" ? Date.now() - env.savedAt : null;
  } catch {
    return null;
  }
}

/**
 * Bin every draft for a user, and any that have expired for anyone.
 *
 * Called on sign-out: leaving a half-written check-in on a shared phone for the
 * next person to find is exactly the kind of thing nobody thinks about until it
 * happens.
 */
export function clearAllDrafts(userId?: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      if (userId && !k.includes(`:${userId}`)) {
        // Not theirs — but bin it anyway if it has gone stale, so old drafts
        // don't accumulate in storage forever.
        try {
          const env = JSON.parse(localStorage.getItem(k) || "{}") as Envelope<unknown>;
          if (typeof env?.savedAt === "number" && Date.now() - env.savedAt > MAX_AGE_MS) doomed.push(k);
        } catch { doomed.push(k); }
        continue;
      }
      doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch { /* nothing to do */ }
}

/** Human-friendly age, for the "we restored this" notice. */
export function describeAge(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
