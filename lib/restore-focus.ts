// =============================================================================
// WHERE "TAKE ME THERE" ACTUALLY LANDS.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE BUG THIS EXISTS FOR, IN THE WORDS IT WAS REPORTED IN:
//
//   "When i reclick on the log to restor it should auto reguide me to restore
//    button rather to middle of oage"
//
// Check in at 7am. Train in the evening, open the log, get three drills into
// the session, put the phone down. Come back: the page says you're done for
// today, so you tap "Add today's training" — and the app scrolls you to the
// training section, half a page DOWN, past the one thing you came back for.
// The "You have unfinished changes" banner with the Restore button on it is at
// the top of the form, now off screen above you, and nothing says it is there.
//
// So the restore banner outranks whatever was asked for. It is not a
// preference about scroll position; it is about ORDER OF OPERATIONS. Restoring
// a draft replaces what is in the form, so it is a decision that has to be made
// BEFORE the section below it is touched — anyone who types into the training
// section first and finds the banner afterwards has to choose between the two
// halves of their own evening.
//
// WHY THE RETRY, which is the part that looks like superstition and isn't.
// The banner and the section it outranks mount in that order but not in the
// same render: the section exists as soon as the form mounts, while the banner
// waits on an effect that reads localStorage and sets state. A single frame's
// look at the page can therefore see the fallback and not the winner, and
// scrolling to the fallback at that point is the exact bug this file is about.
// So a frame where only the fallback exists is not an answer yet — it is a
// reason to look again. Only when the frames run out does the fallback win.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** The unfinished-draft banner — the one carrying the Restore button. */
export const RESTORE_ANCHOR = "draft-restore";

/**
 * The training section, half a page below it.
 *
 * Two ids because the form has two shapes: the quick check-in puts the training
 * row inline, the detailed one gives it a section of its own, and a ternary
 * means exactly one of them is on the page at a time.
 */
export const TRAINING_ANCHORS = ["training", "log-training"] as const;

/**
 * How many extra frames to hold out for the banner before settling.
 *
 * Two, not ten. This runs while somebody is looking at the screen, and every
 * frame spent waiting is a frame where their tap did nothing visible.
 */
export const GUIDE_FRAMES = 2;

/**
 * The elements a scroll should try, best first.
 *
 * The restore banner is always first and is never duplicated, so a caller can
 * name it explicitly without changing the result.
 */
export function scrollOrder(requested: readonly string[]): string[] {
  const seen = new Set<string>([RESTORE_ANCHOR]);
  const order = [RESTORE_ANCHOR];
  for (const id of requested) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  return order;
}

/** The first id in `order` that is actually on the page. */
export function firstPresent(order: readonly string[], exists: (id: string) => boolean): string | null {
  for (const id of order) if (exists(id)) return id;
  return null;
}

export type GuideStep =
  | { action: "scroll"; id: string }
  /** Nothing worth scrolling to yet — look again next frame. */
  | { action: "wait" }
  /** Nothing on the page at all. Leave the view where it is. */
  | { action: "stop" };

/**
 * What to do this frame.
 *
 * Pure, and separate from the component, because the interesting part is the
 * order — and getting it wrong produces a page that scrolls somewhere
 * plausible, which is the kind of wrong that no one reports as a bug and
 * everyone works around.
 */
export function guideStep(
  requested: readonly string[],
  exists: (id: string) => boolean,
  framesLeft: number,
): GuideStep {
  const order = scrollOrder(requested);
  const best = order[0];
  if (exists(best)) return { action: "scroll", id: best };
  // See the header: the fallback existing on its own is not yet an answer.
  if (framesLeft > 0) return { action: "wait" };
  const id = firstPresent(order, exists);
  return id ? { action: "scroll", id } : { action: "stop" };
}

// --- The browser side -------------------------------------------------------

/** Inside the banner, so the driver can put the keyboard on the button too. */
export const RESTORE_BUTTON_ATTR = "data-restore";

/**
 * Scroll to the best available target, waiting a couple of frames for it.
 *
 * Returns a cancel function: React effects unmount, and a scroll landing after
 * the person has already navigated away is worse than no scroll at all.
 */
export function guideTo(requested: readonly string[]): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const exists = (id: string) => !!document.getElementById(id);
  let handle: number | null = null;
  let framesLeft = GUIDE_FRAMES;

  const run = () => {
    handle = null;
    const step = guideStep(requested, exists, framesLeft);
    framesLeft -= 1;
    if (step.action === "wait") {
      handle = window.requestAnimationFrame(run);
      return;
    }
    if (step.action === "stop") return;

    const el = document.getElementById(step.id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    // The button, not just the region. Someone arriving by keyboard should be
    // one Enter from the thing the scroll was for; `preventScroll` because the
    // smooth scroll above is already on its way and focus would snap past it.
    const button = el?.querySelector<HTMLElement>(`[${RESTORE_BUTTON_ATTR}]`);
    try { button?.focus({ preventScroll: true }); } catch { /* older Safari */ }
  };

  handle = window.requestAnimationFrame(run);
  return () => {
    if (handle !== null) window.cancelAnimationFrame(handle);
    handle = null;
  };
}
