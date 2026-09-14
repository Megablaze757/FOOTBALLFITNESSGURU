// =============================================================================
// THE PARTS OF THE FRAME THE PLATFORM DRAWS OVER.
//
// ═══════════════════════════════════════════════════════════════════════════
// A CAPTION UNDER THE CHROME CANNOT BE FIXED AFTER THE VIDEO IS MADE.
//
// Every reel is 1080x1920, and the app that plays it puts its own caption,
// handle, sound credit and action buttons on top. Anything of ours underneath
// is invisible to everyone, and the file has already been rendered.
//
// scripts/reel-overlay.js has always known this — "TikTok and Instagram draw
// their own caption, handle and buttons over the lower fifth of the frame" —
// and still shipped a caption 243px off the bottom, because it expressed the
// rule as `padding-bottom: 22%` and percentage padding resolves against the
// containing block's WIDTH. The intent was right and the unit defeated it.
//
// So the numbers live here, named, with the check that uses them, instead of
// being a percentage in a style string that nobody can evaluate by reading.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================
import { REEL_W, REEL_H, REEL_SCALE } from "./reel-plan";

/**
 * What every reel is rendered at.
 *
 * DERIVED, not typed again. lib/reel-plan.ts already owns the record viewport
 * and the scale factor, and a second copy of 1080 here would be a third place
 * for the same number to disagree with itself — which is the entire reason
 * this file exists.
 */
export const FRAME_W = REEL_W * REEL_SCALE;
export const FRAME_H = REEL_H * REEL_SCALE;

/**
 * Reported chrome, in pixels of a 1080x1920 frame.
 *
 * TikTok and Reels differ because their buttons differ, so the rule is the
 * worst of the two on each edge — a reel is posted to both.
 */
export const CHROME = {
  /** Reels overlays the bottom 400px; TikTok's own chrome is about 320. */
  bottom: 400,
  /** Where the sound credit and the top gradient sit. */
  top: 140,
  left: 60,
  /** The action rail — profile, like, comment, share — runs UP this edge. */
  right: 180,
} as const;

/**
 * The box everything important must sit inside.
 *
 * Quoted independently as "900x1400 centred in 1080x1920" for the smallest
 * common safe area across TikTok, Reels and Shorts; deriving it from CHROME
 * instead gives 840x1380, which is inside that and edge-by-edge rather than
 * symmetric. Both are used: the derived one is the rule, and the quoted one is
 * the sanity check that the derived one has not drifted somewhere daft.
 */
export const SAFE = {
  left: CHROME.left,
  right: FRAME_W - CHROME.right,
  top: CHROME.top,
  bottom: FRAME_H - CHROME.bottom,
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW MANY RENDERED LINES A CAPTION MAY COVER THE APP WITH.
 *
 * Not a style rule — a measurement, and the first version of it was taken in
 * the wrong font. The overlay asked for `system-ui`, which on a Linux runner
 * is DejaVu Sans: 26.4 CSS px a character, about fifteen to a line, and 28 of
 * the 74 captions rendering three lines with one at four. That is what shipped,
 * and it is not what the page can do.
 *
 * In the app's own display face, which the overlay uses now, a character is
 * 18.8px and the band holds 22. Measured across all seven scripts:
 *
 *                        fallback        Barlow Semi Condensed 800
 *   one line                   23                               38
 *   two lines                  22                               32
 *   three lines                28                                4
 *   four lines                  1                                0
 *
 * The ceiling stays, because the ceiling is about what the frame can carry
 * rather than what the font happens to be: four lines was 45% of the frame in
 * text, over the app the reel exists to show, and it left 26px between the
 * caption and the spotlight ring.
 *
 * Dropping the font to 40px CSS would also have cleared it, and was refused:
 * 46px is 92px of frame, deliberately raised from 80 into the 80-120px band
 * the caption research specifies, and losing that for every caption to fix one
 * is the wrong trade. The one caption was reworded instead.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MAX_CAPTION_LINES = 3;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE SAME CEILING FOR THE HOOK, WHICH IS SET MUCH LARGER.
 *
 * HOOK_MAX_WORDS is ten, justified as "a feed gives about a second, and ten
 * words is what fits in one". That is a rule about READING TIME, and it is the
 * only one there was. Nothing asked whether ten words fit the FRAME.
 *
 * They do not. The hook is 64px against the caption's 46, so a line holds
 * about fifteen characters, and measured across the seven scripts:
 *
 *   "Slept three hours? Your app's booked you in for squats."   5 lines
 *   "Which of these costs 10x more for the same protein?"       4 lines
 *
 * Five lines of 64px type is over a third of the frame, drawn OVER the app, in
 * the second that decides whether anybody stays. At that size it stops being a
 * hook and becomes a wall to read past.
 *
 * Three lines is 414px of a 1920px frame. It also forces hooks under about 45
 * characters, which is the length short-form hooks work at anyway.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MAX_HOOK_LINES = 3;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAPTION'S OWN GEOMETRY, so the page underneath can keep out of its way.
 *
 * These are the values scripts/reel-overlay.js draws with, in the CSS pixels it
 * is written in. They live here rather than only there because the APP needs
 * them too: a page filmed for a reel has to leave the caption band empty, and
 * until it did, the studio cards sat in the top quarter of the frame with 326px
 * of black between them and the caption.
 *
 * A test parses the overlay and fails if these drift from what it actually
 * draws — the overlay stays the thing that decides.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const CAPTION = { fontPx: 46, lineHeight: 1.2, liftVh: 22 } as const;

/**
 * How much of the frame's HEIGHT the caption block can reach up into, worst
 * case: its lift off the bottom plus a full-height caption.
 *
 * Measured against the real thing: 22vh of 960 is 211px, three lines at 46px
 * and 1.2 is 166px, so the block tops out 377px from the bottom — 583px down a
 * 960px viewport, which is exactly where the tallest real caption starts.
 */
export const CAPTION_BAND_FRACTION =
  (REEL_H * (CAPTION.liftVh / 100) + MAX_CAPTION_LINES * CAPTION.fontPx * CAPTION.lineHeight) / REEL_H;

/** What is left for the app being filmed, as a fraction of the frame height. */
export const FILMABLE_FRACTION = 1 - CAPTION_BAND_FRACTION;

/**
 * Frame pixels to the CSS pixels the overlay is written in.
 *
 * Playwright drives the app at REEL_W x REEL_H with deviceScaleFactor
 * REEL_SCALE, so every CSS pixel of layout is two pixels of frame — and the
 * overlay's style strings are in the CSS ones while every number above is in
 * frame ones. That factor of two is where the clearances got lost:
 * `padding: 0 28px` reads like a generous margin and is 56px of a 1080-wide
 * frame, under a 180px-wide action rail.
 */
export function cssPx(framePx: number): number {
  return framePx / REEL_SCALE;
}

export interface Box { left: number; right: number; top: number; bottom: number }

/**
 * Which edges of a box the platform would cover, in the order a person would
 * read them. Empty means the box is safe.
 *
 * Reasons rather than a boolean: "the caption is 157px too low" is something
 * somebody can act on, and "false" is not.
 */
export function outsideSafeZone(box: Box): string[] {
  const problems: string[] = [];
  if (box.left < SAFE.left) {
    problems.push(`${SAFE.left - box.left}px into the left edge`);
  }
  if (box.right > SAFE.right) {
    problems.push(`${box.right - SAFE.right}px under the action buttons on the right`);
  }
  if (box.top < SAFE.top) {
    problems.push(`${SAFE.top - box.top}px under the sound credit at the top`);
  }
  if (box.bottom > SAFE.bottom) {
    problems.push(`${box.bottom - SAFE.bottom}px under the platform's own caption at the bottom`);
  }
  return problems;
}

/**
 * How far up from the bottom of the frame a caption has to sit, as a fraction
 * of the frame's HEIGHT.
 *
 * The unit matters and is the reason this is a number rather than a string:
 * anything expressed as a plain CSS percentage resolves against width.
 */
export const CAPTION_BOTTOM_FRACTION = CHROME.bottom / FRAME_H;
