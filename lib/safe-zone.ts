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

/** What every reel is rendered at. */
export const FRAME_W = 1080;
export const FRAME_H = 1920;

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
