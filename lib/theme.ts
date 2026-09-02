/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO THEMES, ONE DEFINITION.
 *
 * The app was dark-only, with about 2,900 colour utilities across 160 files.
 * None of them is touched by this: the Tailwind config already had the trick,
 * in the comment explaining why slate-500 and slate-600 were overridden there
 * rather than found and replaced — "one definition, no chance of missing a
 * site". Every token is now a CSS variable, so `text-slate-400` and
 * `bg-white/[0.04]` mean whatever the theme says they mean.
 *
 * WHY `white` IS A VARIABLE. 582 of those utilities are `bg-white/[0.04]` and
 * `border-white/10` — a light tint over a dark page. On a light page a white
 * tint is invisible, and every card border in the app would vanish. Making
 * `white` a token flips all 582 to a dark tint at once. The two places that
 * genuinely need a fixed white (text on a red button) say so explicitly.
 *
 * WHY `ink` DOES NOT FLIP. `text-ink-900` is not "dark text", it is "text that
 * sits on a bright accent" — the label on a gold button. It has to stay dark
 * in both themes or that button becomes unreadable in one of them. The
 * surfaces that used ink are now `surface-*`, which do flip.
 *
 * EVERY RATIO HERE IS TESTED, not measured once and written in a comment.
 * lib/theme.test.ts checks each text token against each surface it can appear
 * on, in both themes. The dark numbers were verified against the hand
 * measurements the config already carried, and they matched to two decimals.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ThemeName = "dark" | "light";

/** What the athlete chose. "system" follows the OS and is the default. */
export type ThemePreference = ThemeName | "system";

export const THEME_STORAGE_KEY = "pa-theme";

export interface Palette {
  /** The page itself. */
  surfaceBase: string;
  /** Cards and panels sitting on the page. */
  surfaceRaised: string;
  /** Menus and sheets above those. */
  surfaceHigh: string;
  /**
   * What `bg-white/x` and `border-white/x` resolve to — a tint of the OPPOSITE
   * lightness to the surface, which is the only way a 4%-opacity overlay is
   * visible at all.
   */
  tint: string;
  slate: Record<100 | 200 | 300 | 400 | 500 | 600, string>;
  /**
   * Brand gold, as a FILL. Identical in both themes on purpose — a gold button
   * that goes brown in light mode is not the brand any more, and that is what
   * the first version did.
   */
  pitch: Record<300 | 400 | 500 | 600, string>;
  /**
   * Brand gold, as TEXT. Gold on white is about 1.9:1, so this is the one that
   * has to darken — and it has to be a separate token, because no single value
   * can be a readable label on white AND a recognisable gold button.
   */
  accent: Record<300 | 400 | 500 | 600, string>;
  readiness: { green: string; yellow: string; red: string };
  sky: Record<300 | 400, string>;
  /**
   * Text that sits ON a bright accent — the label on a gold button.
   *
   * This is the one that has to flip and looks like it should not. It was
   * `text-ink-900`, a fixed near-black, on the theory that a gold button is
   * bright in both themes. It is not: gold on a white page is about 1.9:1, so
   * light mode needs a DARK gold, and dark text on dark gold is unreadable.
   * The axe pass caught it on every page at once.
   */
  onAccent: string;
  /** The page's ambient glow. Kept subtle in light, where it reads as a stain. */
  glow: string;
}

export const DARK: Palette = {
  surfaceBase: "#09090a",
  surfaceRaised: "#101011",
  surfaceHigh: "#18181b",
  tint: "#ffffff",
  slate: {
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    // Tailwind's own 500 and 600 do not pass AA on this background — 4.18 and
    // 2.63 measured against the page, where normal text needs 4.5.
    500: "#8391a6",
    // Was #717f96. That was measured against the page and the card, and passed
    // both (4.91, 4.69) — but not against the raised panel it also appears on,
    // where it was 4.37. Nudged until it clears all three, which is what the
    // test now checks rather than the two somebody happened to try.
    600: "#76849b",
  },
  pitch: { 300: "#f0d68a", 400: "#e3b53f", 500: "#c99a2e", 600: "#a67c1f" },
  accent: { 300: "#f0d68a", 400: "#e3b53f", 500: "#c99a2e", 600: "#a67c1f" },
  readiness: { green: "#34d399", yellow: "#fbbf24", red: "#fb5d6b" },
  sky: { 300: "#7dd3fc", 400: "#38bdf8" },
  onAccent: "#0a0a0b",
  glow: "rgba(227, 181, 63, 0.10)",
};

/**
 * Light.
 *
 * Not an inversion — inverting a dark palette gives you grey text on grey and
 * a gold that disappears. Every value here was chosen against the surface it
 * actually sits on and checked, which is what the test enforces.
 *
 * The muted end of the slate scale is the interesting part. In this codebase a
 * HIGHER number is MORE muted, which is the reverse of Tailwind's convention,
 * and that ordering has to survive the flip or "small print" and "body text"
 * swap places across the whole app.
 */
export const LIGHT: Palette = {
  // Not pure white. A full-white page under a phone at midday is glare, and
  // the cards need something to sit on and be distinguishable from.
  surfaceBase: "#f4f5f7",
  surfaceRaised: "#ffffff",
  surfaceHigh: "#ffffff",
  // Near-black, so `bg-white/[0.04]` becomes a 4% dark wash rather than nothing.
  tint: "#0b1220",
  slate: {
    100: "#0b1220",
    200: "#16203a",
    300: "#2b3648",
    400: "#414d63",
    500: "#525f77",
    600: "#59657c",
  },
  // The FILL keeps the brand's gold. A gold button with a near-black label is
  // exactly as readable on a white page as on a black one, and it is the only
  // version of it anybody recognises.
  pitch: { 300: "#f0d68a", 400: "#e3b53f", 500: "#c99a2e", 600: "#a67c1f" },
  /*
   * The TEXT darkens, because gold on white is about 1.9:1.
   *
   * 400 is tuned as light as AA allows on the WORST surface it lands on, which
   * is not white — it is a chip, a 6% wash of the tint over the page. Against
   * white this is 5.5; against that chip it is 4.74, and the first attempt at
   * 4.64-on-white was 4.09 there. Axe found it in a browser because the palette
   * test only knew about pages and cards.
   *
   * As light as that allows, because 319 of the 332 gold-text uses are this one
   * shade and every step darker reads less like gold and more like brown. The
   * headline on the landing page is this colour.
   *
   * The other tiers do not preserve dark mode's ordering, and cannot: in dark,
   * a higher number is dimmer, which in light means LIGHTER, and there is not
   * enough room between 4.5 and the brand hue to fit four tiers above the
   * line. They are 13 uses between them, all decorative, so they sit darker
   * and legible rather than ordered and unreadable.
   */
  accent: { 300: "#6b500c", 400: "#7f6010", 500: "#7a5c0e", 600: "#5c440a" },
  readiness: { green: "#0d6d49", yellow: "#8a5a00", red: "#c02434" },
  sky: { 300: "#0b6a8f", 400: "#0a5f80" },
  // Dark again, because the accent it sits on is gold and gold stays bright.
  // The handful of labels on a DARK fill (a red button, the sky segment) pin
  // their own white rather than dragging this one with them.
  onAccent: "#0a0a0b",
  glow: "rgba(227, 181, 63, 0.16)",
};

export const PALETTES: Record<ThemeName, Palette> = { dark: DARK, light: LIGHT };

/**
 * The bright surfaces that carry `text-on-accent` — buttons and pills.
 * Separate from surfacesOf() because ordinary body text never lands on these.
 */
export function accentSurfacesOf(p: Palette): { name: string; colour: string }[] {
  // Gold only. The other coloured fills carry a pinned white label rather than
  // this token, because they darken in light mode and gold does not.
  return [
    { name: "gold button", colour: p.pitch[400] },
    { name: "gold 500 button", colour: p.pitch[500] },
  ];
}

/**
 * Every surface a piece of text can land on.
 *
 * INCLUDING THE TINTED ONES, which is the half this first missed. Chips,
 * pills, table stripes and inputs are `bg-white/[0.04]` and friends — a wash
 * of the tint over the page, and 326 of them. Text on those sits on a surface
 * that is neither the page nor a card, and gold at 4.64 against white was 4.29
 * against a 6% wash. Axe found it in a browser; this is so it is found before.
 */
export function surfacesOf(p: Palette): { name: string; colour: string }[] {
  const wash = (alpha: number) => {
    const t = parseChannels(p.tint);
    const b = parseChannels(p.surfaceBase);
    const mix = (x: number, y: number) => Math.round(x * alpha + y * (1 - alpha));
    return `#${[0, 1, 2].map((i) => mix(t[i], b[i]).toString(16).padStart(2, "0")).join("")}`;
  };
  return [
    { name: "page", colour: p.surfaceBase },
    { name: "card", colour: p.surfaceRaised },
    { name: "raised panel", colour: p.surfaceHigh },
    // The overlay strengths that actually carry muted text. Heavier washes
    // exist — bg-white/10 and /[0.08], 31 of them — but every one of those
    // carries slate-200 or slate-400, which clear AA on any surface here. It
    // is the faint tiers on a light wash that get close to the line.
    { name: "4% tint", colour: wash(0.04) },
    { name: "6% tint", colour: wash(0.06) },
  ];
}

function parseChannels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** The text tokens, which are the ones AA applies to. */
export function textTokensOf(p: Palette): Record<string, string> {
  return {
    "slate-100": p.slate[100],
    "slate-200": p.slate[200],
    "slate-300": p.slate[300],
    "slate-400": p.slate[400],
    "slate-500": p.slate[500],
    "slate-600": p.slate[600],
    "accent-400": p.accent[400],
    "accent-500": p.accent[500],
    "sky-300": p.sky[300],
    "readiness-green": p.readiness.green,
    "readiness-yellow": p.readiness.yellow,
    "readiness-red": p.readiness.red,
  };
}

/** "#0b1220" → "11 18 32", which is what `rgb(var(--x) / <alpha>)` needs. */
export function rgbChannels(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(" ");
}

/** The `:root` block for one theme, generated so CSS and TS cannot disagree. */
export function cssVariables(p: Palette): string {
  const lines = [
    `--surface-base: ${rgbChannels(p.surfaceBase)};`,
    `--surface-raised: ${rgbChannels(p.surfaceRaised)};`,
    `--surface-high: ${rgbChannels(p.surfaceHigh)};`,
    `--tint: ${rgbChannels(p.tint)};`,
    `--on-accent: ${rgbChannels(p.onAccent)};`,
    ...Object.entries(p.slate).map(([k, v]) => `--slate-${k}: ${rgbChannels(v)};`),
    ...Object.entries(p.pitch).map(([k, v]) => `--pitch-${k}: ${rgbChannels(v)};`),
    ...Object.entries(p.accent).map(([k, v]) => `--accent-${k}: ${rgbChannels(v)};`),
    ...Object.entries(p.readiness).map(([k, v]) => `--readiness-${k}: ${rgbChannels(v)};`),
    ...Object.entries(p.sky).map(([k, v]) => `--sky-${k}: ${rgbChannels(v)};`),
    `--glow: ${p.glow};`,
  ];
  return lines.join("\n  ");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * READING AND APPLYING THE CHOICE.
 *
 * Three states, not two. "System" is the default and is not the same as
 * "dark": somebody whose phone switches to light at dusk should switch with
 * it, and an explicit choice should survive their phone changing its mind.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as string[]).includes(value);
}

/**
 * What a preference actually resolves to right now.
 *
 * `systemPrefersLight` is passed in rather than read here so this stays a pure
 * function — the caller owns the media query, and a test can ask what happens
 * at dusk without pretending to be a browser.
 */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ThemeName {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

/**
 * The script that runs BEFORE the first paint.
 *
 * Without it the page renders dark, then React hydrates, then it turns light —
 * a full-screen flash on every single load for anyone who chose light. That is
 * the one bug people actually remember about theme switching, so it is fixed in
 * the only place it can be: a blocking inline script in <head>, before the body
 * exists.
 *
 * It sets nothing when the preference is "system", because the CSS media query
 * already handles that and stamping an attribute would freeze the athlete's
 * phone into whichever mode it happened to be in at that moment.
 *
 * Wrapped in try/catch because localStorage throws outright in some privacy
 * modes, and a theme preference is not worth a blank page.
 */
export function themeBootScript(): string {
  return `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`
    + `if(p==="light"||p==="dark"){document.documentElement.setAttribute("data-theme",p);}}catch(e){}})();`;
}


/**
 * The generated block in app/globals.css, and where it starts and ends.
 *
 * Lives here rather than in the build script so the test can import it without
 * reaching into scripts/ — and so the markers cannot drift from the thing that
 * writes between them.
 */
export const THEME_CSS_START =
  "/* THEME TOKENS — generated by scripts/build-theme-css.mts. Do not hand-edit. */";
export const THEME_CSS_END = "/* END THEME TOKENS */";

export function themeBlock(): string {
  return `${THEME_CSS_START}
/*
   Dark is the default because it always was: an athlete who has never touched
   the setting, and a browser reporting no preference, get the app they know.
   \`prefers-color-scheme: light\` opts a system into light without anyone
   choosing, and [data-theme] beats both — an explicit choice should beat a
   guess about the room somebody is standing in.
*/
:root {
  color-scheme: dark;
  ${cssVariables(DARK)}
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    color-scheme: light;
    ${cssVariables(LIGHT)}
  }
}

:root[data-theme="light"] {
  color-scheme: light;
  ${cssVariables(LIGHT)}
}

:root[data-theme="dark"] {
  color-scheme: dark;
  ${cssVariables(DARK)}
}
${THEME_CSS_END}`;
}

export function withThemeBlock(css: string): string {
  const from = css.indexOf(THEME_CSS_START);
  const to = css.indexOf(THEME_CSS_END);
  if (from < 0 || to < 0) throw new Error("app/globals.css has no theme block markers to replace");
  return css.slice(0, from) + themeBlock() + css.slice(to + THEME_CSS_END.length);
}
