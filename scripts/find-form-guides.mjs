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
  /**
   * ADDED WHEN THE LIST WAS ASKED TO COVER THE WHOLE CATALOGUE.
   *
   * The diagnostic (--why) said the channel gate was the single biggest cause
   * of a movement having no guide: Sit Ups had fourteen candidates and thirteen
   * were refused on channel alone, several of them plainly instructional. A bar
   * that says "a channel I already listed" is not the same bar as "a channel
   * that teaches", and it was quietly the first one.
   *
   * These are coaching, rehab and gym-chain channels that publish instructional
   * content. The gate still exists and still refuses the montage accounts — it
   * just no longer refuses a good tutorial for being from someone I had not
   * thought of.
   */
  "live lean tv", "howcast", "sports rehab expert", "puregym", "fitness lab",
  "jim stoppani", "john meadows", "mountaindog", "nick tumminello", "eric cressey",
  "physiotutors", "bob & brad", "tone and tighten", "saturday strength", "alex leonidas",
  "renaissance woman", "stephanie buttermore", "natacha oceane", "geoffrey verity schofield",
  "house of hypertrophy", "flow high performance", "aliakbar rahimi", "max euceda",
  "kboges", "hampton liu", "minus the gym", "school of calisthenics", "gymnastics bodies",
  "strength side", "tom merrick", "the bioneer", "athlete x", "vitruvian physique",
  "gvs", "greg doucette", "brian alsruhe", "alan roberts", "elitefts",
  "barbend", "power monkey fitness", "the ready state", "kelly starrett", "team usa weightlifting",
  "torokhtiy", "weightlifting house", "mash elite", "lift big eat big", "juggernautai",
  "muscleandstrength", "muscle & strength", "anabolic aliens", "fitnessblender", "hasfit",
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
const NOT_A_DEMO = new RegExp([
  // Not this kind of video at all.
  String.raw`\b(assessment|screen(ing)?|podcast|reaction|q ?& ?a|compilation|motivation|transformation|challenge|full workout|day in the life|physique update)\b`,
  // The argument rather than the lesson.
  String.raw`\b(worth it|bad for your|should you|dangerous|overrated|underrated|myth)\b`,
  // THE VERDICT, NOT THE METHOD — and the worst thing this ever produced.
  // "Jump Squats Are a Poor Exercise Choice" cleared every other gate for our
  // Squat Jump: right channel, right words, right length. An athlete taps
  // "Watch Form Guide" on an exercise their own programme prescribed and is
  // told by an expert that it is a bad exercise. That is worse than no video
  // and worse than the wrong one, because it undermines the plan rather than
  // the rep. Same shape either way round: "Why I Don't Strict Curl", "The Pros
  // & Cons of the Jefferson Deadlift", "Incline VS. Flat". All arguing about
  // whether; none showing how.
  String.raw`\b(poor exercise|waste of time|pointless|why i (don'?t|never)|pros (&|and) cons|instead of|is (better|worse) than)\b`,
  String.raw`\bvs\.?\b`,
  // Qualified because "How To PROPERLY Upright Row (PAIN FREE)" is exactly the
  // video we want and "Wrist and Forearm Pain with Curls" is not.
  String.raw`\bpain\b(?![ -]free)`,
].join("|"), "i");

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

/**
 * The phrasings, tried in order until one yields a candidate that survives.
 *
 * One query was leaving good videos on the table, and not because they did not
 * exist. "Proper form technique" is how a coach titles a video; "how to" and
 * "tutorial" and the bare name are how plenty of others do, and YouTube ranks
 * each phrasing quite differently — the diagnostic showed exercises with a
 * dozen candidates where every one failed a gate under the first query and a
 * clean tutorial appeared under the second.
 *
 * It is also cheap insurance against the search itself: results rotate between
 * runs, so a single query is a single roll of the dice per exercise.
 */
const QUERIES = [
  (name) => `${name} proper form technique`,
  (name) => `how to ${name}`,
  (name) => `${name} exercise tutorial`,
];

async function searchOnce(query) {
  const res = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
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

/** Every phrasing's results, in order, de-duplicated by video id. */
async function search(name) {
  const seen = new Set();
  const all = [];
  for (const build of QUERIES) {
    for (const c of await searchOnce(build(name))) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      all.push(c);
    }
    await sleep(700);
  }
  return all;
}

const seconds = (t) => t.split(":").reduce((a, p) => a * 60 + Number(p), 0);

/**
 * Which gate refused a candidate, or null if it survived. Split out from
 * `choose` so the two can never disagree about the rules — a diagnostic that
 * reports a different reason to the one that fired is worse than none.
 */
/**
 * What the catalogue says this movement is done with, when the name does not
 * say. `equipmentOf` is the app's own answer, so this cannot drift from what
 * the engine believes.
 */
const DERIVED = {
  Barbell: ["barbell"], Dumbbell: ["dumbbell"], Cable: ["cable"], Machine: ["machine"],
  "Smith machine": ["smith"], Kettlebell: ["kettlebell"], "EZ bar": ["ez"],
};
function derivedKit(name) {
  return DERIVED[equipmentOf(name)] ?? [];
}

/**
 * SILENCE MEANS DIFFERENT THINGS ON THE TWO SIDES, which is what the previous
 * rule got wrong in both directions at once.
 *
 * When OUR name states the implement it is because that is the non-obvious
 * variant — "Dumbbell Bench Press" exists to be distinguished from the bench
 * press — so the title has to state it too. Soft matching there gave us a
 * barbell demonstration for a dumbbell lift.
 *
 * When our name is SILENT the implement is the default one, and a title is
 * equally entitled to leave the default unsaid. Requiring an exact match there
 * refused ScottHerman's "Incline Barbell Bench Press" for our Incline Bench
 * Press — the right video, refused for being more specific than we were.
 */
function kitOk(expected, stated, theirKit) {
  if (!theirKit.length) return !stated;
  if (!expected.length) return false;
  return theirKit.every((k) => expected.includes(k));
}

export function refusal(name, c) {
  const mine = words(name);
  const mineSet = new Set(mine);
  const mineKit = IMPLEMENT.filter((k) => mineSet.has(k));
  const core = mine.filter((w) => !IMPLEMENT.includes(w));
  const bodyweight = equipmentOf(name) === "Bodyweight";

  if (!TEACHERS.some((t) => c.channel.toLowerCase().includes(t))) return "channel";
  if (NOT_A_DEMO.test(c.title)) return "not-a-demo";
  const secs = seconds(c.length);
  if (secs < 40 || secs > 20 * 60) return "length";

  const theirs = new Set(words(c.title));
  const missing = core.filter((w) => !theirs.has(w));
  if (missing.length) return `missing:${missing.join("+")}`;
  const form = FORM.filter((d) => mineSet.has(d) !== theirs.has(d));
  if (form.length) return `form:${form.join("+")}`;
  const theirKit = IMPLEMENT.filter((k) => theirs.has(k));
  if (bodyweight && theirKit.length) return `loaded:${theirKit.join("+")}`;
  const expected = mineKit.length ? mineKit : derivedKit(name);
  if (!kitOk(expected, mineKit.length > 0, theirKit)) {
    return `kit:${expected.join("+") || "none"}/${theirKit.join("+") || "none"}`;
  }
  return null;
}

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
  const expected = mineKit.length ? mineKit : derivedKit(name);
  const stated = mineKit.length > 0;

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
    if (!kitOk(expected, stated, theirKit)) continue;

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

/**
 * `--why`: for each name given, print what the top candidates were and which
 * gate refused each. A coverage number tells you the rules are too strict; only
 * this tells you WHICH rule, and whether loosening it would be honest.
 */
async function why(names) {
  for (const name of names) {
    const candidates = await search(name);
    console.log(`\n${name}  (${candidates.length} candidates)`);
    const tally = new Map();
    for (const c of candidates) {
      const r = refusal(name, c) ?? "PASSED";
      tally.set(r.split(":")[0], (tally.get(r.split(":")[0]) ?? 0) + 1);
    }
    console.log("  gates: " + [...tally].map(([k, v]) => `${k}=${v}`).join(" "));
    for (const c of candidates.slice(0, 6)) {
      console.log(`  ${(refusal(name, c) ?? "PASSED").padEnd(22)} ${c.channel} — ${c.title}`);
    }
    await sleep(1200);
  }
}

async function main() {
  const src = readFileSync("lib/form-guide.ts", "utf8");
  const block = src.slice(src.indexOf("const CURATED"), src.indexOf("};", src.indexOf("const CURATED")));
  const already = new Set([...block.matchAll(/"([^"]+)":\s*"http/g)].map((m) => m[1]));

  const cat = readFileSync("lib/exercise-catalog.ts", "utf8");
  const names = [...new Set([...cat.matchAll(/^([A-Z][^|\n]+)\|/gm)].map((m) => m[1].trim()))];

  const argv = process.argv.slice(2);
  if (argv[0] === "--why") {
    const names = readFileSync(argv[1], "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    await why(names);
    return;
  }
  const filters = argv.map((s) => s.toLowerCase());
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
