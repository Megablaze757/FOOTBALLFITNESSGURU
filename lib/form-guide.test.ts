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
