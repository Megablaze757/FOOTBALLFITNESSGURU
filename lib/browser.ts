// =============================================================================
// Which browser is this, and how does somebody install the app from it?
//
// WHAT WAS THERE. Two cases. `beforeinstallprompt` fires — Chrome and Edge on
// Android and desktop — and the athlete gets a real Install button. Or the user
// agent says iPhone AND Safari, and they get one sentence about the Share
// sheet. Everybody else got NOTHING: no button, no instructions, no
// acknowledgement that installing is a thing.
//
// "Everybody else" is not a rounding error. It is:
//
//   Chrome on iPhone        the second most common mobile browser there is, and
//                           beforeinstallprompt does not fire in ANY iOS
//                           browser — the old check excluded it by name
//   Firefox / Edge on iOS   same
//   Firefox on Android      never fires the event
//   Safari on a Mac         installs to the Dock and was never mentioned
//   in-app browsers         Instagram, Facebook, TikTok. These CANNOT install
//                           at all, and the honest instruction is not "tap
//                           Share" — it is "open this in your real browser
//                           first", which nothing anywhere said
//
// The in-app case is the one that matters most and was missed hardest. A link
// shared to Instagram opens inside Instagram, where there is no Add to Home
// Screen anywhere in the menu — so an athlete following the advice literally
// hunts for a button that does not exist, which is exactly the failure mode of
// telling somebody to change a setting their phone does not have.
//
// USER-AGENT SNIFFING IS A LAST RESORT AND THIS IS ONE OF THE PLACES FOR IT.
// There is no feature test for "where is the Add to Home Screen button in this
// browser's menus". The steps are a fact about a UI, and the only thing that
// identifies the UI is the user agent.
//
// Pure + tested against real strings.
// =============================================================================

export type Platform = "ios" | "android" | "macos" | "windows" | "other";

export type BrowserName =
  | "safari" | "chrome" | "firefox" | "edge" | "samsung" | "opera"
  /** Instagram, Facebook, TikTok and friends — a webview, not a browser. */
  | "inapp"
  | "unknown";

export interface BrowserEnv {
  platform: Platform;
  browser: BrowserName;
  /** True when the page is already running as an installed app. */
  standalone: boolean;
}

/** What the athlete should be shown, and what they can be offered. */
export interface InstallGuide {
  /** Can this browser install at all? False inside an in-app webview. */
  possible: boolean;
  /**
   * True when the browser fires `beforeinstallprompt`, so a real button can do
   * it. The steps are still filled in as a fallback: the event is fired at the
   * browser's discretion and simply may not arrive.
   */
  promptable: boolean;
  /** One line naming where they are, so the advice is visibly about them. */
  title: string;
  /** The steps, in order. Written to be followed while holding the phone. */
  steps: string[];
  /** The one thing that goes wrong here, when there is one. */
  note?: string;
}

/**
 * Parse a user agent.
 *
 * ORDER MATTERS THROUGHOUT and every reordering here is a bug. Chrome's UA
 * contains "Safari", Edge's contains "Chrome" and "Safari", and every iOS
 * browser contains all three because they are all WebKit underneath. So the
 * specific tokens are checked before the general ones, always.
 */
export function detectBrowser(
  ua: string,
  opts: { maxTouchPoints?: number; standalone?: boolean } = {}
): BrowserEnv {
  const s = ua ?? "";
  const standalone = !!opts.standalone;

  /**
   * iPadOS 13+ reports itself as a Mac.
   *
   * Apple did this deliberately so sites would serve the desktop layout, and it
   * means a straight /iPad/ test misses every modern iPad. Touch points is the
   * standard discriminator: a real Mac reports 0 or 1.
   */
  const iPadOS = /Macintosh/.test(s) && (opts.maxTouchPoints ?? 0) > 1;
  const platform: Platform =
    /iPad|iPhone|iPod/.test(s) || iPadOS ? "ios"
    : /Android/.test(s) ? "android"
    : /Macintosh|Mac OS X/.test(s) ? "macos"
    : /Windows/.test(s) ? "windows"
    : "other";

  return { platform, browser: browserFrom(s), standalone };
}

function browserFrom(s: string): BrowserName {
  // IN-APP WEBVIEWS FIRST. Their user agents also contain "Safari" or "Chrome",
  // so anything checked before this would claim them — and they are the one
  // case whose advice is completely different.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|Twitter|Pinterest/i.test(s)) return "inapp";

  // The iOS family. Every one of these is WebKit and every one of their user
  // agents ends in "Safari", so the branded token is the only signal.
  if (/CriOS/.test(s)) return "chrome";
  if (/FxiOS/.test(s)) return "firefox";
  if (/EdgiOS/.test(s)) return "edge";
  if (/OPiOS|OPT\//.test(s)) return "opera";

  // Desktop and Android. Edge and Opera both include "Chrome"; Samsung
  // Internet includes both "Chrome" and "Safari".
  if (/Edg[A?]?\//.test(s) || /Edge\//.test(s)) return "edge";
  if (/SamsungBrowser/.test(s)) return "samsung";
  if (/OPR\//.test(s) || /Opera/.test(s)) return "opera";
  if (/Firefox\//.test(s)) return "firefox";
  if (/Chrome\//.test(s) || /Chromium/.test(s)) return "chrome";
  if (/Safari\//.test(s)) return "safari";
  return "unknown";
}

const SHARE_ICON = "the Share button — a square with an arrow pointing up out of it";

/**
 * The instructions for this browser.
 *
 * WRITTEN BY WHAT THE BUTTON LOOKS LIKE, not by where it sits. Menu positions
 * move between versions and between phones, and sending somebody to a precise
 * corner that turns out to be empty is worse than describing the icon and
 * letting them find it — the same mistake as telling an athlete to change a
 * setting their phone does not have.
 */
export function installGuide(env: BrowserEnv): InstallGuide {
  const { platform, browser } = env;

  if (browser === "inapp") {
    return {
      possible: false,
      promptable: false,
      title: "You're inside another app's browser",
      steps: [
        "Tap the ⋯ or ⋮ menu, usually in a corner of the screen.",
        platform === "ios"
          ? "Choose “Open in Safari” — or “Open in browser”, depending on the app."
          : "Choose “Open in Chrome”, or “Open in browser”.",
        "Then add it to your home screen from there.",
      ],
      note: "Apps like Instagram and Facebook open links in their own mini-browser, which cannot add anything to your home screen. That is a limit of theirs, not something you have set wrongly.",
    };
  }

  if (platform === "ios") {
    // NO iOS BROWSER FIRES beforeinstallprompt — not one, including Chrome.
    // The old check tested for Safari specifically and therefore showed nothing
    // at all to a Chrome user, who needs the instructions just as much.
    const where = browser === "safari"
      ? "at the bottom of the screen"
      : "in the address bar, or under the ⋯ menu";
    return {
      possible: true,
      promptable: false,
      title: browser === "safari" ? "On iPhone or iPad, in Safari" : `On iPhone or iPad, in ${label(browser)}`,
      steps: [
        `Tap ${SHARE_ICON}, ${where}.`,
        "Scroll down the list and tap “Add to Home Screen”.",
        "Tap “Add”, top right.",
      ],
      note: "Reminders and notifications only work once it is on your home screen — that is an Apple rule, not ours.",
    };
  }

  if (platform === "android") {
    if (browser === "firefox") {
      return {
        possible: true,
        promptable: false,
        title: "On Android, in Firefox",
        steps: [
          "Tap the ⋮ menu.",
          "Tap “Install” — or “Add to Home screen” on older versions.",
        ],
      };
    }
    return {
      possible: true,
      // Chrome, Edge and Samsung Internet all fire the event. Samsung's arrives
      // less reliably, which is exactly why the steps are written out anyway.
      promptable: browser === "chrome" || browser === "edge" || browser === "samsung",
      title: `On Android, in ${label(browser)}`,
      steps: [
        "Tap the ⋮ menu.",
        "Tap “Install app”, or “Add to Home screen”.",
        "Confirm.",
      ],
    };
  }

  // Desktop.
  if (browser === "safari") {
    return {
      possible: true,
      promptable: false,
      title: "On a Mac, in Safari",
      steps: [
        "Open the File menu.",
        "Choose “Add to Dock”.",
      ],
      note: "Needs macOS Sonoma or newer. On an older Mac, Chrome or Edge can install it instead.",
    };
  }
  if (browser === "firefox") {
    return {
      possible: false,
      promptable: false,
      title: "Firefox on desktop cannot install web apps",
      steps: ["Open pocketathlete.com in Chrome, Edge or Safari to install it."],
      note: "Everything works in Firefox — this only affects putting an icon on your desktop.",
    };
  }
  return {
    possible: true,
    promptable: browser === "chrome" || browser === "edge",
    title: `On your computer, in ${label(browser)}`,
    steps: [
      "Click the install icon in the address bar — a screen with a downward arrow.",
      "Or open the ⋮ menu and choose “Install PocketAthlete”.",
    ],
  };
}

function label(browser: BrowserName): string {
  switch (browser) {
    case "safari": return "Safari";
    case "chrome": return "Chrome";
    case "firefox": return "Firefox";
    case "edge": return "Edge";
    case "samsung": return "Samsung Internet";
    case "opera": return "Opera";
    case "inapp": return "an in-app browser";
    default: return "your browser";
  }
}

/** Read the live environment. Safe to call during render; returns a default on the server. */
export function currentBrowser(): BrowserEnv {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { platform: "other", browser: "unknown", standalone: false };
  }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
  return detectBrowser(navigator.userAgent, {
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  });
}
