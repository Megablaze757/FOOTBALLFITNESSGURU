// =============================================================================
// Reels — a vertical video built from a drill we already wrote.
//
// WHAT THIS IS AND IS NOT. It is a sequence of full-screen text cards, cut
// between on a beat, with a progress bar. It is not motion graphics: nothing
// tweens, nothing eases. That is a deliberate choice rather than a limitation
// accepted quietly — a coaching reel is read, not watched, and cuts between
// held cards is the format that actually performs for text. It also means the
// storyboard is a pure function of the drill, so it can be tested, and the
// browser's only job is to draw each card for its duration.
//
// The recorder lives in the component because MediaRecorder is a browser API;
// everything that decides WHAT is on screen is here.
// =============================================================================

import type { SkillDrill } from "./skills";
import { sizeOf } from "./post-size";
import { FACT_GROUPS } from "./content";

const GOLD = "#e3b53f";
const INK = "#0a0a0b";

/** 30fps. Below this the cuts read as a slideshow that dropped frames. */
export const REEL_FPS = 30;

/**
 * How long a card holds, by how much there is to read.
 *
 * Measured against reading speed rather than picked: ~3.5 words a second is
 * comfortable subtitle pace, and the floor stops a two-word card flashing past
 * before the eye has landed on it.
 */
export const MIN_SCENE_MS = 1600;
export const MS_PER_WORD = 285;

export function holdFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SCENE_MS, Math.round(words * MS_PER_WORD));
}

export interface Scene {
  /** Small line above the headline — the section this beat belongs to. */
  kicker: string;
  /** The words. Wrapped by the renderer, not here. */
  text: string;
  ms: number;
}

/**
 * The beats, in order: what it is, what you need, how, and the cue.
 *
 * Capped at three steps and one cue for the same reason the card is: a reel
 * that tries to teach the whole drill teaches none of it, and the caption and
 * the link carry the rest.
 */
export function reelScenes(drill: SkillDrill): Scene[] {
  const scenes: Scene[] = [
    { kicker: drill.skill.toUpperCase(), text: drill.name, ms: 0 },
    { kicker: "YOU NEED", text: drill.setup, ms: 0 },
  ];
  drill.how.slice(0, 3).forEach((step, i) => {
    scenes.push({ kicker: `STEP ${i + 1}`, text: step, ms: 0 });
  });
  scenes.push({ kicker: "THE CUE", text: drill.coaching, ms: 0 });
  scenes.push({ kicker: "VOLUME", text: drill.reps, ms: 0 });
  /**
   * THE LAST CARD IS THE ONLY ONE THAT SELLS, AND IT IS A FACT.
   *
   * A reel that is pure coaching gets watched and forgotten; one that ends on
   * a pitch gets skipped. So the closer is a verified line from
   * lib/content.ts — the same list the AI writer is restricted to, and the
   * same list NEVER_CLAIM guards. "Every drill in the app has the cue written
   * out like this" is checkable and is what the four cards before it just
   * demonstrated. It is evidence, not a slogan.
   */
  scenes.push({ kicker: "IN THE APP", text: closingFact(), ms: 0 });
  return scenes.map((s) => ({ ...s, ms: holdFor(s.text) }));
}

/** The verified fact a drill reel is evidence for. */
export function closingFact(): string {
  const fact = FACT_GROUPS.find((g) => g.id === "drills")?.facts[0];
  if (!fact) throw new Error("no drills fact in FACT_GROUPS — the closer cannot be invented");
  return fact;
}

/** Total run time. Instagram wants a reel between 3 and 90 seconds. */
export function reelDuration(scenes: Scene[]): number {
  return scenes.reduce((n, s) => n + s.ms, 0);
}

export const MIN_REEL_MS = 3_000;
export const MAX_REEL_MS = 90_000;

/**
 * Which scene is on screen at `t`, and how far through it we are.
 *
 * Returns null past the end rather than clamping to the last scene: a recorder
 * that clamps records the final card forever if its stop timer ever slips.
 */
export function sceneAt(scenes: Scene[], t: number): { scene: Scene; index: number; progress: number } | null {
  if (t < 0) return null;
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const end = start + scenes[i].ms;
    if (t < end) return { scene: scenes[i], index: i, progress: (t - start) / scenes[i].ms };
    start = end;
  }
  return null;
}

/** A word-wrapper matching lib/drill-card's: SVG has no text wrapping. */
function wrap(text: string, perLine: number, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine && line) { lines.push(line); line = w; }
    else line = (line + " " + w).trim();
    if (lines.length === max) break;
  }
  if (line && lines.length < max) lines.push(line);
  return lines;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One frame, as an SVG string.
 *
 * `elapsed` only drives the progress bar. Everything else is a step function of
 * which scene we are in, which is what makes the whole thing reproducible: the
 * same drill and the same t always draw the same pixels.
 */
export function reelFrameSvg(
  scenes: Scene[],
  t: number,
  opts: { handle?: string } = {},
): string {
  const { w: W, h: H } = sizeOf("story");
  const handle = opts.handle ?? "pocketathlete.com/drills";
  const at = sceneAt(scenes, t);
  const total = reelDuration(scenes);
  const done = Math.max(0, Math.min(1, total ? t / total : 1));

  const body: string[] = [];
  if (at) {
    body.push(`<text x="88" y="${Math.round(H * 0.3)}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${GOLD}" letter-spacing="4">${esc(at.scene.kicker)}</text>`);
    let y = Math.round(H * 0.3) + 110;
    for (const line of wrap(at.scene.text, 22, 6)) {
      body.push(`<text x="88" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="#ffffff">${esc(line)}</text>`);
      y += 96;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6d365"/><stop offset="100%" stop-color="#c9962f"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${INK}"/>
  ${body.join("\n  ")}
  <rect x="88" y="${H - 190}" width="${W - 176}" height="6" rx="3" fill="#ffffff" fill-opacity="0.12"/>
  <rect x="88" y="${H - 190}" width="${Math.round((W - 176) * done)}" height="6" rx="3" fill="url(#g)"/>
  <text x="88" y="${H - 120}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#64748b">${esc(handle)}</text>
  <text x="${W - 88}" y="${H - 120}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="${GOLD}">PocketAthlete</text>
</svg>`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MP4 OR NOTHING USEFUL.
 *
 * Instagram's uploader takes MP4 and MOV. MediaRecorder's historical default
 * is WebM, which Instagram rejects — so a recorder that just asks for "video"
 * hands over a file that cannot be posted, and the person finds out at the
 * upload screen rather than here.
 *
 * Chrome and Safari can now record H.264 in an MP4 container. Ask for that
 * first and only fall back to WebM knowingly, so the UI can say out loud that
 * the file needs converting before it will post.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const REEL_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
] as const;

export function pickMimeType(isSupported: (type: string) => boolean): { type: string; postable: boolean } | null {
  for (const type of REEL_MIME_TYPES) {
    if (isSupported(type)) return { type, postable: type.startsWith("video/mp4") };
  }
  return null;
}

export function fileExtension(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}
