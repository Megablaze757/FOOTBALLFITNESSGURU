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

/**
 * TWO LIBRARIES, TRIED IN ORDER.
 *
 * Everkinetic first because it is drawn: shaded anatomy on a plain ground, one
 * consistent figure, and vector, so it stays sharp at any size. It covers the
 * classic gym lifts and stops.
 *
 * free-exercise-db is photographs of a person, which is a different look — and
 * it is public domain, 873 exercises deep, and has the things no illustrator
 * bothered with: cleans, snatches, rack pulls, pistol squats, sumo deadlifts.
 * A photograph of the right exercise teaches more than a drawing of the wrong
 * one, and more than a stick figure of anything.
 *
 * Set EVERKINETIC / FREE_EXERCISE_DB to point at existing checkouts.
 */
const SOURCE = process.env.EVERKINETIC ?? "/home/user/everkinetic/data";
const FREE_DB = process.env.FREE_EXERCISE_DB ?? "/home/user/yuhonas/free-exercise-db";
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
  // Variation nouns that ride in front of a movement's name and change it.
  "frog", "butterfly", "sled", "clock", "cross", "star", "swiss", "bosu", "bird",
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

function index(items, titleOf) {
  return items.map((e) => {
    const w = words(titleOf(e));
    return { e, w: new Set(w), n: w.length };
  });
}

export function pairAgainst(indexed, name) {
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
  return bestScore >= 0.85 ? { hit: best.e, score: +bestScore.toFixed(2) } : null;
}

const everIndex = index(ever, (e) => e.title);

/** Kept for the tests, which assert the rule rather than its output. */
export function pair(name) {
  const found = pairAgainst(everIndex, name);
  return found ? { title: found.hit.title, num: found.hit.id_num, score: found.score } : null;
}

if (process.argv[1]?.endsWith("build-exercise-art.mjs")) {
  const { IMPORTED_EXERCISES } = await import("../lib/exercise-catalog.ts");

  const freeDb = existsSync(join(FREE_DB, "dist/exercises.json"))
    ? JSON.parse(readFileSync(join(FREE_DB, "dist/exercises.json"), "utf8"))
    : [];
  if (!freeDb.length) console.warn(`free-exercise-db not found at ${FREE_DB} — illustrations only.`);
  const freeIndex = index(freeDb, (e) => e.name);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const map = {};
  const counts = { everkinetic: 0, "free-exercise-db": 0 };

  for (const exercise of IMPORTED_EXERCISES) {
    const key = slug(exercise.name);

    // Everkinetic first — drawn, vector, one consistent figure.
    const drawn = pairAgainst(everIndex, exercise.name);
    if (drawn) {
      const frames = [["relaxation", "start"], ["tension", "end"]];
      const paths = frames.map(([from]) => join(SOURCE, "dist/svg", `${drawn.hit.id_num}-${from}.svg`));
      if (paths.every((f) => existsSync(f))) {
        paths.forEach((f, i) => copyFileSync(f, join(OUT_DIR, `${key}-${frames[i][1]}.svg`)));
        map[exercise.name] = { key, ext: "svg", from: "everkinetic" };
        counts.everkinetic += 1;
        continue;
      }
    }

    // Then the photographs, which reach the lifts nobody illustrated.
    const shot = pairAgainst(freeIndex, exercise.name);
    const images = shot ? (shot.hit.images ?? []) : [];
    if (images.length >= 2) {
      const paths = images.slice(0, 2).map((rel) => join(FREE_DB, "exercises", rel));
      if (paths.every((f) => existsSync(f))) {
        ["start", "end"].forEach((frame, i) => copyFileSync(paths[i], join(OUT_DIR, `${key}-${frame}.jpg`)));
        map[exercise.name] = { key, ext: "jpg", from: "free-exercise-db" };
        counts["free-exercise-db"] += 1;
      }
    }
  }

  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  writeFileSync(MAP_FILE, `// GENERATED by scripts/build-exercise-art.mjs — do not edit by hand.
//
// Every exercise we have a real picture for, and which library it came from.
// Two frames each, \`-start\` and \`-end\`, under public/exercise-art.
//
// Anything NOT here falls back to the drawn figure in
// components/ExerciseDemo.tsx — most of the sport-specific work, because no
// exercise library has a cone weave or a Copenhagen plank. See the script for
// why the pairing refuses more than it accepts.

export type ArtSource = "everkinetic" | "free-exercise-db";

/**
 * Where each library came from and what it asks for in return.
 *
 * Everkinetic is CC BY-SA 4.0, so it must be credited — and share-alike binds
 * ADAPTATIONS, which is why the pipeline copies files and never edits them.
 * free-exercise-db is public domain and asks for nothing; it is credited anyway,
 * because taking someone's work silently because you legally may is a poor way
 * to treat the people who make the free things.
 */
export const ART_SOURCES: Record<ArtSource, {
  work: string; author: string; source: string; licence: string; licenceUrl: string;
}> = {
  everkinetic: {
    work: "Everkinetic",
    author: "Greg Priday",
    source: "https://github.com/everkinetic/data",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  "free-exercise-db": {
    work: "Free Exercise DB",
    author: "yuhonas",
    source: "https://github.com/yuhonas/free-exercise-db",
    licence: "Public domain",
    licenceUrl: "https://unlicense.org/",
  },
};

/** The credit for the illustrated set, kept for callers that predate the photos. */
export const ART_CREDIT = ART_SOURCES.everkinetic;

interface ArtEntry { key: string; ext: "svg" | "jpg"; from: ArtSource }

export const EXERCISE_ART: Record<string, ArtEntry> = {
${entries.map(([name, e]) => `  ${JSON.stringify(name)}: { key: ${JSON.stringify(e.key)}, ext: ${JSON.stringify(e.ext)}, from: ${JSON.stringify(e.from)} },`).join("\n")}
};

/** The two frames for an exercise, or null when we only have the drawn figure. */
export function artFor(name: string): { start: string; end: string; from: ArtSource } | null {
  const entry = EXERCISE_ART[name.trim()];
  if (!entry) return null;
  return {
    start: \`/exercise-art/\${entry.key}-start.\${entry.ext}\`,
    end: \`/exercise-art/\${entry.key}-end.\${entry.ext}\`,
    from: entry.from,
  };
}
`);

  const total = counts.everkinetic + counts["free-exercise-db"];
  console.log(`${total} of ${IMPORTED_EXERCISES.length} exercises have a picture (${Math.round((100 * total) / IMPORTED_EXERCISES.length)}%)`);
  console.log(`  ${counts.everkinetic} illustrated (Everkinetic), ${counts["free-exercise-db"]} photographed (free-exercise-db)`);
  console.log(`wrote ${MAP_FILE} and ${total * 2} files to ${OUT_DIR}`);
}
