#!/usr/bin/env node
// =============================================================================
// Pair our exercises with Everkinetic's anatomical illustrations, and copy the
// ones that match into public/exercise-art.
//
// WHY A SCRIPT AND NOT A HAND-WRITTEN MAP. Two hundred and sixty-three names
// against two hundred and ninety-three is not a job to do by eye, and a map
// nobody can regenerate is a map that rots the first time either side changes.
//
// WHY IT REFUSES MORE THAN IT ACCEPTS. A wrong picture is worse than no
// picture. "Dumbbell Row" and "Dumbbell Upright Rows" share three words out of
// four and are different exercises — one is a back movement, the other a
// shoulder one — and a fuzzy matcher pairs them confidently. So a word that
// CHANGES the exercise disqualifies the pair outright when only one side has
// it: upright, concentration, incline, seated, single-arm, and the implement
// the implement when both sides name one. Showing a barbell in the hands of
// somebody doing a dumbbell lunge is a coaching error, not a cosmetic one.
//
// The result is roughly a third of the catalogue — and it is the third people
// actually see, because it is the common lifts. Everything else keeps the
// drawn figure, which is why that had to be good first.
//
// SOURCE AND LICENCE. github.com/everkinetic/data, CC BY-SA 4.0, by Greg
// Priday. Attribution ships in the app (see lib/exercise-art.ts). The images
// are used AS THEY ARE: share-alike binds adaptations, so recolouring or
// redrawing them would put those versions under the same licence, and this
// pipeline deliberately copies rather than edits.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCE = process.env.EVERKINETIC ?? "/home/user/everkinetic/data";
const OUT_DIR = "public/exercise-art";
const MAP_FILE = "lib/exercise-art.ts";

if (!existsSync(join(SOURCE, "exercises.json"))) {
  console.error(`Everkinetic data not found at ${SOURCE}.`);
  console.error("Clone it first:  git clone --depth 1 https://github.com/everkinetic/data");
  console.error("or point EVERKINETIC at an existing checkout. Nothing was changed.");
  process.exit(1);
}

const ever = JSON.parse(readFileSync(join(SOURCE, "exercises.json"), "utf8"));

const SYN = { triceps: "tricep", biceps: "bicep", abs: "ab", glutes: "glute", db: "dumbbell", bb: "barbell" };
const STOP = new Set(["with", "using", "on", "the", "a", "and", "to", "for", "your", "of"]);
const sing = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s) => {
  let t = " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  for (const [k, v] of Object.entries(SYN)) t = t.replaceAll(` ${k} `, ` ${v} `);
  return t.split(/\s+/).filter((w) => w && !STOP.has(w)).map(sing);
};

/**
 * Words that CHANGE THE MOVEMENT. Present on one side and not the other, the
 * pair is refused however well the rest of the words line up: an upright row is
 * a shoulder exercise and a bent-over row is a back one.
 */
const FORM = [
  "upright", "concentration", "incline", "decline", "preacher", "hammer", "reverse", "sumo", "spider",
  "front", "overhead", "behind", "neck", "seated", "standing", "lying", "kneeling", "side", "wall",
  "single", "one", "two", "alternating", "close", "wide", "narrow", "neutral", "walking", "donkey",
  "assisted", "weighted", "romanian", "stiff", "bulgarian", "split", "pistol", "box", "hack", "zercher",
  "pendlay", "rack", "hang", "power", "jerk", "press", "pull", "push", "flexor", "bent", "over",
  // "Wall Ball" against "Ball Wall Circles": same two nouns, different exercise.
  "circle", "twist", "raise", "kick", "jump", "hop", "throw", "carry", "drag",
];

/**
 * The implement, which is a SOFTER test.
 *
 * Everkinetic names the implement in almost every title; we usually only name
 * it when it is not the obvious one. "Bent Over Row" and "Bent Over Row with
 * Barbell" are the same exercise, and refusing that pair because one side is
 * explicit cost twenty-four good matches to avoid two bad ones.
 *
 * So an implement only disqualifies when BOTH sides name one and they differ —
 * our "Dumbbell Lunge" must never be drawn with a barbell, but our plain
 * "Bent Over Row" is happy to be.
 */
const IMPLEMENT = ["barbell", "dumbbell", "cable", "machine", "smith", "band", "ball", "kettlebell", "ez"];

const indexed = ever.map((e) => ({ e, w: new Set(words(e.title)), n: words(e.title).length }));

export function pair(name) {
  const mine = words(name);
  if (!mine.length) return null;
  const mineSet = new Set(mine);
  let best = null;
  let bestScore = 0;
  for (const c of indexed) {
    if (FORM.some((d) => mineSet.has(d) !== c.w.has(d))) continue;
    const mineKit = IMPLEMENT.filter((k) => mineSet.has(k));
    const theirKit = IMPLEMENT.filter((k) => c.w.has(k));
    if (mineKit.length && theirKit.length && !mineKit.some((k) => theirKit.includes(k))) continue;
    const covered = mine.filter((w) => c.w.has(w)).length / mine.length;
    const score = covered - Math.max(0, c.n - mine.length) * 0.1;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.85 ? { title: best.e.title, num: best.e.id_num, score: +bestScore.toFixed(2) } : null;
}

if (process.argv[1]?.endsWith("build-exercise-art.mjs")) {
  const { IMPORTED_EXERCISES } = await import("../lib/exercise-catalog.ts");

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const map = {};
  let copied = 0;
  for (const exercise of IMPORTED_EXERCISES) {
    const found = pair(exercise.name);
    if (!found) continue;
    const key = slug(exercise.name);
    const frames = [["relaxation", "start"], ["tension", "end"]];
    let ok = true;
    for (const [from, to] of frames) {
      const src = join(SOURCE, "dist/svg", `${found.num}-${from}.svg`);
      if (!existsSync(src)) { ok = false; break; }
      copyFileSync(src, join(OUT_DIR, `${key}-${to}.svg`));
    }
    if (!ok) continue;
    map[exercise.name] = key;
    copied += 1;
  }

  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  writeFileSync(MAP_FILE, `// GENERATED by scripts/build-exercise-art.mjs — do not edit by hand.
//
// Exercises we have real anatomical artwork for, mapped to the file stem under
// public/exercise-art. Two frames each: \`-start.svg\` and \`-end.svg\`.
//
// Everything NOT in here falls back to the drawn figure in
// components/ExerciseDemo.tsx, which is most of the sport-specific work — no
// anatomy library has a cone weave or a Copenhagen plank. See the script for
// why the pairing refuses more than it accepts.

/**
 * Required by the licence, and shown in the app — see components/ArtCredit.tsx.
 *
 * CC BY-SA 4.0 binds ADAPTATIONS, so these files are copied and never edited:
 * recolouring one would put that version under the same licence. If you ever
 * do need to modify one, that modified file has to ship under CC BY-SA 4.0 too.
 */
export const ART_CREDIT = {
  work: "Everkinetic",
  author: "Greg Priday",
  source: "https://github.com/everkinetic/data",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

export const EXERCISE_ART: Record<string, string> = {
${entries.map(([name, key]) => `  ${JSON.stringify(name)}: ${JSON.stringify(key)},`).join("\n")}
};

/** The two frames for an exercise, or null when we only have the drawn figure. */
export function artFor(name: string): { start: string; end: string } | null {
  const key = EXERCISE_ART[name.trim()];
  return key ? { start: \`/exercise-art/\${key}-start.svg\`, end: \`/exercise-art/\${key}-end.svg\` } : null;
}
`);

  console.log(`${copied} of ${IMPORTED_EXERCISES.length} exercises have artwork (${Math.round((100 * copied) / IMPORTED_EXERCISES.length)}%)`);
  console.log(`wrote ${MAP_FILE} and ${copied * 2} files to ${OUT_DIR}`);
}
