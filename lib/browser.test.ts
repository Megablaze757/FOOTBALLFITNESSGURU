import test from "node:test";
import assert from "node:assert/strict";
import { detectBrowser, installGuide, type BrowserEnv } from "./browser";

/**
 * "Browser detection so if they are on Google for example the steps to add it
 * to home page are different."
 *
 * They were not different — there were two cases and everybody outside them got
 * nothing at all. Chrome on iPhone is the largest of those: NO iOS browser
 * fires `beforeinstallprompt`, and the old check tested for Safari by name, so
 * an iPhone Chrome user saw no button and no instructions.
 *
 * Every user agent below is a real one. Sniffing is a last resort and this is
 * one of the places for it — there is no feature test for "where is the Add to
 * Home Screen button in this browser's menus".
 */

const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1",
  iosFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/123.0 Mobile/15E148 Safari/605.1.15",
  iosEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/122.0.2365.86 Mobile/15E148 Safari/604.1",
  iPadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0",
  samsung: "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 322.0.0.34.111 (iPhone14,3; iOS 17_4; en_GB)",
  facebook: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/452.0.0.34.108;]",
  tiktok: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.5.0 JsSdk/2.0 NetType/WIFI",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.66",
  desktopFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
};

test("a browser inside another app is recognised before anything else", () => {
  // THE CASE THAT MATTERED MOST AND WAS MISSED HARDEST. Their user agents also
  // contain "Safari" or "Chrome", so any check that ran first would claim them
  // — and they are the one case whose advice is completely different, because
  // they cannot install at all.
  for (const [name, ua] of [["instagram", UA.instagram], ["facebook", UA.facebook], ["tiktok", UA.tiktok]] as const) {
    assert.equal(detectBrowser(ua).browser, "inapp", name);
    const guide = installGuide(detectBrowser(ua));
    assert.equal(guide.possible, false, name);
    assert.match(guide.steps.join(" "), /Open in/i, name);
    // And it must not send them hunting for a Share sheet that has no Add to
    // Home Screen in it.
    assert.doesNotMatch(guide.steps.join(" "), /Add to Home Screen/i, name);
  }
});

test("Chrome on an iPhone gets iPhone instructions", () => {
  // The old check was `isIOS && isSafari`, which excluded CriOS by name — so
  // the second most common browser on the platform got a blank screen. No iOS
  // browser fires beforeinstallprompt, so there is no button to fall back on.
  const env = detectBrowser(UA.iosChrome);
  assert.deepEqual({ platform: env.platform, browser: env.browser }, { platform: "ios", browser: "chrome" });
  const guide = installGuide(env);
  assert.equal(guide.possible, true);
  assert.equal(guide.promptable, false, "no iOS browser can be prompted");
  assert.match(guide.title, /Chrome/);
  assert.match(guide.steps.join(" "), /Add to Home Screen/);
});

test("every iOS browser is iOS, whatever it is called", () => {
  for (const [name, ua] of [["safari", UA.iosSafari], ["chrome", UA.iosChrome], ["firefox", UA.iosFirefox], ["edge", UA.iosEdge]] as const) {
    const env = detectBrowser(ua);
    assert.equal(env.platform, "ios", name);
    assert.equal(env.browser, name, name);
    assert.equal(installGuide(env).promptable, false, `${name} must never be offered a button that cannot work`);
  }
});

test("an iPad is not a Mac, however it introduces itself", () => {
  // iPadOS 13+ reports Macintosh on purpose, so sites serve the desktop layout.
  // A straight /iPad/ test misses every modern iPad and would send them to the
  // File menu of a browser that has no File menu.
  assert.equal(detectBrowser(UA.iPadOS, { maxTouchPoints: 5 }).platform, "ios");
  assert.equal(detectBrowser(UA.macSafari, { maxTouchPoints: 0 }).platform, "macos");
});

test("Chrome is not Safari and Edge is not Chrome", () => {
  // Every one of these user agents contains the token of the browser above it.
  // Any reordering of the checks is a bug, which is what this exists to catch.
  assert.equal(detectBrowser(UA.macChrome).browser, "chrome");
  assert.equal(detectBrowser(UA.macSafari).browser, "safari");
  assert.equal(detectBrowser(UA.winEdge).browser, "edge");
  assert.equal(detectBrowser(UA.samsung).browser, "samsung");
  assert.equal(detectBrowser(UA.androidChrome).browser, "chrome");
  assert.equal(detectBrowser(UA.androidFirefox).browser, "firefox");
});

test("Firefox on Android gets steps rather than a button", () => {
  // It never fires the event, so offering a button would be offering a control
  // that does nothing.
  const guide = installGuide(detectBrowser(UA.androidFirefox));
  assert.equal(guide.promptable, false);
  assert.equal(guide.possible, true);
  assert.match(guide.steps.join(" "), /Install/i);
});

test("Firefox on desktop says it cannot, and says everything still works", () => {
  const guide = installGuide(detectBrowser(UA.desktopFirefox));
  assert.equal(guide.possible, false);
  // Telling somebody their browser cannot do something, without telling them
  // the app still works in it, reads as "you are on the wrong browser".
  assert.match(guide.note ?? "", /works/i);
});

test("Safari on a Mac is told about the Dock", () => {
  const guide = installGuide(detectBrowser(UA.macSafari, { maxTouchPoints: 0 }));
  assert.match(guide.steps.join(" "), /Dock/);
  // And told what it needs, because it silently does nothing on older macOS.
  assert.match(guide.note ?? "", /Sonoma/);
});

test("every browser gets something to read", () => {
  // The whole complaint: most of them got nothing. Not one combination may
  // return an empty guide, including one we failed to recognise at all.
  const envs: BrowserEnv[] = [
    ...Object.values(UA).map((ua) => detectBrowser(ua, { maxTouchPoints: 5 })),
    { platform: "other", browser: "unknown", standalone: false },
  ];
  for (const env of envs) {
    const guide = installGuide(env);
    assert.ok(guide.title.length > 0, JSON.stringify(env));
    assert.ok(guide.steps.length > 0, JSON.stringify(env));
    for (const step of guide.steps) {
      assert.match(step, /^[A-Z“]/, `"${step}" does not read like an instruction`);
      assert.match(step, /[.!]$/, `"${step}" is missing its full stop`);
    }
  }
});

test("nothing claims a browser can be prompted when it cannot", () => {
  // `beforeinstallprompt` is Chromium-only and never fires on iOS. Showing an
  // Install button that does nothing is worse than showing instructions.
  for (const ua of Object.values(UA)) {
    const env = detectBrowser(ua, { maxTouchPoints: 5 });
    const guide = installGuide(env);
    if (!guide.promptable) continue;
    assert.notEqual(env.platform, "ios", ua);
    assert.ok(["chrome", "edge", "samsung"].includes(env.browser), ua);
  }
});
