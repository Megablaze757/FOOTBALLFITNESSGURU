import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * NOTHING YOU HAVE TO TAP IS SMALLER THAN A THUMB.
 *
 * WCAG 2.5.8 puts the floor at 24×24; Apple's HIG and Material both say 44–48.
 * This app is used one-handed, on a phone, with cold hands, in a kit bag, by
 * people who are out of breath — so the codebase settled on 44 and put it in
 * `.tap-target`, `.chip-option` and `button.chip`. The classes were the right
 * answer and they were never applied everywhere: a measured audit found 89
 * controls under the floor, a first pass fixed the ~70 that were selectable
 * chips, and 65 were still short — including the ✕ that removes a set, the
 * km/mi switch, the day tabs on the meal plan and the tab bar itself.
 *
 * THE TEST THAT KEEPS IT FIXED. Every one of those was individually defensible
 * ("it's only a little link") and the total was a form nobody with big hands
 * can fill in. Counting them is the only way the number stays down.
 */

const FLOOR = 44;

/** Classes that carry a 44px floor of their own — see app/globals.css. */
const SAFE = [
  "tap-target", "min-h-[44px]", "min-h-[2.75rem]", "h-11", "h-12", "h-14",
  "btn-primary", "btn-ghost", "btn-secondary", "chip", "chip-option",
  "tap-pad", "unit-toggle", "h-full", "aspect-", "inset-0", "absolute", "fixed",
  "sr-only", "hidden",
];

/**
 * The handful that are genuinely exempt, each with its reason.
 *
 * An inline link inside a sentence cannot be 44px tall without breaking the
 * line it sits in, and WCAG exempts targets in a block of text for exactly that
 * reason. Everything else on this list has to earn its place the same way.
 */
const EXEMPT = new Set([
  "components/MealPlanner.tsx: a link inside a sentence of prose",
]);

const TEXT_PX: Record<string, number> = {
  "text-[10px]": 10, "text-[11px]": 11, "text-xs": 12, "text-sm": 14,
  "text-base": 16, "text-lg": 18, "text-xl": 20,
};

const PY = /(?:^|\s)(?:sm:)?py-(\d+(?:\.\d+)?|\[[^\]]+\])/;
const P = /(?:^|\s)(?:sm:)?p-(\d+(?:\.\d+)?|\[[^\]]+\])/;
const H = /(?:^|\s)(?:min-)?h-(\d+(?:\.\d+)?|\[[^\]]+\]|full|screen)/;
const CLASSNAME = /className=(?:"([^"]*)"|\{`([^`]*)`\})/;

function px(value: string): number | null {
  if (value.startsWith("[")) {
    const inner = value.slice(1, -1);
    if (inner.endsWith("px")) return Number(inner.slice(0, -2));
    if (inner.endsWith("rem")) return Number(inner.slice(0, -3)) * 16;
    return null;
  }
  return Number(value) * 4;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

interface Small { file: string; line: number; height: string; classes: string }

function tooSmall(root: string): Small[] {
  const found: Small[] = [];
  for (const file of walk(join(root))) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/<(button|summary)\b/g)) {
      const chunk = src.slice(match.index!, match.index! + 900);
      const classes = (CLASSNAME.exec(chunk)?.[1] ?? CLASSNAME.exec(chunk)?.[2] ?? "").replace(/\n/g, " ");
      if (!classes || SAFE.some((s) => classes.includes(s))) continue;
      const line = src.slice(0, match.index!).split("\n").length;
      const at = { file, line, classes: classes.slice(0, 60) };

      const height = H.exec(classes);
      if (height) {
        if (height[1] === "full" || height[1] === "screen") continue;
        const value = px(height[1]);
        if (value != null && value < FLOOR) found.push({ ...at, height: `${value}px` });
        continue;
      }
      const size = Object.keys(TEXT_PX).find((k) => classes.includes(k));
      const lineHeight = Math.round((size ? TEXT_PX[size] : 14) * 1.45);
      const pad = PY.exec(classes) ?? P.exec(classes);
      const padding = pad ? px(pad[1]) : 0;
      if (padding == null) continue;
      const total = lineHeight + padding * 2;
      if (total < FLOOR) found.push({ ...at, height: `${total}px` });
    }
  }
  return found;
}

test("no control is smaller than a thumb", () => {
  const small = tooSmall("components").concat(tooSmall("app"))
    .filter((s) => ![...EXEMPT].some((e) => s.file.includes(e.split(":")[0])));

  /**
   * A BUTTON WITH NO className AT ALL IS NOT A FINDING. Both unit switches
   * style their buttons from `.unit-toggle > button` in CSS, so the scan walks
   * past them and picks up whatever className comes next in the file. Anything
   * that reads as a bare layout word is that, not a real control.
   */
  const real = small.filter((s) => !["block", "field"].includes(s.classes.trim()));

  assert.deepEqual(
    real.map((s) => `${s.file}:${s.line} ${s.height} — ${s.classes}`),
    [],
    `${real.length} controls are under the ${FLOOR}px floor`,
  );
});

test("the classes that carry the floor still carry it", () => {
  // The whole audit above trusts these. If a refactor drops the min-height off
  // one of them, every control using it silently shrinks and the scan above
  // still passes, because it is looking for the class name and not the pixels.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const rule of [".tap-target", ".chip-option", ".unit-toggle"]) {
    const at = css.indexOf(rule);
    assert.ok(at > 0, `${rule} is gone`);
    assert.match(css.slice(at, at + 400), /min-height:\s*44px|h-11/, `${rule} no longer floors at 44px`);
  }
  assert.match(css, /button\.chip,[\s\S]{0,80}min-height:\s*44px/, "a tappable chip is small again");
  // tap-pad grows a hit area outward from the element's own box, which only
  // works if the element is a positioning context.
  const pad = css.indexOf(".tap-pad {");
  assert.ok(pad > 0 && /@apply relative/.test(css.slice(pad, pad + 120)), "tap-pad is not a positioning context");
});
