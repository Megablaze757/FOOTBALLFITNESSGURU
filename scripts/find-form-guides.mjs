#!/usr/bin/env node --import tsx
// =============================================================================
// Find a form-guide video for every movement that has not got one.
//
// WHY A SCRIPT. The first eighteen entries in lib/form-guide.ts were curated by
// hand: search, watch the title, check the channel, fetch the id back through
// oembed. That is a few minutes each and roughly two hundred and fifty
// movements left, which is a job nobody finishes — and a hand-built list is one
// nobody can rebuild when a third of it rots.
//
// WHAT IT DOES NOT DO. It does not pick the top search result. A search for
// "dumbbell row proper form" returns upright rows, workout montages, Shorts and
// a man shouting; taking result one would fill the app with confidently wrong
// videos, which is worse than the search link it replaces, because the search
// link never claimed to be a chosen answer.
//
// So it refuses on three separate grounds, and refusing is the common case:
//
//   1. THE CHANNEL. Only channels that teach — see TEACHERS. An unknown
//      channel is refused even when the title is perfect, because the whole
//      value of a curated link over a search is that somebody vouched for who
//      is talking.
//   2. THE MOVEMENT. Every word of our name that is not the implement has to be
//      in the title, and a word that CHANGES the movement disqualifies the pair
//      when only one side has it. This is the same rule as the art matcher
//      "Dumbbell Row" and "Dumbbell Upright Row" share three words out of four
//      and are different exercises, and a fuzzy matcher pairs them confidently.
//   3. THE SHAPE. Between forty seconds and twenty minutes, so a Short and a
//      ninety-minute podcast both fall out. A form guide has a length.
//
// Then it fetches whatever survived back through oembed, because a video id
// that parses is not a video id that plays.
//
//   node scripts/find-form-guides.mjs            # everything uncurated
//   node scripts/find-form-guides.mjs squat row  # only names matching these
//
// It prints TypeScript ready to paste into CURATED. It does not write to
// lib/form-guide.ts: the list is the thing the app promises somebody checked,
// and a script that edits it silently is a script that can un-check it.
// =============================================================================

import { readFileSync } from "node:fs";
import { equipmentOf } from "../lib/exercise-catalog.ts";

/**
 * Channels that teach.
 *
 * Matched case-insensitively against the channel name, as a substring, so
 * "ATHLEAN-X™" matches "athlean". Deliberately a list of names rather than
 * channel ids: ids are unreadable, and a reviewer of this file should be able
 * to see who we are sending people to.
 *
 * The physio-led ones (E3 Rehab, Squat University, Barbell Medicine, Prehab)
 * earn their place on the rehab and injury-adjacent movements, where a bad
 * demonstration does the opposite of the exercise's job.
 */
const TEACHERS = [
  "athlean", "scottherman", "jeff nippard", "renaissance periodization", "colossus fitness",
  "buff dudes", "e3 rehab", "squat university", "alan thrall", "untamed strength",
  "physique development", "jps health", "built with science", "jeremy ethier",
  "barbell medicine", "juggernaut training", "catalyst athletics", "calisthenicmovement",
  "bret contreras", "the prehab guys", "prehab guys", "brendan meyers", "fitnessfaqs",
  "bodybuilding.com", "musclewiki", "kabuki strength", "starting strength", "megsquats",
  "omar isuf", "silent mike", "clarence kennedy", "sonny webster", "zack telander",
  "mind pump", "picturefit", "criticalbench", "critical bench", "ignore limits",
  "rehab science", "movement system", "conor harris", "precision movement",
  "redefining strength", "hybrid performance", "garage strength", "westside barbell",
];

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
  "pendlay", "rack", "hang", "power", "jerk", "flexor", "bent", "over", "deficit", "pause", "paused",
  "safety", "landmine", "sissy", "meadows", "yates", "zottman", "jefferson", "spoto", "tate", "viking",
  "renegade", "arnold", "cheat", "strict", "clap", "archer", "diamond", "pike", "handstand", "muscle",
  "ring", "inverted", "chin", "toe", "bar", "belt", "half", "sled", "smith", "hex", "log", "floor", "pin",
  // Movement nouns. A title that names a DIFFERENT movement to ours is a
  // different exercise however many words the two share, and these are the
  // words that say which movement it is.
  "jump", "twist", "kick", "kickback", "circle", "throw", "carry", "drag", "thrust", "bridge",
  "plank", "shrug", "lunge", "crunch", "hyperextension", "rollout", "climber", "burpee",
  "superman", "flutter", "scissor", "snatch", "clean", "curl", "fly", "row", "raise", "press",
  "pull", "pulldown", "push", "extension", "dip", "squat", "deadlift", "thruster", "pullover",
];

/**
 * Titles that are not a demonstration.
 *
 * "Overhead Squat Assessment: 4 Areas to Assess" is a good video by a good
 * channel about how to SCREEN somebody, and an athlete who taps "Watch Form
 * Guide" on Overhead Squat is not being screened. A video can pass every other
 * gate and still be the wrong kind of video.
 *
 * The second group is the argument rather than the lesson — "Muscle Ups (WORTH
 * IT OR NOT?)" and "Military Sit Ups (BAD FOR YOUR BACK?)" both cleared every
 * other gate, and neither shows anybody how to do the thing.
 *
 * `pain` is qualified because "How To PROPERLY Upright Row (PAIN FREE)" is
 * exactly the video we want and "Wrist and Forearm Pain with Curls" is not.
 *
 * Note what is NOT here: "mistakes". "9 Smith Machine Squat Mistakes and How to
 * Fix Them" teaches the lift by way of the errors, which is a form guide.
 */
const NOT_A_DEMO = /\b(assessment|screen(ing)?|podcast|reaction|q ?& ?a|compilation|motivation|transformation|challenge|full workout|day in the life|physique update)\b|\b(worth it|bad for your|should you|dangerous|overrated|underrated|myth)\b|\bpain\b(?![ -]free)/i;

/**
 * The implement, which is a HARD test in both directions.
 *
 * The obvious rule is the soft one — only refuse when both sides name kit and
 * the kit differs — on the grounds that our names only say the implement when
 * it is not the obvious one. That reasoning does not survive contact with
 * YouTube titles.
 *
 * A title omits the implement when it is the OBVIOUS one — "How to Bench
 * Press" is the barbell — so silence is not "unspecified", it is a claim. Soft
 * matching duly gave our Dumbbell Bench Press a barbell demonstration and our
 * (barbell) Floor Press a dumbbell one. Both passed every other gate.
 *
 * Strictness is affordable here in a way it was not there: a search returns
 * twenty candidates and the rule just takes a later one, where the art library
 * had exactly one best pair or none.
 */
const IMPLEMENT = ["barbell", "dumbbell", "cable", "machine", "smith", "band", "ball", "kettlebell", "ez"];

const SYN = { triceps: "tricep", biceps: "bicep", abs: "ab", glutes: "glute", db: "dumbbell", bb: "barbell" };
const STOP = new Set(["with", "using", "on", "the", "a", "and", "to", "for", "your", "of", "how", "do", "does", "in", "at", "is", "it"]);
const sing = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s) => {
  let t = " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  for (const [k, v] of Object.entries(SYN)) t = t.replaceAll(` ${k} `, ` ${v} `);
  return t.split(/\s+/).filter((w) => w && !STOP.has(w)).map(sing);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * YouTube throttles a run of these, and the throttle looks like a dropped
 * connection rather than a 429 — eleven searches in it simply stops answering.
 * Backing off and retrying is the difference between curating the catalogue and
 * curating the first eleven names in it alphabetically.
 */
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "Accept-Language": "en-GB,en;q=0.9", "User-Agent": "Mozilla/5.0" } });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // Dropped connection: the throttle's usual shape. Fall through and wait.
    }
    await sleep(2000 * 2 ** i);
  }
  return null;
}

async function search(name) {
  const q = encodeURIComponent(`${name} proper form technique`);
  const res = await get(`https://www.youtube.com/results?search_query=${q}`);
  if (!res) return [];
  const html = await res.text();
  const start = html.indexOf("var ytInitialData = ");
  if (start < 0) return [];
  const from = start + "var ytInitialData = ".length;
  const end = html.indexOf(";</script>", from);
  let data;
  try {
    data = JSON.parse(html.slice(from, end));
  } catch {
    return [];
  }
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const v = node.videoRenderer;
    if (v?.videoId && v.lengthText?.simpleText) {
      out.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text ?? "",
        channel: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? "",
        length: v.lengthText.simpleText,
      });
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return out;
}

const seconds = (t) => t.split(":").reduce((a, p) => a * 60 + Number(p), 0);

/** The first candidate that survives every gate, or null. */
export function choose(name, candidates) {
  const mine = words(name);
  const mineSet = new Set(mine);
  const mineKit = IMPLEMENT.filter((k) => mineSet.has(k));
  const core = mine.filter((w) => !IMPLEMENT.includes(w));

  /**
   * A BODYWEIGHT MOVEMENT MUST NOT BE TAUGHT WITH A WEIGHT IN SOMEBODY'S HANDS.
   *
   * The implement rule below is deliberately soft — "Bent Over Row" and "Bent
   * Over Row with a Barbell" are the same lift, and our names only say the
   * implement when it is not the obvious one. That softness put "Dumbbell Jump
   * Squat" against our Squat Jump: identical word sets, one of them loaded.
   *
   * For a bodyweight movement the implement is not an unstated detail, it is
   * the whole distinction, so there the rule goes hard. `equipmentOf` is the
   * catalogue's own answer rather than a second list to keep in step.
   */
  const bodyweight = equipmentOf(name) === "Bodyweight";

  for (const c of candidates) {
    if (!TEACHERS.some((t) => c.channel.toLowerCase().includes(t))) continue;
    if (NOT_A_DEMO.test(c.title)) continue;
    const secs = seconds(c.length);
    if (secs < 40 || secs > 20 * 60) continue;

    const theirs = new Set(words(c.title));
    if (!core.every((w) => theirs.has(w))) continue;
    if (FORM.some((d) => mineSet.has(d) !== theirs.has(d))) continue;
    const theirKit = IMPLEMENT.filter((k) => theirs.has(k));
    if (bodyweight && theirKit.length) continue;
    if (mineKit.length !== theirKit.length || !mineKit.every((k) => theirKit.includes(k))) continue;

    return c;
  }
  return null;
}

/** A parsed id is not a playing id. */
async function verify(id) {
  const res = await get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
  if (!res) return null;
  return res.json();
}

async function main() {
  const src = readFileSync("lib/form-guide.ts", "utf8");
  const block = src.slice(src.indexOf("const CURATED"), src.indexOf("};", src.indexOf("const CURATED")));
  const already = new Set([...block.matchAll(/"([^"]+)":\s*"http/g)].map((m) => m[1]));

  const cat = readFileSync("lib/exercise-catalog.ts", "utf8");
  const names = [...new Set([...cat.matchAll(/^([A-Z][^|\n]+)\|/gm)].map((m) => m[1].trim()))];

  const filters = process.argv.slice(2).map((s) => s.toLowerCase());
  const todo = names
    .filter((n) => !already.has(n.toLowerCase()))
    .filter((n) => !filters.length || filters.some((f) => n.toLowerCase().includes(f)));

  console.error(`${todo.length} movements to try (${already.size} already curated)\n`);

  const found = [];
  for (const [i, name] of todo.entries()) {
    process.stderr.write(`[${i + 1}/${todo.length}] ${name} … `);
    let picked = null;
    try {
      picked = choose(name, await search(name));
    } catch (err) {
      console.error(`search failed (${err.message})`);
      continue;
    }
    if (!picked) {
      console.error("no candidate passed");
      await sleep(1200);
      continue;
    }
    const live = await verify(picked.id);
    if (!live) {
      console.error(`${picked.id} did not resolve`);
      await sleep(1200);
      continue;
    }
    console.error(`${live.author_name} — ${live.title}`);
    found.push({ name, id: picked.id, channel: live.author_name, title: live.title });
    await sleep(1200);
  }

  console.error(`\n${found.length} of ${todo.length} matched.\n`);
  for (const f of found) {
    console.log(`  "${f.name.toLowerCase()}": "https://www.youtube.com/watch?v=${f.id}", // ${f.channel}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
