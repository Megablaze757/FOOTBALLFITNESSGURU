import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = () => readFileSync("scripts/reel-overlay.js", "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FIRST FRAME IS THE PRODUCT, NOT A TITLE CARD.
 *
 * The hook was `inset:0` with `background:rgba(6,6,8,0.93)` — a 93% opaque
 * black card over the whole frame for the first 1.6 seconds. So the reel
 * opened as a title slide: no product, no movement, one sentence, in the
 * second where a scroller decides. Instagram reported a 91.7% skip rate on
 * that reel — higher than typical — and lists skip rate FIRST among the things
 * that affect reach.
 *
 * This is the kind of change that gets undone by somebody making the hook
 * "stand out more", so it is a test rather than a comment.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the hook never blacks out the frame", () => {
  const src = overlay();
  const hook = src.slice(src.indexOf('hook.id = "__reel_hook"'));
  const style = hook.slice(0, hook.indexOf("layer.appendChild"));

  assert.doesNotMatch(style, /inset:0/,
    "the hook covers the whole frame again, so the first second is a title card");

  /**
   * A full-bleed scrim is the specific failure. A pill BEHIND THE WORDS is
   * fine and necessary — this app's public pages are light, and white text on
   * them without a backing is unreadable.
   */
  const fills = [...style.matchAll(/background:rgba\([^)]*?([0-9.]+)\)/g)].map((m) => Number(m[1]));
  for (const alpha of fills) {
    assert.ok(alpha <= 0.92, `a ${alpha} scrim is a blackout, not a caption backing`);
  }
  assert.match(style, /max-width:100%/, "the hook is no longer sized to its text");
});

test("the hook clears the caption band and the platform's own chrome", () => {
  const src = overlay();
  const wrap = src.slice(src.indexOf('hookWrap.style.cssText'), src.indexOf("var hook ="));
  const top = wrap.match(/top:([0-9]+)%/);
  assert.ok(top, "the hook is not positioned by percentage, so it moves with content");
  const pct = Number(top![1]);
  assert.ok(pct >= 8, `${pct}% is under the platform's own header chrome`);
  /**
   * The caption sits 22% up from the bottom, so its top edge is around 72%.
   * The pill is roughly 15% tall, which puts the last position that clears it
   * at about 57%.
   */
  assert.ok(pct <= 55, `${pct}% collides with the caption band`);
});

/** Captions are read by most of the audience, so they keep their backing. */
test("the caption keeps a solid backing", () => {
  const src = overlay();
  /**
   * Bounded by the line that USES it, not by the next declaration. The wider
   * slice ran through the comment above the hook — which quotes the old
   * `rgba(6,6,8,0.93)` blackout — so the assertion matched prose and passed
   * with the caption's own backing deleted. A guard matched by the wrong
   * occurrence, in a test written to catch exactly that class of thing.
   */
  const caption = src.slice(src.indexOf("caption.style.cssText"), src.indexOf("layer.appendChild(caption)"));
  assert.match(caption, /background:rgba/, "the caption lost the pill it is read against");
  assert.match(caption, /font-weight:800|font-weight:900/, "the caption is no longer heavy enough to read on video");
});

/**
 * A frame that does not move is a frame a scroller has finished reading, and
 * the only thing left to do with it is swipe.
 */
test("the recorder starts moving under the hook", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const hookBlock = src.slice(src.indexOf("if (!hookShown)"), src.indexOf("__reelHook(\"\")"));
  assert.match(hookBlock, /scrollTo/,
    "the hook holds a still frame for its whole duration again");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE APP IS DARK. THE REEL SHOULD BE TOO.
 *
 * Every reel so far filmed a light app, and that was never a choice anybody
 * made. app/globals.css says it plainly — "Dark is the default because it
 * always was" — and light is opt-in through `prefers-color-scheme: light`.
 * Playwright's default colorScheme is `light`, so Chromium reported a
 * preference nobody has and the recorder filmed a version of the product most
 * athletes never see.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the recorder films the app in the theme it actually ships", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const contexts = src.split("browser.newContext(").slice(1);
  assert.equal(contexts.length, 2, "the number of browser contexts changed — check both are dark");
  for (const [i, ctx] of contexts.entries()) {
    const options = ctx.slice(0, ctx.indexOf("});"));
    assert.match(options, /colorScheme: "dark"/,
      `context ${i + 1} films in Playwright's default light, which is a preference nobody set`);
  }

  // And the default really is dark, or this whole argument is backwards.
  const css = readFileSync("app/globals.css", "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  assert.match(root, /color-scheme: dark/,
    "the app's default theme is no longer dark, so the recorder is now the odd one out");
});
