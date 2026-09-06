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
