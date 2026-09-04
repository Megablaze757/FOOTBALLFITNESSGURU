// Builds a shareable 1080×1080 progress card as SVG and rasterises it to PNG in
// the browser (no dependencies — works on GitHub Pages). Offers native share or
// download.

export interface ShareStat {
  label: string;
  value: string;
}

export interface ShareStats {
  name: string;
  headlineValue: string;
  headlineLabel: string;
  accent?: string; // hex
  stats: ShareStat[]; // up to 3
  caption?: string;
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A SHARED CARD WITH NO ADDRESS ON IT IS NOT MARKETING.
   *
   * This card said "POCKETATHLETE" across the top and gave no way to find it.
   * Somebody who sees an athlete's rank in a group chat has a brand name, a
   * screenshot, and nowhere to go — so the one piece of distribution the app
   * had that costs nothing and carries social proof ended at the image.
   *
   * The link goes on the card. When the athlete has a referral code it is
   * THEIR link, so a share that works is a share they get credit for — which
   * is the difference between a feature people are told to use and one they
   * want to.
   * ═══════════════════════════════════════════════════════════════════════
   */
  link?: string;
}

/** What the card shows when the athlete has no referral code of their own. */
export const SHARE_FALLBACK_LINK = "pocketathlete.com";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LINK THAT GOES ON AN ATHLETE'S CARD.
 *
 * Migration 0107 made every username a referral code that resolves, and 0108
 * gave opted-in athletes a page. Neither did anything on its own: nothing in
 * the app ever set `link`, so every card printed the bare domain and no share
 * has ever been attributable to the person who made it.
 *
 * Two shapes, in order of what a person would rather post:
 *
 *   public page  → pocketathlete.com/a/sam
 *       Short enough to read off a screenshot, it is about THEM rather than
 *       about the app, and the page itself records the referral — see
 *       CaptureAthleteRef — so there is no query string to make it ugly.
 *
 *   username only → pocketathlete.com/?ref=sam
 *       No page to send anyone to, but the credit still lands.
 *
 * `undefined` for anybody with no username at all, which displayLink turns
 * into the plain domain. A card is never worse off than it was.
 *
 * NOT A COMMISSION. A username matches nothing in public.affiliates, so this
 * brings signups in and creates no payout — see the long note at the foot of
 * migration 0107.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function athleteShareLink(
  username: string | null | undefined,
  isPublic: boolean,
): string | undefined {
  const name = username?.trim().toLowerCase();
  if (!name) return undefined;
  return isPublic
    ? `${SHARE_FALLBACK_LINK}/a/${name}`
    : `${SHARE_FALLBACK_LINK}/?ref=${encodeURIComponent(name)}`;
}

/**
 * The address as it should READ on a card: no scheme, no trailing slash.
 *
 * "https://pocketathlete.com/?ref=ABC" is a URL bar; "pocketathlete.com/?ref=ABC"
 * is something you can type. Nobody transcribes the scheme.
 */
export function displayLink(link: string | undefined): string {
  if (!link) return SHARE_FALLBACK_LINK;
  const clean = link.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean || SHARE_FALLBACK_LINK;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CARD IS AN SVG PARSED BY THE BROWSER, SO A BAD CHARACTER IS A BLANK
 * SCREEN, NOT A WONKY LETTER.
 *
 * buildShareSvg's output is handed to an <img> as a data: URL. XML parsing is
 * all-or-nothing: one character that XML 1.0 forbids and the image never
 * decodes, exportShareCard rejects, and — before the change in ShareButton —
 * the athlete saw the button say "Creating…", stop, and do nothing at all.
 * Reported as sharing working "for some of the stuff".
 *
 * So three things rather than one:
 *
 *   COERCED. The type says string and the data does not always agree: a stat
 *   built from an absent figure arrives as undefined, and `undefined.replace`
 *   is a TypeError thrown from inside a template literal.
 *
 *   CONTROL CHARACTERS STRIPPED. XML 1.0 permits tab, newline and carriage
 *   return and forbids every other character below 0x20 — including the ones a
 *   copy-paste out of a spreadsheet leaves in a profile name. There is no way
 *   to escape them; they have to go.
 *
 *   QUOTES ESCAPED TOO. Every interpolation today lands in element text, where
 *   a quote is legal. The next one to land in an attribute would not be, and
 *   the failure would be this same blank card.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function esc(s: unknown): string {
  return String(s ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Upper-cased without assuming there is anything there to upper-case. */
function up(value: unknown): string {
  return String(value ?? "").toUpperCase();
}

export function buildShareSvg(s: ShareStats): string {
  const accent = s.accent ?? "#e3b53f";
  const stats = s.stats.slice(0, 3);
  const colW = 1080 / (stats.length || 1);
  const statCols = stats
    .map((st, i) => {
      const cx = colW * i + colW / 2;
      return `
        <text x="${cx}" y="820" text-anchor="middle" fill="#ffffff" font-size="72" font-weight="800" font-family="Arial, sans-serif">${esc(st.value)}</text>
        <text x="${cx}" y="864" text-anchor="middle" fill="#8a94a6" font-size="26" font-weight="700" letter-spacing="2" font-family="Arial, sans-serif">${esc(up(st.label))}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs>
      <radialGradient id="bg" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="#241d0b"/>
        <stop offset="55%" stop-color="#111010"/>
        <stop offset="100%" stop-color="#0a0a0b"/>
      </radialGradient>
      <linearGradient id="acc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f0d68a"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <rect x="40" y="40" width="1000" height="1000" rx="48" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <text x="80" y="150" fill="url(#acc)" font-size="52" font-weight="800" font-family="Arial, sans-serif">POCKETATHLETE</text>
    <text x="1000" y="150" text-anchor="end" fill="#8a94a6" font-size="34" font-weight="600" font-family="Arial, sans-serif">${esc(s.name)}</text>

    <text x="540" y="470" text-anchor="middle" fill="url(#acc)" font-size="300" font-weight="800" font-family="Arial, sans-serif">${esc(s.headlineValue)}</text>
    <text x="540" y="560" text-anchor="middle" fill="#c7d0dd" font-size="42" font-weight="700" letter-spacing="4" font-family="Arial, sans-serif">${esc(up(s.headlineLabel))}</text>

    <line x1="80" y1="700" x2="1000" y2="700" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    ${statCols}

    <text x="540" y="960" text-anchor="middle" fill="#6b7686" font-size="28" font-weight="600" font-family="Arial, sans-serif">${esc(s.caption ?? "Train smarter. Recover faster.")}</text>
    <text x="540" y="1006" text-anchor="middle" fill="url(#acc)" font-size="30" font-weight="800" font-family="Arial, sans-serif">${esc(displayLink(s.link))}</text>
  </svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export type ShareOutcome = "shared" | "saved" | "cancelled";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT ACTUALLY HAPPENED, RETURNED — BECAUSE THE BUTTON HAS TO SAY.
 *
 * This returned void, so every failure was silent: the button said
 * "Creating…", stopped, and did nothing. There was no way for an athlete to
 * tell a cancelled share from a broken one, and no way for anybody to report
 * it beyond "it doesn't work for some of the stuff".
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function exportShareCard(stats: ShareStats): Promise<ShareOutcome> {
  const blob = await svgToPngBlob(buildShareSvg(stats));
  const file = new File([blob], SHARE_FILENAME, { type: "image/png" });

  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      // The link in the TEXT as well as on the card. A shared image with no
      // text is untappable in most apps, and the card's own address then has
      // to be typed out by hand from a screenshot.
      await nav.share({
        files: [file],
        title: "My progress",
        text: `${stats.headlineValue} ${stats.headlineLabel} — ${displayLink(stats.link)}`,
      });
      return "shared";
    } catch (e) {
      /**
       * A CANCELLED SHARE IS NOT A FAILED ONE, and this used to treat them
       * identically: dismiss the share sheet and a PNG appeared in Downloads
       * anyway. Somebody who just said "no thanks" got a file for their
       * trouble.
       *
       * AbortError is what every implementation raises on dismissal. Anything
       * else genuinely went wrong, and falling through to a download is then
       * the right answer rather than an imposition.
       */
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }

  saveBlob(blob, SHARE_FILENAME);
  return "saved";
}

export const SHARE_FILENAME = "pocketathlete-progress.png";

/** The card as a PNG, for a caller that wants to show it before sending it. */
export async function shareCardPng(stats: ShareStats): Promise<Blob> {
  return svgToPngBlob(buildShareSvg(stats));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAVING A BLOB, WITH THE TWO MISTAKES THAT MAKE IT SILENTLY NOT SAVE.
 *
 *   THE ANCHOR HAS TO BE IN THE DOCUMENT. Firefox ignores a click on a
 *   detached one, so the download simply does not start and nothing is
 *   thrown.
 *
 *   THE OBJECT URL MUST OUTLIVE THE CLICK. This revoked it on the very next
 *   line. `click()` only SCHEDULES the download, so revoking synchronously
 *   races it — which is why a save could work on one machine and do nothing
 *   on another, with no error either way. Revoked on a later turn of the
 *   event loop instead, which is late enough for the download to have taken
 *   the reference and soon enough not to leak.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}
