import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formGuide, NO_GUIDE, curatedCount } from "./form-guide";
import { EXERCISES } from "./exercises";

/**
 * "The how-to images look worse than before. Use video links only."
 *
 * The images were not worse — the FRAME was. ExerciseDemo always drew pose `a`,
 * and `a` is usually somebody standing up: a squat, a hinge, a lunge, a lateral
 * shuffle and a ball drill all begin from the same neutral stand, so five of
 * eleven patterns drew an identical figure and a library grid of three hundred
 * exercises was three hundred copies of one standing person. See `still` in
 * components/ExerciseDemo.tsx.
 *
 * The videos are the other half. A drawing tells a squat from a hinge at a
 * glance in a long list; it cannot show a bar path, a tempo, or what a rounded
 * back looks like from the side, and those are what a form guide is for.
 */

test("no two movement patterns draw the same picture", () => {
  // THE ACTUAL COMPLAINT, as a test. If a pattern's still frame is identical to
  // another's, the figure is decoration — and decoration taking up a third of
  // every card reads as broken.
  const demo = readFileSync(new URL("../components/ExerciseDemo.tsx", import.meta.url), "utf8");
  const stills = [...demo.matchAll(/\n  (\w+): \{[\s\S]*?still: "(a|b)",\n  \},/g)]
    .map(([block, pattern, key]) => ({ pattern, key, block }));
  assert.ok(stills.length >= 11, `only found ${stills.length} patterns with a named still frame`);

  const drawn = new Map<string, string>();
  for (const { pattern, key, block } of stills) {
    const frame = block.match(new RegExp(`${key}: \\{([\\s\\S]*?)\\},`))?.[1] ?? "";
    const joints = frame.replace(/\s|\/\/[^\n]*/g, "");
    const already = drawn.get(joints);
    assert.ok(!already, `${pattern} draws exactly the same figure as ${already}`);
    drawn.set(joints, pattern);
  }
});

test("the still is the frame that identifies the movement", () => {
  const demo = readFileSync(new URL("../components/ExerciseDemo.tsx", import.meta.url), "utf8");
  // The ones whose start position is a plain stand must not show the start.
  for (const pattern of ["squat", "hinge", "lunge", "jump", "press"]) {
    const block = demo.match(new RegExp(`\\n  ${pattern}: \\{[\\s\\S]*?\\n  \\},`))?.[0] ?? "";
    assert.match(block, /still: "b"/, `${pattern} still draws its starting position`);
  }
  assert.match(demo, /const still = pose\[pose\.still\]/, "the component ignores the chosen frame");
});

test("a staple lift has a chosen video, not a search", () => {
  // These are the lifts where the failure mode is an injury rather than a
  // wasted set, and where the difference between a good demonstration and a bad
  // one is somebody's back.
  for (const lift of ["Barbell back squat", "Barbell deadlift", "Bench press", "Romanian deadlift"]) {
    const guide = formGuide(lift);
    assert.equal(guide?.kind, "video", `${lift} falls back to a search`);
    assert.match(guide!.url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
  }
  assert.ok(curatedCount() >= 10);
});

test("everything else still has somewhere to go", () => {
  // Hand-picking three hundred videos is a job nobody finishes and a set of
  // links that rots. A search on the exact name cannot 404.
  let missing = 0;
  for (const exercise of EXERCISES) {
    const guide = formGuide(exercise.name);
    if (!guide) { missing += 1; continue; }
    assert.match(guide.url, /^https:\/\//, exercise.name);
    assert.equal(guide.label, "Watch Form Guide", exercise.name);
  }
  assert.equal(missing, 0, `${missing} library exercises have no form guide at all`);
});

test("a search is aimed at a demonstration, not a montage", () => {
  const guide = formGuide("Cossack squat")!;
  assert.equal(guide.kind, "search");
  // The bare name returns workout montages set to music, which demonstrate
  // nothing.
  assert.match(decodeURIComponent(guide.url), /Cossack squat proper form technique/);
});

test("a name too thin to search says so rather than pretending", () => {
  // A YouTube search for "circuit" returns everything, which is the same as
  // returning nothing while looking like it worked.
  for (const name of ["", "   ", "circuit", "session", "warm-up", "ab"]) {
    assert.equal(formGuide(name), null, `"${name}" produced a guide`);
  }
  assert.match(NO_GUIDE, /No video guide available/);
});

test("both how-to surfaces offer it, and label it the same", () => {
  for (const file of ["../components/ExerciseDetail.tsx", "../components/DrillDetail.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /formGuide\(/, `${file} does not offer a form guide`);
    assert.match(src, /\{guide\.label\}/, `${file} writes its own label`);
    assert.match(src, /\{NO_GUIDE\}/, `${file} shows nothing when there is no guide`);
    assert.match(src, /target="_blank"/, `${file} navigates away from the app`);
    assert.match(src, /rel="noreferrer"/, `${file} leaks the referrer`);
  }
  // "Visit ›" promises nothing and could be a shop.
  const card = readFileSync(new URL("../components/ExerciseDetail.tsx", import.meta.url), "utf8");
  assert.ok(!/>\s*Visit <span aria-hidden>›<\/span>/.test(card), "the unlabelled button is back");
});

test("a curated link that has rotted is removed, not left promising", () => {
  /**
   * Two of the twelve were dead when this was checked live — "nordic hamstring
   * curl" and "copenhagen plank", both 404. They were also the two on the list
   * where the failure mode is a torn hamstring or a strained groin rather than
   * a wasted set: the most worth curating, and the ones nobody noticed had
   * rotted.
   *
   * Nothing looks wrong from inside the app. The button renders, the link is
   * well-formed, and the apology page belongs to YouTube. So they fall back to
   * a search, which always works, and `scripts/check-form-guides.mjs` makes the
   * next one findable — it prints each title too, because an id that still
   * resolves can point at something else entirely.
   */
  // Both are curated again — with DIFFERENT videos, checked live through the
  // oembed endpoint with the title and channel read back before they were
  // written down. The dead ids are what must never come back.
  for (const name of ["Nordic hamstring curl", "Copenhagen plank"]) {
    assert.equal(formGuide(name)?.kind, "video", `${name} lost its guide`);
  }
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("1ge2yiG3fzc") && !src.includes("RS3aDCDwLnQ"), "a dead id is back in the list");
  assert.match(src, /scripts\/check-form-guides\.mjs/, "nothing points at the checker");
});

test("the checker reads the list rather than a copy of it", () => {
  // A checker with its own hardcoded list checks the wrong thing the moment
  // somebody adds a link.
  const script = readFileSync(new URL("../scripts/check-form-guides.mjs", import.meta.url), "utf8");
  assert.match(script, /readFileSync\(new URL\("\.\.\/lib\/form-guide\.ts"/);
  assert.match(script, /indexOf\("const CURATED"\)/);
  assert.match(script, /oembed/);
  // It has to report the title, not just the status: a 200 is not the same as
  // the right video.
  assert.match(script, /\.title/);
  assert.match(script, /process\.exit\(1\)/, "a dead link does not fail the run");
});

test("the video is the main event where there is no picture", () => {
  // About 120 movements have neither a photograph nor an illustration — the
  // sport-specific work no anatomy library covers. On those the drawn figure is
  // the only thing above the fold, and a figure is a reminder for somebody who
  // knows the movement and nearly nothing for somebody who does not.
  const sheet = readFileSync(new URL("../components/DrillDetail.tsx", import.meta.url), "utf8");
  assert.match(sheet, /const illustrated = artFor\(how\.name\) !== null;/);
  assert.match(sheet, /No illustration for this one — watch it done before you try it\./);
  // And it says which kind of link it is: a chosen video and a search are
  // different promises.
  assert.match(sheet, /guide\.kind === "video"/);
});

test("the exercises where bad form hurts somebody are taught by a physio", () => {
  // A nordic curl and a Copenhagen plank are prescribed to PREVENT a hamstring
  // tear and a groin strain. A demonstration that gets them wrong does the
  // opposite of the job, which is why these two are the ones worth being fussy
  // about — and why both point at the same rehab channel rather than at
  // whichever video ranked first.
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  assert.match(src, /"nordic hamstring curl": "https:\/\/www\.youtube\.com\/watch\?v=_e9vFU9-tkc"/);
  assert.match(src, /"copenhagen plank": "https:\/\/www\.youtube\.com\/watch\?v=YRRnnZsRs9U"/);
  assert.match(src, /E3 Rehab/);
});

test("the curated list grew, and every entry is a well-formed watch url", () => {
  // Eighteen against the original twelve. The shape is checked here; whether
  // each is still LIVE is scripts/check-form-guides.mjs, because that needs the
  // network and a suite that fails when YouTube hiccups teaches people to
  // ignore red.
  const src = readFileSync(new URL("./form-guide.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const CURATED"), src.indexOf("};", src.indexOf("const CURATED")));
  const urls = [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 17, `only ${urls.length} curated guides`);
  for (const url of urls) {
    assert.match(url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/, url);
  }
  // No duplicate id under two names by accident — the nordic curl has two keys
  // ON PURPOSE, because the catalogue spells it both ways.
  const keys = [...block.matchAll(/"([a-z ]+)":\s*"https/g)].map((m) => m[1]);
  assert.equal(new Set(keys).size, keys.length, "a name is curated twice");
});

