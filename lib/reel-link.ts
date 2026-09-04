// =============================================================================
// POINTING THE REEL STUDIO AT A SUBJECT.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE SCHEDULE SAYS WHAT TO POST AND THE STUDIO MAKES IT. THEY DID NOT SPEAK.
//
// lib/post-plan.ts names the subject — "Five-spot shooting", "Bench press
// standards" — and says the asset is a drill card. The reel studio can build
// exactly that, and finding it meant reading the subject off one panel,
// scrolling down, choosing the right kind, and typing the name into a search
// box. Three steps between a plan and the thing it planned, every time, which
// is three chances to do something else instead.
//
// THE HASH, RATHER THAN A CONTEXT OR A STORE. The two panels are siblings on
// one admin page and neither owns the other, so lifting state would mean
// restructuring both to connect them. A hash is a link: it survives a reload,
// it can be sent to yourself, the browser scrolls to the panel for free, and
// the studio keeps owning its own state — it just accepts being told where to
// start.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import type { ReelKind } from "./reel-kinds";
import type { PostAsset } from "./post-plan";

/** The element the hash scrolls to. */
export const REEL_ANCHOR = "reel-studio";

/**
 * Which kind of reel makes a given planned asset.
 *
 * Null where there is no honest answer. "Text only" is a caption, not a reel,
 * and offering to film one would send somebody to a picker with nothing in it.
 */
export function reelKindFor(asset: PostAsset): ReelKind | null {
  if (asset === "Drill card") return "drill";
  if (asset === "Recipe card") return "recipe";
  if (asset === "App demo") return "demo";
  return null;
}

export interface ReelTarget {
  kind: ReelKind;
  /** What to type into the studio's own search box. */
  query: string;
}

/**
 * The link a schedule row points at.
 *
 * The subject is search TEXT, not an id, because that is what the studio
 * filters on — and a subject that no longer matches leaves the picker showing
 * everything rather than showing nothing, which is the better failure.
 */
export function reelHref(target: ReelTarget): string {
  const params = new URLSearchParams({ kind: target.kind, q: target.query });
  return `#${REEL_ANCHOR}?${params.toString()}`;
}

/**
 * Read a target back out of a hash, or null.
 *
 * NEVER THROWS and never trusts the string: this is the address bar, which
 * anybody can type into. An unknown kind is not a kind — falling back to
 * "drill" would silently show the wrong picker, and showing nothing at all is
 * clearer than showing the wrong thing confidently.
 */
export function parseReelHash(hash: string, isKind: (k: string) => boolean): ReelTarget | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(`${REEL_ANCHOR}?`)) return null;
  try {
    const params = new URLSearchParams(raw.slice(REEL_ANCHOR.length + 1));
    const kind = params.get("kind") ?? "";
    if (!isKind(kind)) return null;
    return { kind: kind as ReelKind, query: (params.get("q") ?? "").slice(0, 120) };
  } catch {
    return null;
  }
}
