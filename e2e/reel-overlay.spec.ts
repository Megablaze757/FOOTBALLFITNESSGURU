import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SPOTLIGHT WAS DIMMING THE CAPTION IT WAS POINTING WITH.
 *
 * scripts/reel-overlay.js draws four fixed dim panels around the element a
 * beat is about. The caption was a plain flex child with no `position`, and
 * CSS paints positioned elements above every non-positioned one in the same
 * stacking context — DOM order only ranks within a phase. So the panels
 * covered the caption whatever order the elements were inserted in, and the
 * `insertBefore` meant to prevent it did nothing.
 *
 * Measured on the recorded reel: caption text averaged 79 of 255 on the two
 * spotlight beats and 149 on the beats without one. Those two beats are the
 * reveals the whole reel is built around.
 *
 * WHY A BROWSER TEST. This is a question about paint order, and the only
 * thing that answers it is a renderer. A source-text assertion that the rule
 * "position:relative;z-index:1" is present would pass on a stylesheet that
 * some later change overrode.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const OVERLAY = readFileSync("scripts/reel-overlay.js", "utf8");

/**
 * PAINT ORDER, ANSWERED BY THE RENDERER.
 *
 * The first version of this screenshotted the caption and compared pixel
 * brightness — and skipped, because no PNG decoder is installed. A skipped
 * test proves nothing, which is the same way this bug survived: something
 * that looked like a check and was not one.
 *
 * `elementsFromPoint` returns what is at a point in paint order, topmost
 * first, decided by the same engine that draws the video. It ignores
 * pointer-events:none, so the overlay is made hit-testable for the probe —
 * that changes what the browser will CLICK, never what it paints.
 */
async function stackAt(page: import("@playwright/test").Page, id: string): Promise<string[]> {
  return page.evaluate((target) => {
    const el = document.getElementById(target)!;
    const box = el.getBoundingClientRect();
    const layer = document.getElementById("__reel_layer") as HTMLElement;
    const previous = layer.style.pointerEvents;
    layer.style.pointerEvents = "auto";
    layer.querySelectorAll("*").forEach((n) => ((n as HTMLElement).style.pointerEvents = "auto"));
    const hits = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    layer.style.pointerEvents = previous;
    return hits.map((n) => n.id || (n as HTMLElement).dataset.side || n.tagName.toLowerCase());
  }, id);
}

test("the spotlight never dims the caption", async ({ page }) => {
  await page.goto("/cheapest-protein/");
  await page.addScriptTag({ content: OVERLAY });

  /**
   * The dim is FORCED over the whole frame rather than aimed at a row. An
   * earlier attempt aimed it, the aim silently failed to find its target, and
   * the check passed while proving nothing.
   */
  await page.evaluate(() => {
    const w = window as unknown as Record<string, (r: unknown) => unknown>;
    w.__reelCaption([{ text: "Cheapest: ", key: false }, { text: "31p", key: true }]);
    const spot = document.getElementById("__reel_spot") as HTMLElement;
    spot.style.opacity = "1";
    const panels = [...spot.querySelectorAll("div[data-side]")] as HTMLElement[];
    panels.forEach((el, i) => {
      el.style.left = "0px";
      el.style.right = "0px";
      el.style.top = i === 0 ? "0px" : "99999px";
      el.style.height = i === 0 ? "99999px" : "0px";
    });
  });
  await page.waitForTimeout(200);

  const stack = await stackAt(page, "__reel_caption");
  const caption = stack.indexOf("__reel_caption");
  const dim = stack.findIndex((n) => ["t", "b", "l", "r"].includes(n));

  expect(caption, "the caption is not under the probe point at all").toBeGreaterThanOrEqual(0);
  expect(dim, "the dim panel is not over the caption — the test is no longer testing anything")
    .toBeGreaterThanOrEqual(0);
  expect(caption, `paint order is [${stack.join(", ")}] — the dim panel is above the caption`)
    .toBeLessThan(dim);
});

/**
 * The hook was always right — its wrapper is position:fixed — and that is why
 * only the captions looked wrong. Pinned so a tidy-up cannot quietly take the
 * property away and reintroduce the bug on the opening shot instead.
 */
test("the hook sits above the dimming too", async ({ page }) => {
  await page.goto("/cheapest-protein/");
  await page.addScriptTag({ content: OVERLAY });
  const positioned = await page.evaluate(() => {
    const w = window as unknown as Record<string, (s: string) => unknown>;
    w.__reelHook("Sign up for free today");
    const wrap = document.getElementById("__reel_hook")!.parentElement!;
    const cap = document.getElementById("__reel_caption")!;
    const s = getComputedStyle(wrap);
    const c = getComputedStyle(cap);
    return { hook: s.position, hookZ: s.zIndex, caption: c.position, captionZ: c.zIndex };
  });
  expect(positioned.hook, "the hook wrapper is no longer positioned").not.toBe("static");
  expect(positioned.caption, "the caption is unpositioned again — the spotlight will paint over it")
    .not.toBe("static");
  expect(Number(positioned.captionZ) >= 1, "the caption has no z-index above the spotlight").toBeTruthy();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SWEEP LEFT EVERY WORD IT TOUCHED YELLOW.
 *
 * scripts/reel-overlay.js lights each word as the voice reaches it and only
 * ever undid the SCALE, never the colour. So a seven-word caption ended as
 * seven yellow words, and the one word marked `key` — the figure the whole
 * beat is about, coloured because a unique colour is found without scanning —
 * was by then the same colour as "the".
 *
 * WHY A BROWSER TEST, AGAIN. The bug is in what the element ENDS UP as after
 * a sequence of timers, and the only thing that can answer that is a renderer
 * running the timers. Grepping the source for `previous.style.color` would
 * pass on code that set it to the wrong value.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the sweep marks where the voice is, not how far it has got", async ({ page }) => {
  await page.goto("/cheapest-protein/");
  await page.addScriptTag({ content: OVERLAY });

  const colours = await page.evaluate(async () => {
    const w = window as unknown as Record<string, (r: unknown) => unknown>;
    w.__reelCaption([
      { text: "The", key: false, at: 0 },
      { text: "31p", key: true, at: 40 },
      { text: "row", key: false, at: 80 },
    ]);
    await new Promise((r) => setTimeout(r, 400));
    const spans = [...document.getElementById("__reel_caption")!.querySelectorAll("span")];
    return spans.map((el) => getComputedStyle(el).color);
  });

  const YELLOW = "rgb(255, 232, 26)";
  const WHITE = "rgb(255, 255, 255)";

  expect(colours[0], `"The" is still lit after the sweep passed it — [${colours.join(" | ")}]`).toBe(WHITE);
  expect(colours[1], "the figure lost its permanent highlight, which is the one it is there for").toBe(YELLOW);
  expect(colours[2], "the last word the sweep reached is not lit").toBe(YELLOW);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RING WAS A RECTANGLE DRAWN ONCE, AND THE PAGE MOVED UNDER IT.
 *
 * Extracted two frames of the same beat of the same recording, three seconds
 * apart. At 12s the ring enclosed the readiness gauge and "44 RED" exactly.
 * At 15s the number sat BELOW the ring, dimmed — the one figure the reveal
 * exists to show, greyed out by the thing pointing at it.
 *
 * Nothing scrolled. The strip above the gauge finished loading, got taller,
 * and pushed everything under it down 94 pixels. The ring is position:fixed
 * and had been computed once.
 *
 * The drift had this exact symptom before and was fixed by not drifting on an
 * aimed beat — which could never have fixed this one. Async data, a lazy
 * image, a transition: all identical to a viewer, none of them scrolling.
 *
 * WHY A BROWSER TEST. The question is whether a rectangle still matches an
 * element AFTER a reflow, and only a layout engine can answer it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the ring follows its target when the page reflows under it", async ({ page }) => {
  await page.goto("/cheapest-protein/");
  await page.addScriptTag({ content: OVERLAY });

  const ringBox = () => page.evaluate(() => {
    const ring = document.getElementById("__reel_ring")!;
    const target = document.getElementById("__probe_target")!;
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom as string) || 1;
    const t = target.getBoundingClientRect();
    return {
      ringTop: parseFloat(ring.style.top) * zoom,
      ringHeight: parseFloat(ring.style.height) * zoom,
      targetTop: t.top,
      targetBottom: t.bottom,
    };
  });

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "__probe_spacer";
    spacer.style.height = "0px";
    const target = document.createElement("div");
    target.id = "__probe_target";
    target.textContent = "Ringmeasurement";
    target.style.cssText = "height:120px;width:300px;font-size:20px;";
    document.body.prepend(target);
    document.body.prepend(spacer);
    (window as unknown as Record<string, (s: string) => boolean>).__reelFocus("Ringmeasurement");
  });

  const before = await ringBox();
  expect(before.ringHeight, "the ring was never drawn, so this proves nothing").toBeGreaterThan(0);
  expect(before.ringTop).toBeLessThanOrEqual(before.targetTop);
  expect(before.ringTop + before.ringHeight).toBeGreaterThanOrEqual(before.targetBottom);

  /** Exactly the fault: content ABOVE the target appears and pushes it down. */
  await page.evaluate(() => { document.getElementById("__probe_spacer")!.style.height = "260px"; });
  await page.waitForTimeout(300);

  const after = await ringBox();
  expect(after.targetTop - before.targetTop, "the reflow did not move the target — the test is inert")
    .toBeGreaterThan(100);
  expect(after.ringTop, `the ring stayed at ${after.ringTop} while the target moved to ${after.targetTop}`)
    .toBeLessThanOrEqual(after.targetTop);
  expect(after.ringTop + after.ringHeight,
    "the bottom of the target is outside the ring, which is how the score came to be dimmed")
    .toBeGreaterThanOrEqual(after.targetBottom);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REVEAL OF A PRICE, WITH THE PRICE OUTSIDE THE RING.
 *
 * Photographed at 10s of a recorded demo-cost: the caption reads "The cheap
 * one's red lentils", the ring is drawn neatly around the words "Red lentils",
 * and £0.31 — directly above them, in the same card, the entire point of the
 * reel — is outside it and dimmed.
 *
 * findByText takes the SMALLEST element containing the words, because every
 * ancestor contains them too. That is right for FINDING and wrong for RINGING,
 * and this is the second photograph of the same mistake: the readiness gauge
 * left its own score outside the ring for the same reason.
 *
 * THE REAL PAGE, not a fixture. The rule is "grow while the parent is still
 * about the same thing", and whether a summary card is within three times the
 * height of its own label is a fact about this app's markup. A fixture would
 * be me deciding the answer and then checking my own arithmetic.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the ring around a name includes the figure beside it", async ({ page }) => {
  await page.goto("/cheapest-protein/");
  await page.addScriptTag({ content: OVERLAY });

  const result = await page.evaluate(() => {
    const w = window as unknown as Record<string, (s: string) => boolean>;
    const aimed = w.__reelFocus("Red lentils");
    const ring = document.getElementById("__reel_ring")!;
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom as string) || 1;
    const top = parseFloat(ring.style.top) * zoom;
    const bottom = top + parseFloat(ring.style.height) * zoom;

    /** The summary card's own price, found the way a reader finds it. */
    const price = [...document.querySelectorAll("body *")]
      .filter((el) => (el.textContent ?? "").trim() === "£0.31" && el.children.length === 0)
      .map((el) => el.getBoundingClientRect())
      .find((b) => b.height > 0);

    return { aimed, top, bottom, price: price ? { top: price.top, bottom: price.bottom } : null };
  });

  expect(result.aimed, "the spotlight found nothing to aim at").toBe(true);
  expect(result.price, "£0.31 is not on this page any more — the test is checking nothing").not.toBeNull();
  expect(result.top, `the ring starts at ${result.top}, below the price at ${result.price!.top}`)
    .toBeLessThanOrEqual(result.price!.top);
  expect(result.bottom).toBeGreaterThanOrEqual(result.price!.bottom);
});
