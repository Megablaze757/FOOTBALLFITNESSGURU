import { test } from "node:test";
import assert from "node:assert/strict";
import { AA_NORMAL, contrast, luminance, over, parseHex, ratio } from "./contrast";
import {
  DARK, LIGHT, PALETTES, THEME_STORAGE_KEY,
  cssVariables, rgbChannels, surfacesOf, textTokensOf,
} from "./theme";

/**
 * The maths, checked against something independent of itself: the ratios a
 * person measured by hand and wrote into tailwind.config.ts before any of this
 * existed. If these drift, the checker is wrong and every number below is
 * worthless.
 */
test("the contrast maths reproduces the hand measurements it replaces", () => {
  assert.equal(ratio(contrast("#ffffff", "#000000")), "21.00");
  assert.equal(ratio(contrast("#000000", "#000000")), "1.00");

  const card = over("#101011", "#09090a", 0.7);
  assert.equal(ratio(contrast("#8391a6", card)), "6.03", "config measured slate-500 at 6.03");
  assert.equal(ratio(contrast("#94a3b8", card)), "7.53", "config measured slate-400 at 7.5");
  assert.equal(ratio(contrast("#e3b53f", card)), "10.06", "config measured pitch-400 at 10.1");

  // Order must not matter.
  assert.equal(contrast("#e3b53f", card), contrast(card, "#e3b53f"));
});

test("hex parsing takes what CSS takes", () => {
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("0a0a0b"), { r: 10, g: 10, b: 11 });
  assert.ok(luminance("#ffffff") > luminance("#808080"));
  for (const bad of ["", "#12345", "not a colour", "#gggggg"]) {
    assert.throws(() => parseHex(bad), `${bad} should not parse`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY TEXT COLOUR, ON EVERY SURFACE IT CAN LAND ON, IN BOTH THEMES.
 *
 * The dark palette's ratios lived in a comment. A comment is a measurement
 * from the day somebody took it, and it cannot fail when the value beneath it
 * changes — which is exactly what a second theme invites, because now every
 * colour has two values and only one of them is in front of you.
 *
 * This caught one on its first run. slate-600 was #717f96, measured against
 * the page (4.91) and the card (4.69) and passing both, and never measured
 * against the raised panel it also sits on, where it was 4.37 — under AA, in
 * shipped code, on the small print that most needs reading outdoors.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every text token passes AA on every surface, in both themes", () => {
  const failures: string[] = [];

  for (const [themeName, palette] of Object.entries(PALETTES)) {
    for (const [tokenName, colour] of Object.entries(textTokensOf(palette))) {
      for (const surface of surfacesOf(palette)) {
        const r = contrast(colour, surface.colour);
        if (r < AA_NORMAL) {
          failures.push(`${themeName}: ${tokenName} (${colour}) on ${surface.name} (${surface.colour}) = ${ratio(r)}`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `text below WCAG AA:\n  ${failures.join("\n  ")}`);
});

/**
 * A tint at 4% has to be VISIBLE, which is the opposite requirement to the one
 * above and the reason `white` is a token at all. On a light page a white 4%
 * overlay is nothing, and every card border in the app disappears.
 */
test("the surface tint is on the opposite side of its surface", () => {
  for (const [themeName, palette] of Object.entries(PALETTES)) {
    const tint = luminance(palette.tint);
    const base = luminance(palette.surfaceBase);
    const raised = luminance(palette.surfaceRaised);

    for (const [name, surface] of [["page", base], ["card", raised]] as const) {
      assert.ok(Math.abs(tint - surface) > 0.3,
        `${themeName}: the tint is too close to the ${name} to show at 4% opacity`);
    }
    assert.equal(tint > base, themeName === "dark",
      `${themeName}: the tint is on the wrong side — overlays would be invisible`);
  }
});

/**
 * A HIGHER slate number means MORE muted here, which is the reverse of
 * Tailwind's own scale. If the flip breaks that ordering, body text and small
 * print swap places across the whole app at once.
 */
test("the muted ordering survives the flip", () => {
  for (const [themeName, palette] of Object.entries(PALETTES)) {
    const steps = ([100, 200, 300, 400, 500, 600] as const)
      .map((k) => contrast(palette.slate[k], palette.surfaceBase));
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i] < steps[i - 1],
        `${themeName}: slate-${(i + 1) * 100} is not more muted than slate-${i * 100} `
        + `(${ratio(steps[i])} vs ${ratio(steps[i - 1])})`);
    }
    // And the faintest tier still has to be readable, not merely faintest.
    assert.ok(steps[steps.length - 1] >= AA_NORMAL, `${themeName}: the faintest tier is under AA`);
  }
});

test("the two themes are genuinely different, not one palette twice", () => {
  assert.notEqual(DARK.surfaceBase, LIGHT.surfaceBase);
  assert.ok(luminance(LIGHT.surfaceBase) > 0.7, "the light page is not light");
  assert.ok(luminance(DARK.surfaceBase) < 0.05, "the dark page is not dark");
  // Neither page is pure white or pure black — both are glare at the extremes.
  assert.notEqual(LIGHT.surfaceBase, "#ffffff");
  assert.notEqual(DARK.surfaceBase, "#000000");
});

test("the CSS variables are generated from the palette, not typed twice", () => {
  assert.equal(rgbChannels("#0a0a0b"), "10 10 11");
  assert.equal(rgbChannels("#fff"), "255 255 255");

  for (const [themeName, palette] of Object.entries(PALETTES)) {
    const css = cssVariables(palette);
    for (const key of ["--surface-base", "--tint", "--slate-100", "--slate-600", "--pitch-400", "--readiness-red", "--sky-300", "--glow"]) {
      assert.ok(css.includes(key), `${themeName} is missing ${key}`);
    }
    // rgb(var(--x) / <alpha>) needs bare channels, not a hex or an rgb() call.
    for (const line of css.split("\n")) {
      if (line.includes("--glow")) continue;
      assert.match(line.trim(), /^--[a-z0-9-]+: \d{1,3} \d{1,3} \d{1,3};$/,
        `${themeName}: "${line.trim()}" is not three bare channels`);
    }
  }
});

test("the stored preference has a stable key", () => {
  // Renaming this silently resets every athlete's choice back to system.
  assert.equal(THEME_STORAGE_KEY, "pa-theme");
});
