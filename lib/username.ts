// =============================================================================
// Usernames.
//
// Leaderboards used to fall back to the literal word "Athlete" for anyone
// without a full name — 14 of 19 profiles, so most of the board read
// "Athlete, Athlete, Athlete". A leaderboard where nobody is identifiable
// isn't a leaderboard.
//
// A handle rather than a real name, deliberately: this is a public board that
// includes teenagers, and "Sam Fletcher, 6-day streak, Manchester" is more
// than anyone signed up to publish. A username is something you choose to be
// known by.
// =============================================================================

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/**
 * Names nobody may take.
 *
 * Two reasons. Impersonation — "admin" or "pocketathlete" on a leaderboard
 * reads as official. And routing — a handle that collides with a path would
 * break any future /u/<name> page.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "help", "staff", "team",
  "moderator", "mod", "official", "pocketathlete", "pocket_athlete", "coach",
  "api", "www", "app", "login", "signup", "settings", "profile", "account",
  "home", "journal", "nutrition", "library", "squad", "plans", "pricing",
  "drills", "guides", "privacy", "terms", "waitlist", "studio", "null",
  "undefined", "anonymous", "athlete", "me", "you",
]);

/** Lowercase, trim, collapse separators. What we store and compare. */
export function normaliseUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")   // spaces, dots and dashes all become underscores
    .replace(/[^a-z0-9_]/g, "") // then drop anything still not allowed
    .replace(/_{2,}/g, "_")     // no runs of underscores
    .replace(/^_+|_+$/g, "");   // and none at either end
}

export interface UsernameCheck {
  ok: boolean;
  /** Ready to store. Empty when invalid. */
  value: string;
  /** Why not, phrased for the person typing it. */
  error?: string;
}

export function validateUsername(raw: string): UsernameCheck {
  const value = normaliseUsername(raw);

  if (!value) return { ok: false, value: "", error: "Pick a username — letters, numbers and underscores." };
  if (value.length < USERNAME_MIN) return { ok: false, value: "", error: `At least ${USERNAME_MIN} characters.` };
  if (value.length > USERNAME_MAX) return { ok: false, value: "", error: `At most ${USERNAME_MAX} characters.` };
  // A purely numeric handle looks like an ID and reads as a system account.
  if (/^\d+$/.test(value)) return { ok: false, value: "", error: "Use at least one letter." };
  if (RESERVED.has(value)) return { ok: false, value: "", error: "That one's reserved — try another." };

  return { ok: true, value };
}

export function isReserved(name: string): boolean {
  return RESERVED.has(normaliseUsername(name));
}

// --- Suggestions -------------------------------------------------------------

// Deliberately NOT derived from the email address. "demielegushi@gmail.com"
// becoming the handle "demielegushi" on a public world leaderboard publishes
// most of someone's email to strangers, and they never asked for that.
const ADJECTIVES = [
  "swift", "sharp", "steady", "bold", "quick", "solid", "clutch", "fierce",
  "calm", "iron", "rapid", "relentless", "silent", "prime", "wired", "bright",
];
const NOUNS = [
  "striker", "winger", "runner", "keeper", "engine", "sprinter", "captain",
  "rocket", "hammer", "falcon", "comet", "tiger", "wolf", "shark", "bolt", "ace",
];

/**
 * A neutral, sporty default — "swiftfalcon42".
 *
 * Seeded so the same input gives the same answer, which makes the backfill
 * repeatable and the tests deterministic. Callers must still handle a
 * collision; uniqueness lives in the database, not here.
 */
export function suggestUsername(seed: string, salt = 0): string {
  let h = 2166136261;
  const input = `${seed}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[(h >>> 8) % NOUNS.length];
  const num = (h >>> 16) % 100;
  return `${adj}${noun}${num}`;
}

/**
 * What to show for someone on a public board.
 *
 * Username wins when set. Otherwise a first name — never a full name, which is
 * more than a leaderboard needs. "Athlete" only when there is genuinely
 * nothing, which after the backfill should not happen.
 */
export function displayName(username?: string | null, fullName?: string | null): string {
  const u = (username ?? "").trim();
  if (u) return u;
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "Athlete";
}
