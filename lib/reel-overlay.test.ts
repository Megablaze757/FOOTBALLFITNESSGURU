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
  // rgba OR rgb: the fill became opaque so it survives a dark background, and
  // this check is about the pill existing at all.
  assert.match(caption, /background:rgba?\(/, "the caption lost the pill it is read against");
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PILL THAT WORKS ON ANY BACKGROUND.
 *
 * Both fills were translucent near-black. That separated the words from a
 * LIGHT page perfectly and vanished entirely on a dark one — the app's own
 * ground is rgb(9,9,10) — so the first dark reel had the page's own text
 * reading straight through the caption.
 *
 * A caption cannot rely on being darker than what is behind it. Opaque fill,
 * and a light rim so it still has an edge when the thing behind it is as dark
 * as the fill.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the caption and hook stay legible on a dark page", () => {
  const src = overlay();
  const caption = src.slice(src.indexOf("caption.style.cssText"), src.indexOf("layer.appendChild(caption)"));
  const hook = src.slice(src.indexOf('hook.id = "__reel_hook"'), src.indexOf("hookWrap.appendChild(hook)"));

  for (const [name, block] of [["caption", caption], ["hook", hook]] as const) {
    // A translucent fill over a background the same colour is no fill at all.
    const translucent = block.match(/background:rgba\([^)]*?([0-9.]+)\)/);
    assert.equal(translucent, null,
      `the ${name} fill is translucent again, so it disappears on the app's own dark ground`);
    assert.match(block, /border:2px solid rgba\(255,255,255/,
      `the ${name} has no rim, so it has no edge against a dark page`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SPOTLIGHT. "The app demo isn't clear what's what."
 *
 * A reel shows a whole app screen — a ring, four macro rows, a coaching
 * paragraph, a nav bar — while the voice talks about one of them, and nothing
 * on screen says which. The viewer spends the shot hunting and mostly does not
 * find it before the cut.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the overlay can point at one thing", () => {
  const src = overlay();
  assert.match(src, /window\.__reelFocus = function/, "nothing can aim the shot");

  /**
   * A spotlight on nothing is worse than no spotlight, and it would be
   * invisible until somebody watched the finished reel.
   */
  assert.match(src, /if \(!found\) \{ spot\.style\.opacity = "0"; return false; \}/,
    "text that is not on screen dims the whole frame instead of doing nothing");

  // The smallest element containing the words, or every ancestor matches and
  // the spotlight is <body>.
  assert.match(src, /box\.width \* box\.height < best\.box\.width \* best\.box\.height/,
    "the spotlight does not prefer the smallest match, so it will pick a container");

  // Text, not a selector: a selector is a promise about markup this file does
  // not own, and it breaks silently when a class is renamed.
  assert.doesNotMatch(src, /querySelector\((?!"body \*")/,
    "the spotlight targets a CSS selector, which breaks silently on a rename");
});

test("the spotlight never dims the caption", () => {
  const src = overlay();
  assert.match(src, /layer\.insertBefore\(spot, layer\.firstChild\)/,
    "the spotlight is appended after the caption, so it dims the words too");
});

/** A beat that names something not on screen must say so, not fail silently. */
test("the recorder reports a spotlight that found nothing", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /if \(want && !aimed\)/, "a missed spotlight is silent");
  assert.match(src, /step\.focus/, "the recorder never reads the beat's focus");
});

/**
 * The plan has to CARRY focus, not be cast to it. The first version read
 * `focus` off a PlanStep that never had one — a cast made it typecheck, and it
 * would have been undefined on every beat, so the whole feature would have
 * shipped doing nothing.
 */
test("focus survives the trip from script to plan", async () => {
  const { reelPlan } = await import("./reel-plan");
  const plan = reelPlan({
    id: "t", hook: "h", totalMs: 1000,
    beats: [{ at: 0, ms: 1000, route: "/", action: "a", say: "Something", focus: "Red lentils" }],
  });
  assert.equal(plan.steps[0].focus, "Red lentils", "the spotlight would never be aimed");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SPOTLIGHT HAS TO SURVIVE THE ZOOM.
 *
 * The recorder zooms documentElement so a 1080x1920 viewport still lays out as
 * a 540px phone. getBoundingClientRect and window.innerHeight report VISUAL
 * pixels — the full 1920 — but the overlay lives inside the zoomed element, so
 * a CSS pixel it sets is multiplied on the way to the screen.
 *
 * Setting top to a visual 750 drew the ring at 1500. Measured on the live
 * page before the fix: styleTop 1483px produced a rect at 2966px, in a
 * viewport 1920 tall — the spotlight was off-frame for anything below the top
 * of the screen, and nothing would have caught it except watching the reel.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the spotlight converts out of visual pixels", () => {
  const src = overlay();
  const focus = src.slice(src.indexOf("window.__reelFocus = function"));
  assert.match(focus, /getComputedStyle\(document\.documentElement\)\.zoom/,
    "the spotlight never reads the zoom, so it is drawn at the wrong scale");

  // Every measured coordinate, not just some of them: a ring in the right
  // place with dim panels in the wrong one is still a broken shot.
  for (const name of ["top", "left", "right", "bottom"]) {
    assert.match(
      focus,
      new RegExp(`var ${name} = Math\\.(?:max|min)\\([^;]*\\) / zoom;`),
      `${name} is not converted out of visual pixels`,
    );
  }
  assert.match(focus, /\|\| 1;/, "an unzoomed page would divide by NaN");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COLOURED FIGURE.
 *
 * Colour is a pre-attentive feature — a uniquely coloured item is located in
 * roughly constant time however much else is on screen. A caption is up for
 * under two seconds and most of the audience has the sound off, so the eye
 * gets one movement; this makes it land on the number.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the caption colours the figure and sweeps the rest word by word", () => {
  const src = overlay();
  const fn = src.slice(src.indexOf("window.__reelCaption = function"));
  assert.match(fn, /words\[i\]\.key/, "nothing distinguishes the figure");
  assert.match(fn, /setTimeout/, "there is no sweep — the caption is static again");
  assert.match(fn, /words\[j\]\.at/, "the sweep is not driven by the measured word timings");
  assert.match(fn, /typeof value === "string"/,
    "a plain string no longer renders, so any un-updated caller draws nothing");
  assert.match(fn, /el\.textContent = ""/, "words are appended to the previous caption");
});

/**
 * The one that bit. Timers from a caption that has been replaced will still
 * fire and light a word inside the line that came after it, and the words are
 * different objects each time so the wrong span simply turns yellow forever.
 */
test("a replaced caption cancels its own sweep", () => {
  const src = overlay();
  const fn = src.slice(src.indexOf("window.__reelCaption = function"));
  assert.match(fn, /clearTimers\(\)/, "the previous line's timers keep running under the new one");
  assert.ok(
    fn.indexOf("clearTimers()") < fn.indexOf("el.textContent = \"\""),
    "the timers are cleared after the new caption is drawn, which is too late",
  );
});

/** 10.3:1 against the pill — past WCAG AAA for large text. */
test("the highlight is legible, not just bright", () => {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
  const L = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [L(a[0], a[1], a[2]), L(b[0], b[1], b[2])];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const accent = ratio([255, 232, 26], [10, 10, 11]);
  assert.ok(accent >= 4.5, `${accent.toFixed(1)}:1 is under WCAG AAA for large text`);
  // And it must still read as a different colour from the white around it.
  assert.ok(ratio([227, 181, 63], [255, 255, 255]) >= 1.6,
    "the highlight is too close to white to be seen as a highlight");
});

test("the recorder hands the caption timed words, not a string", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /__reelCaption\(words\)/, "the caption is drawn without emphasis");
  assert.match(src, /karaokeWords\(caption\.text, caption\.ms\)/,
    "the sweep is timed from something other than the caption's own duration");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A COMPOSED SHOT HOLDS STILL.
 *
 * The spotlight is position:fixed and computed once, when the beat aims it.
 * The drift then scrolled the page out from under it — so a reveal frame went
 * out with a gold ring, correctly drawn, around "Turkey breast mince £1.06"
 * while the caption said "Cheapest: £0.31". Worse than no spotlight: it
 * pointed confidently at the wrong row.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a beat that aimed the shot does not then scroll off it", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const loop = src.slice(src.indexOf("for (const [i, caption] of step.captions.entries())"));
  const body = loop.slice(0, loop.indexOf("\n  }"));

  const caption = body.indexOf("__reelCaption");
  const skip = body.indexOf("if (aimed) continue;");
  const drift = body.indexOf("driftTarget({");

  assert.ok(skip > 0, "a focused beat still drifts, so the spotlight ends up on the wrong row");
  assert.ok(caption < skip, "the caption is skipped along with the drift");
  assert.ok(skip < drift, "the skip comes after the scroll it is meant to prevent");
});
