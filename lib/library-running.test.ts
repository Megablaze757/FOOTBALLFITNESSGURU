// Running is not in the exercise library.
//
// The library answers "how do I do this movement" — a figure, the muscles, the
// kit. An "Easy run" row opened to a card telling you to go for a run, and a
// page of zone reference sat collapsed underneath a list of squats. Neither job
// was being done well, so the runs and the reference both moved to Guides.
//
// The entries themselves stay in the catalogue: the programme prescribes them
// by name and the check-in matches them. This is about what the library SHOWS.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXERCISES, isRunEntry } from "./exercises";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every run type is recognised as one", () => {
  const runs = EXERCISES.filter(isRunEntry).map((e) => e.name);
  for (const name of ["Easy run", "Long run", "Tempo runs", "Threshold run", "Hill repeats", "Fartlek"]) {
    assert.ok(runs.includes(name), `${name} is still shown as a library movement`);
  }
  assert.ok(runs.length >= 8, `only ${runs.length} runs recognised — the list has drifted`);
  // Every id in the list has to name a real entry, or the list quietly shrinks
  // as the catalogue changes and runs start reappearing in the library.
  const known = new Set(EXERCISES.map((e) => e.id));
  for (const id of ["tempo_runs", "easy_run", "long_run", "threshold_run", "hill_repeats"]) {
    assert.ok(known.has(id), `${id} is in the run list but not in the catalogue`);
  }
});

test("conditioning that is not running stays in the library", () => {
  // The line is "a movement you look up" against "a session with a zone". Bike
  // intervals and a sled push are the former; deleting them would be a
  // different and worse change than the one that was asked for.
  const runs = new Set(EXERCISES.filter(isRunEntry).map((e) => e.name));
  for (const name of ["Bike intervals", "Rowing intervals", "Swim intervals", "Sled push", "Skipping"]) {
    assert.ok(!runs.has(name), `${name} was filtered out with the runs`);
  }
});

test("the library filters them out and says where they went", () => {
  const page = read("../app/(app)/library/page.tsx");
  assert.match(page, /!isRunEntry\(e\)/, "the list no longer excludes runs");
  assert.match(page, /Running is in Guides/, "nothing tells a runner where the zones went");
  assert.match(page, /href="\/essentials"/, "the pointer does not link anywhere");
});

test("the zone guide moved rather than being deleted", () => {
  // It is real coaching content that every run prescription points back at.
  const guides = read("../app/(app)/essentials/page.tsx");
  assert.match(guides, /id: "running"/, "Guides has no Running tab");
  assert.match(guides, /<RunningGuide \/>/, "the Running tab renders nothing");
  const library = read("../app/(app)/library/page.tsx");
  assert.ok(!/ZoneGuide|RunTypeGuide/.test(library), "the library still renders the zone guide");
});

test("the count on the page is the number of rows you can scroll", () => {
  const library = read("../app/(app)/library/page.tsx");
  assert.match(library, /MOVEMENT_COUNT/, "the heading still counts entries it does not show");
});
