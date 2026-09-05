/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VALUES THAT ARRIVED BY PASTE.
 *
 * A repository variable holding the Supabase URL was saved with a trailing
 * carriage return — invisible in the settings box, invisible in the log, and
 * fatal:
 *
 *     SUPABASE_URL: https://txqhstackgidjqkkrzyj.supabase.co\r
 *     curl: (3) URL rejected: Malformed input to a URL function
 *
 * Every reel recorded fine and none of them reached the dashboard, for three
 * runs, because of one character nobody could see. Copying a value out of a
 * dashboard and into a settings box is how every one of these is configured,
 * so a stray newline is the NORMAL case and the code has to survive it.
 *
 * Two functions and not one, because the safe amount to strip differs:
 * a URL or an API key can never contain whitespace at all, and a password
 * legitimately can.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * A URL, an API key, a project ref — anything whose grammar has no room for
 * whitespace. Strips it wherever it appears, including a newline glued on by a
 * paste and the space that comes with a double-click selection.
 */
export function configValue(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\s+/g, "");
}

/**
 * A password or an email address.
 *
 * Only CR and LF are removed. A password may legitimately contain a space —
 * including a leading or trailing one — and silently trimming it would turn a
 * working credential into a failing one for no reason the log could explain.
 * A newline cannot be typed into an HTML password field, so it is always paste
 * damage and always safe to drop.
 */
export function secretValue(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[\r\n]/g, "");
}

/**
 * Whether a value has spaces at either end — reported so a run can SAY that
 * this is the likely cause of a rejected credential, without ever printing the
 * credential itself.
 */
export function hasEdgeSpace(raw: string | undefined | null): boolean {
  const value = secretValue(raw);
  return value !== value.trim();
}
