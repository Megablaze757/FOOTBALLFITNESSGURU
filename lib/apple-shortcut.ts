/**
 * The one-tap route into Apple Health: a shortcut somebody else already built.
 *
 * WHY THIS FILE EXISTS AT ALL. The Apple setup used to be a four-step build on
 * a phone — find the Health action, get the sort order and the limit right,
 * paste a link into a Text box, change a variable's unit so it stops being
 * "7 hr 32 min" — and the reported problem was simply that people could not
 * finish it. Every one of those steps is correct and none of them is the
 * athlete's job.
 *
 * Shortcuts can be SHARED. One person builds it once, publishes an iCloud link,
 * and everybody else taps the link, taps Add Shortcut, and pastes their own
 * upload link when it asks. Three taps and one paste, and none of them involve
 * knowing what a Health sample is.
 *
 * WHY THE LINK IS A CONFIGURED CONSTANT RATHER THAN SOMETHING GENERATED. An
 * iCloud shortcut link can only be produced by a real iPhone signed into
 * iCloud, sharing a shortcut it has installed. No API mints one, and a
 * .shortcut file served from this site cannot be signed. So the link is set
 * once, by hand, by whoever built it — see docs/APPLE-SHORTCUT.md.
 *
 * WHY THE TOKEN IS NOT IN IT. A shared shortcut is the same shortcut for
 * everybody who installs it, so anything baked into it is public. The athlete's
 * upload link is a credential: it writes biometrics to their account. It has to
 * arrive on the phone that installs it, which is what the import question is
 * for.
 */

/**
 * Set this to the iCloud link once the shortcut has been published.
 *
 * NEXT_PUBLIC_APPLE_SHORTCUT_URL overrides it, which is what a deployment that
 * does not want to commit the link should use. Either way it is read at build
 * time — this app is a static export, so there is no runtime environment.
 */
const CONFIGURED = "";

/**
 * An iCloud shortcut link, and nothing else.
 *
 * A HALF-CONFIGURED VALUE MUST RENDER AS NOT CONFIGURED. The failure this
 * guards against is the one that already happened once with the ingest
 * endpoint: a button that looks live, does nothing, and tells nobody. A
 * placeholder left in the constant, a shortened link, a marketing page — none
 * of those install a shortcut, so none of them may light up the button.
 */
const ICLOUD = /^https:\/\/(?:www\.)?icloud\.com\/shortcuts\/[0-9a-f]{16,}\/?$/i;

export function isShortcutUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && ICLOUD.test(value.trim());
}

/** The published link, or null when there isn't one yet. */
export function appleShortcutUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_APPLE_SHORTCUT_URL || CONFIGURED || "").trim();
  return isShortcutUrl(raw) ? raw : null;
}
