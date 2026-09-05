// =============================================================================
// THE STAGE — a second window, phone-shaped, that the app is filmed in.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE BUG THIS FIXES, AND IT IS THE WHOLE FEATURE.
//
// The recorder told you to "share THIS tab" and then handed you a shot list
// saying "go to /journal". Both cannot be true. This app is a single-page app:
// navigating to /journal unmounts the studio, and the studio's cleanup stops
// every track it holds — so the recording died the moment you followed the
// first instruction. Follow the instructions and you get nothing; ignore them
// and you get four minutes of footage of the shot list.
//
// So the app gets its own window and the studio stays put. Nothing unmounts,
// the teleprompter is not on film, and the person reads from one screen while
// the other one is the set.
//
// WHY PHONE-SHAPED, which is the part that is not a bug fix. A reel is 9:16.
// Filming a maximised browser gives you 16:9 footage that every platform then
// pillarboxes or crops through the middle of the layout — and the app is
// responsive, so a 430-wide window IS the phone layout, framed correctly, with
// no crop and no black bars. The aspect ratio is decided here, before the
// recording, because it cannot be fixed afterwards without filming it again.
//
// AUDIO, said plainly: Chrome captures audio from a shared TAB, not from a
// shared WINDOW. The app makes no sound, so nothing is lost — but the
// microphone is now the only audio track, and the mixer downstream has to
// cope with that rather than assume two.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** The window name, so re-opening reuses one stage rather than littering. */
export const STAGE_NAME = "pocketathlete-stage";

/** Where the stage opens. Signed-in home: the app, not the marketing site. */
export const STAGE_ROUTE = "/home";

/** 9:16. Not a preference — it is what the platforms show uncropped. */
export const STAGE_RATIO = 9 / 16;

/**
 * A phone, in CSS pixels. Wider than this and the app serves its tablet
 * layout, which is not the footage anybody wants.
 */
export const STAGE_MAX_H = 932;

/**
 * Below this the app is still correct and the video is unreadable at feed
 * size. Better to overflow a SHORT screen than to film something nobody can
 * read — the window can be moved, the footage cannot be re-shot. A NARROW one
 * is different: there the floor would break the aspect ratio, and it loses.
 */
export const MIN_STAGE_H = 600;

/** Room the browser's own chrome takes above the page. */
export const CHROME_H = 88;

/** Gap between the stage and the edge, so it does not sit flush. */
export const STAGE_MARGIN = 24;

export interface ScreenSize {
  width: number;
  height: number;
}

export interface StageBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * The stage, sized to the screen and parked out of the way.
 *
 * Height first, because height is what the aspect ratio is expensive in and
 * what runs out first on a laptop. The width follows from it, and only then is
 * the width checked against the screen — a 9:16 window is narrow, so this
 * second clamp fires almost never, but "almost never" on somebody's ultrawide
 * is not the same as never.
 */
export function stageBox(screen: ScreenSize): StageBox {
  const usableH = Math.max(0, Math.floor(screen.height) - CHROME_H);
  let height = Math.max(MIN_STAGE_H, Math.min(STAGE_MAX_H, usableH));
  let width = Math.round(height * STAGE_RATIO);

  const usableW = Math.max(0, Math.floor(screen.width) - STAGE_MARGIN * 2);
  if (width > usableW && usableW > 0) {
    /**
     * THE RATIO OUTRANKS THE FLOOR, and this is the one place they can fight.
     *
     * Keeping MIN_STAGE_H here produced a 272x600 window on a narrow screen —
     * 9:20, not 9:16 — which is footage the platforms letterbox. The floor is a
     * preference about legibility; the ratio is the entire reason this function
     * exists, so a screen with no room for a readable phone gets a small one
     * rather than a wrongly-shaped one.
     */
    width = usableW;
    height = Math.round(width / STAGE_RATIO);
  }

  /**
   * Parked RIGHT, and never off the left edge.
   *
   * The studio is what the person reads, so it keeps the space it already
   * occupies. On a screen too narrow to hold both, the stage overlaps rather
   * than disappearing off-screen — a window you cannot see is one you cannot
   * pick in the share dialog either.
   */
  const left = Math.max(0, Math.floor(screen.width) - width - STAGE_MARGIN);
  const top = Math.max(0, Math.min(STAGE_MARGIN, Math.floor(screen.height) - height - CHROME_H));
  return { width, height, left, top };
}

/** `window.open`'s third argument. Order and spacing are not significant. */
export function stageFeatures(box: StageBox): string {
  return [
    `width=${box.width}`,
    `height=${box.height}`,
    `left=${box.left}`,
    `top=${box.top}`,
    // A popup rather than a tab: a tab in this window would be behind the
    // studio, and the share dialog lists it by a title identical to this one.
    "popup=yes",
    "noopener=no",
  ].join(",");
}

/**
 * Is this route something the stage can be sent to?
 *
 * Same-origin paths only. The beats are written in this repo, so this is not
 * defending against an attacker — it is defending against a typo becoming
 * `window.location = "https://…"` on a window the studio is driving, which
 * would navigate the stage away from the app mid-take with no way back.
 */
export function isStageRoute(route: string): boolean {
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(route) || route === "/";
}
