// =============================================================================
// Drill cards — a 1080×1080 post image built from a real drill.
//
// The content that works for this product is the coaching itself: the setup,
// the steps, the one cue that separates doing a drill from doing it well. All
// of that is already written in lib/skills.ts, so a post shouldn't need
// designing by hand — 38 drills is 38 posts.
//
// Same approach as lib/share-card.ts: SVG built as a string, rasterised on a
// canvas in the browser. No dependencies, works on a static host.
// =============================================================================

import type { SkillDrill } from "./skills";

const W = 1080;
const GOLD = "#e3b53f";
const INK = "#0a0a0b";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Break text to fit a width.
 *
 * SVG has no text wrapping, so lines have to be measured and split here. The
 * per-character estimate is deliberately crude — it only has to keep text
 * inside 1080px, and being a little conservative costs nothing while
 * overflowing ruins the card.
 */
function wrap(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // An ellipsis is honest about truncation; a sentence that just stops reads as
  // a bug.
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[,.]?$/, "…");
  }
  return lines;
}

export type CardStyle = "drill" | "cue";

export interface DrillCardOptions {
  drill: SkillDrill;
  sportLabel: string;
  /** "drill" is the full how-to; "cue" is the single coaching point, big. */
  style?: CardStyle;
  /** Shown bottom-right, e.g. "pocketathlete.com/drills". */
  handle?: string;
}

export function buildDrillCardSvg({ drill, sportLabel, style = "drill", handle = "pocketathlete.com/drills" }: DrillCardOptions): string {
  const needs = drill.needs === "solo" ? "YOU ONLY" : drill.needs === "partner" ? "YOU + ONE" : "FULL SESSION";

  const body = style === "cue" ? cueBody(drill) : drillBody(drill);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6d365"/><stop offset="100%" stop-color="#c9962f"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${W}" fill="${INK}"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#g)"/>

  <text x="72" y="120" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="${GOLD}" letter-spacing="3">
    ${esc(sportLabel.toUpperCase())} · ${esc(drill.skill.toUpperCase())}
  </text>
  <text x="${W - 72}" y="120" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#64748b" letter-spacing="2">
    ${needs}
  </text>

  ${body}

  <text x="72" y="${W - 56}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#475569">
    ${esc(handle)}
  </text>
  <text x="${W - 72}" y="${W - 56}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${GOLD}">
    PocketAthlete
  </text>
</svg>`;
}

/** Full how-to: title, setup, numbered steps, volume, cue. */
function drillBody(d: SkillDrill): string {
  const title = wrap(d.name, 24, 2);
  let y = 230;
  const out: string[] = [];

  for (const line of title) {
    out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#ffffff">${esc(line)}</text>`);
    y += 84;
  }

  y += 20;
  out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="${GOLD}" letter-spacing="2">SETUP</text>`);
  y += 42;
  for (const line of wrap(d.setup, 52, 2)) {
    out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#cbd5e1">${esc(line)}</text>`);
    y += 44;
  }

  y += 26;
  d.how.slice(0, 3).forEach((step, i) => {
    out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="${GOLD}">${i + 1}</text>`);
    for (const line of wrap(step, 46, 2)) {
      out.push(`<text x="120" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#e2e8f0">${esc(line)}</text>`);
      y += 46;
    }
    y += 14;
  });

  y += 6;
  out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#94a3b8">${esc(d.reps)}</text>`);

  // The cue is the payoff. Boxed so it reads as the thing to remember.
  const cue = wrap(d.coaching, 48, 3);
  const boxH = 60 + cue.length * 44;
  const boxY = W - 130 - boxH;
  out.push(`<rect x="56" y="${boxY}" width="${W - 112}" height="${boxH}" rx="28" fill="#ffffff" fill-opacity="0.05"/>`);
  out.push(`<rect x="56" y="${boxY}" width="6" height="${boxH}" rx="3" fill="${GOLD}"/>`);
  let cy = boxY + 60;
  for (const line of cue) {
    out.push(`<text x="92" y="${cy}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-style="italic" fill="#f1f5f9">${esc(line)}</text>`);
    cy += 44;
  }

  return out.join("\n  ");
}

/** Just the coaching cue, set large — the format that travels furthest. */
function cueBody(d: SkillDrill): string {
  const cue = wrap(d.coaching, 26, 5);
  const out: string[] = [];
  let y = 360 - (cue.length - 1) * 34;
  for (const line of cue) {
    out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#ffffff">${esc(line)}</text>`);
    y += 86;
  }
  y += 40;
  out.push(`<rect x="72" y="${y - 34}" width="120" height="5" fill="${GOLD}"/>`);
  y += 60;
  out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="${GOLD}">${esc(d.name)}</text>`);
  y += 52;
  for (const line of wrap(d.reps, 44, 1)) {
    out.push(`<text x="72" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#94a3b8">${esc(line)}</text>`);
  }
  return out.join("\n  ");
}
