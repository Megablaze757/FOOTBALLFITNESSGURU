// =============================================================================
// ONE ADMIN PAGE, SEVERAL JOBS, ONE AT A TIME.
//
// ═══════════════════════════════════════════════════════════════════════════
// "MAKE THE SOCIAL PAGE EASIER TO NAVIGATE."
//
// It is five full sections stacked on one scroll: the share loop, three
// different ways of making a video, and the whole posting schedule. Every one
// of them is a separate job, and the only way to reach the fourth is to scroll
// past three others you did not come for — on a phone, which is where the
// screenshot was taken.
//
// Tabs, then. But tabs break something that already works, and that is the
// only interesting part of this file:
//
// THE SCHEDULE LINKS INTO THE STUDIO. lib/reel-link.ts builds "#reel-studio"
// so a planned post can send you straight to the thing that builds it — a
// link, deliberately, so it survives a reload and can be sent to yourself.
// Hide the studio behind a tab and that link lands on a panel that is not
// rendered, silently, and the feature it exists for is gone.
//
// So a hash naming an anchor OUTRANKS the remembered tab: following a link is
// a stated intention and a remembered choice is a guess about one.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

export interface TabDef {
  id: string;
  label: string;
  /**
   * Element ids that live inside this tab.
   *
   * Declared rather than discovered, because the panel that owns an anchor is
   * not rendered until its tab is chosen — so nothing can look for it first.
   */
  anchors?: string[];
}

/** Which tab owns this anchor, or null. */
export function tabForAnchor(tabs: readonly TabDef[], anchor: string): string | null {
  const id = String(anchor ?? "").replace(/^#/, "").split("?")[0];
  if (!id) return null;
  return tabs.find((t) => t.anchors?.includes(id))?.id ?? null;
}

/**
 * Which tab to open.
 *
 * ORDER IS THE DESIGN. A link wins, because following one is something
 * somebody just did; a remembered choice is only a guess about what they want
 * now. The first tab is the fallback, and it is the one the page is for.
 */
export function initialTab(
  tabs: readonly TabDef[],
  hash: string | null | undefined,
  remembered: string | null | undefined,
): string {
  const linked = hash ? tabForAnchor(tabs, hash) : null;
  if (linked) return linked;
  if (remembered && tabs.some((t) => t.id === remembered)) return remembered;
  return tabs[0]?.id ?? "";
}
