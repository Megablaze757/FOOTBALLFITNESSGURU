import type { CapacitorConfig } from "@capacitor/cli";

/**
 * iOS shell for the App Store.
 *
 * The web app is a static export, so there is nothing to port — Capacitor
 * serves the same `out/` bundle from inside a native container. That is the
 * whole reason this is a wrapper and not a rewrite.
 *
 * See mobile/README.md for the build and submission runbook, and for the one
 * genuine risk: App Store Review Guideline 4.2.
 */
const config: CapacitorConfig = {
  appId: "com.pocketathlete.app",
  appName: "PocketAthlete",

  /**
   * The built site, copied here by `npm run sync` (see package.json).
   *
   * BUNDLED, NOT `server.url`. Pointing Capacitor at pocketathlete.com would be
   * a two-line config and is the single most reliable way to be rejected under
   * 4.2 — a container whose only job is to load a website is, to a reviewer,
   * a website. Bundling also means the app opens instantly, works on a plane,
   * and cannot break because a deploy went wrong.
   */
  webDir: "www",

  ios: {
    // The app is dark end to end; a white flash between splash and first paint
    // is the cheapest possible way to look unfinished.
    backgroundColor: "#0a0a0b",
    contentInset: "always",
    // Let iOS keep its own scroll physics. `overscroll-behavior-y: none` in
    // globals.css already stops the rubber-band that was dragging the floating
    // nav around; disabling bounce natively as well makes lists feel dead.
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden by the app once React has painted
      backgroundColor: "#0a0a0b",
      showSpinner: false,
    },
  },
};

export default config;
