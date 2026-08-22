// Logging the training nobody programmed.
//
// The check-in could record the prescribed session and a run. An hour of padel
// or a Sunday bike ride had no way in, so it was either skipped — losing the
// load entirely — or typed into the drill picker as "3 × 10 padel at 0kg",
// which is not a record of a game of padel and quietly corrupts the volume
// numbers it lands in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVITIES, matchActivity, activityDrill, isActivityDrill, activityMinutes,
  suggestedSessionMinutes,
} from "./activities";
import { hasTrainingContent, sessionLoad } from "./load";

test("an activity is a drill measured in minutes, not sets and reps", () => {
  const drill = activityDrill("Padel", 60)!;
  assert.equal(drill.measure, "minutes");
  assert.equal(drill.duration_seconds, 3600);
  assert.equal(drill.sets, 1);
});

test("the summary fields carry the minutes too", () => {
  // A log written before per-set detail existed reads `sets × reps`, and a row
  // showing "1 × 0" everywhere those are displayed would look like a session
  // that never happened.
  const drill = activityDrill("Cycling", 45)!;
  assert.equal(drill.reps, 45);
  assert.equal(activityMinutes(drill), 45);
});

test("nothing is logged for an activity with no name or no time", () => {
  // Absent is not zero. A blank row is somebody who started typing and stopped,
  // not a zero-minute session.
  assert.equal(activityDrill("", 60), null);
  assert.equal(activityDrill("   ", 60), null);
  assert.equal(activityDrill("Padel", 0), null);
  assert.equal(activityDrill("Padel", -30), null);
  assert.equal(activityDrill("Padel", Number.NaN), null);
});

test("a known activity is recognised however it was typed", () => {
  assert.equal(matchActivity("padel")?.id, "padel");
  assert.equal(matchActivity("  Padel ")?.id, "padel");
  assert.equal(matchActivity("Cycling")?.id, "cycling");
  assert.equal(matchActivity("evening tennis")?.id, "tennis");
});

test("a near miss is not a match", () => {
  // The emoji and the suggested intensity are worth having only while they are
  // right, so a word that merely contains one is left alone.
  assert.equal(matchActivity("paddleboarding"), null);
  assert.equal(matchActivity("golfing range balls"), null);
  assert.equal(matchActivity(""), null);
});

test("anything typed is accepted, known or not", () => {
  // The list is a shortcut, never a limit — an athlete who plays korfball
  // should not be told their sport does not exist.
  const drill = activityDrill("Korfball", 50)!;
  assert.equal(drill.name, "Korfball");
  assert.equal(activityMinutes(drill), 50);
});

test("every suggestion carries a starting intensity, and a sane one", () => {
  // Otherwise the session is logged at zero load by somebody who came to record
  // a bike ride rather than to rate it.
  for (const activity of ACTIVITIES) {
    assert.ok(activity.intensity >= 1 && activity.intensity <= 10, `${activity.id} is ${activity.intensity}/10`);
    assert.ok(activity.label.length > 2, `${activity.id} has no label`);
    assert.ok(activity.emoji.length > 0, `${activity.id} has no emoji`);
  }
  assert.equal(new Set(ACTIVITIES.map((a) => a.id)).size, ACTIVITIES.length, "two activities share an id");
});

test("gentle things are not rated as hard as hard things", () => {
  const by = (id: string) => ACTIVITIES.find((a) => a.id === id)!.intensity;
  assert.ok(by("walking") < by("football"));
  assert.ok(by("yoga") < by("boxing"));
  assert.ok(by("golf") < by("squash"));
});

test("a lift is not an activity", () => {
  assert.equal(isActivityDrill({ measure: "reps" }), false);
  assert.equal(isActivityDrill({}), false);
  assert.equal(isActivityDrill({ measure: "minutes" }), true);
});

test("the session length is suggested from the activities, and only from them", () => {
  const padel = activityDrill("Padel", 60)!;
  const ride = activityDrill("Cycling", 30)!;
  const squat = { name: "Barbell back squat", sets: 3, reps: 8 };
  assert.equal(suggestedSessionMinutes([padel, ride, squat]), 90);
  assert.equal(suggestedSessionMinutes([squat]), null, "a lifting session suggests nothing");
  assert.equal(suggestedSessionMinutes([]), null);
});

// --- the wiring ---------------------------------------------------------------
// The model above is only useful if the form actually reaches it, and if what
// it produces survives the trip to the database.

test("the check-in offers it, and keeps it out of the exercise list", () => {
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  assert.match(src, /<OtherActivity/, "the log form does not offer an activity");
  // Listing an activity among the exercises would put a padel match in a row
  // with a reps box and a kg box, which is the shape this exists to avoid.
  assert.match(src, /if \(isActivityDrill\(d\)\) return null;/, "activities render as exercises too");
});

test("the session length is only ever suggested, never overwritten", () => {
  // Somebody who logged an hour of padel inside a ninety-minute session has
  // said something the form must not quietly replace.
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  assert.match(src, /value\.total_minutes == null && suggested != null/);
  assert.match(src, /if \(value\.intensity == null\) update\(\{ intensity \}\);/);
});

test("an activity counts as a session that happened", () => {
  // The point of the whole thing: a week with four hours of padel in it was
  // being read as a week of rest.
  const log = { drills: [activityDrill("Padel", 60)], total_minutes: 60, intensity: 6 };
  assert.equal(hasTrainingContent(log), true);
  assert.ok(sessionLoad(log as never) > 0, "an activity adds no training load");
});

test("a finished check-in reports minutes, not one set of sixty reps", () => {
  // describeSets would render a padel match as "1 × 60", which is exactly the
  // reading this feature exists to stop.
  const src = readFileSync(new URL("../components/CheckInDone.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(isActivityDrill\(d\)\)/, "the done view still describes activities as sets");
  assert.match(src, /activityMinutes\(d\)\} min/);
});
