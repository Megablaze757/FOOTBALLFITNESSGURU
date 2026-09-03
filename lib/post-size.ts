// =============================================================================
// The shapes a post is actually published in.
//
// Everything here rendered at 1080×1080, which is the square Instagram feed
// post — and the least of the three. Portrait takes 1.4× the vertical space in
// the same scroll, and a story or reel cover is a different shape again. A
// square cropped into a story is a square with bars, or a story cropped into a
// square loses a third of the text.
//
// Width is 1080 in all three because that is Instagram's ingest width; only
// the height moves.
// =============================================================================

export type PostSize = "square" | "portrait" | "story";

export const POST_SIZES: { id: PostSize; label: string; note: string; w: number; h: number }[] = [
  { id: "square", label: "Square", note: "Feed · 1:1", w: 1080, h: 1080 },
  { id: "portrait", label: "Portrait", note: "Feed · 4:5, takes more screen", w: 1080, h: 1350 },
  { id: "story", label: "Story", note: "Stories & Reels · 9:16", w: 1080, h: 1920 },
];

export function sizeOf(id: PostSize): { w: number; h: number } {
  const found = POST_SIZES.find((s) => s.id === id);
  // Not a silent fallback to square: a caller asking for a size that does not
  // exist has a bug, and a post quietly published in the wrong shape is the
  // failure this module exists to stop.
  if (!found) throw new Error(`unknown post size: ${id}`);
  return { w: found.w, h: found.h };
}

/**
 * The canvas a rasteriser should use for an SVG.
 *
 * Read from the markup rather than passed in beside it. rasterise() took a
 * single `size` and set width AND height from it, so every non-square card
 * would have been squashed into a square the moment one existed — and the
 * caller that knew better was three components away.
 */
export function svgDimensions(svg: string): { w: number; h: number } {
  const w = /\bwidth="(\d+)"/.exec(svg);
  const h = /\bheight="(\d+)"/.exec(svg);
  if (!w || !h) throw new Error("svg has no width/height to rasterise at");
  return { w: Number(w[1]), h: Number(h[1]) };
}
