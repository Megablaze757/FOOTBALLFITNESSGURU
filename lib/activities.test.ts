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
  dayTotals, mainSessionDrill, mainSessionLabel, PARTS_OF_DAY,
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

test("the day's length comes from the activities, and only from them", () => {
  const padel = activityDrill("Padel", 60)!;
  const ride = activityDrill("Cycling", 30)!;
  const squat = { name: "Barbell back squat", sets: 3, reps: 8 };
  assert.equal(dayTotals([padel, ride, squat]).minutes, 90);
  assert.equal(dayTotals([squat]).minutes, null, "a lifting drill is not a session");
  assert.equal(dayTotals([]).minutes, null);
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

test("the day's boxes are derived on every change to the list, not just additions", () => {
  // THIS TEST REPLACED ONE THAT SAID THE OPPOSITE, and the premise is what
  // changed. While an activity was a thing you did INSIDE a session, the
  // session length could only ever be suggested — overwriting it would undo
  // what the athlete said. Now each entry IS a session, so the boxes are the
  // day's total, and a day that loses a session must lose its minutes too.
  // Deriving only on the way up leaves a 105-minute day after the 60-minute
  // half of it was deleted, which overstates the load — the same failure this
  // feature exists to fix, pointing the other way.
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("const setSessions"), src.indexOf("const setDrill"));
  assert.match(body, /const totals = dayTotals\(drills\);/);
  assert.match(body, /total_minutes: totals\.minutes,/);
  assert.doesNotMatch(body, /totals\.sessions > 1 \?/, "the totals are still only written on the way up");
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

// --- more than one session in a day -------------------------------------------
// "Spin this morning, padel this afternoon." "Rugby training, gym later." The
// log held one duration and one effort for the whole day, so the second session
// either overwrote the first or was left out — and both are wrong in the same
// direction: a double day is the hardest kind and was recorded as the lightest.

test("a session carries its own effort and time of day", () => {
  const spin = activityDrill("Spin", 45, { effort: 8, part: "morning" })!;
  assert.equal(spin.effort, 8);
  assert.equal(spin.part_of_day, "morning");
});

test("an effort nobody gave is left absent, not stored as nought", () => {
  const padel = activityDrill("Padel", 60)!;
  assert.equal(padel.effort, undefined);
  assert.equal(padel.part_of_day, undefined);
});

test("effort is clamped to the scale it is shown on", () => {
  assert.equal(activityDrill("Spin", 30, { effort: 47 })!.effort, 10);
  assert.equal(activityDrill("Spin", 30, { effort: 0 })!.effort, undefined);
  assert.equal(activityDrill("Spin", 30, { effort: -4 })!.effort, undefined);
});

test("two sessions add up to a day", () => {
  const day = dayTotals([
    activityDrill("Spin", 45, { effort: 8, part: "morning" })!,
    activityDrill("Padel", 60, { effort: 5, part: "afternoon" })!,
  ]);
  assert.equal(day.sessions, 2);
  assert.equal(day.minutes, 105);
});

test("the day's effort is weighted by how long each session lasted", () => {
  // Training load is minutes × effort. A 20-minute spin at 9 and a 90-minute
  // game at 5 average to 7, and 110 × 7 claims far more load than either
  // session earned. Weighted, minutes × intensity comes out at exactly the sum.
  const day = dayTotals([
    activityDrill("Spin", 20, { effort: 9 })!,
    activityDrill("Padel", 90, { effort: 5 })!,
  ]);
  assert.equal(day.minutes, 110);
  assert.equal(day.intensity, 6, "a plain average would have said 7");
  const load = day.minutes! * day.intensity!;
  assert.ok(Math.abs(load - (20 * 9 + 90 * 5)) <= day.minutes!, "the day's load does not match its sessions'");
});

test("a session with no effort does not drag the day down", () => {
  // Absent is not zero. Recording LESS about a session must not make the day
  // look easier than it was.
  const day = dayTotals([
    activityDrill("Spin", 60, { effort: 8 })!,
    activityDrill("Walk", 60)!,
  ]);
  assert.equal(day.minutes, 120);
  assert.equal(day.intensity, 8);
});

test("the session already in the day's boxes becomes a session of its own", () => {
  // "Rugby training this morning, gym later" is two sessions, and the first was
  // only ever the day's length and effort. Folded into the list it stops being
  // an unexplained part of a bigger total: the athlete can see both of the
  // things they did, which is also the only way they can spot a wrong one.
  const first = mainSessionDrill("rugby", 90, 7)!;
  assert.equal(first.name, "Rugby training");
  assert.equal(first.effort, 7);
  const day = dayTotals([first, activityDrill("Gym session", 60, { effort: 6, part: "evening" })!]);
  assert.equal(day.sessions, 2);
  assert.equal(day.minutes, 150);
  assert.equal(day.intensity, 7, "150 min at a weighted 6.6");
});

test("the folded-in session is named after the sport, not after the gym", () => {
  // "Gym session" is wrong for a footballer whose first session was training
  // with their club, and a list of two rows both called "Training" tells the
  // athlete nothing about which one to correct.
  assert.equal(mainSessionLabel("football"), "Football training");
  assert.equal(mainSessionLabel("running"), "Run");
  assert.equal(mainSessionLabel("weightlifting"), "Gym session");
  assert.equal(mainSessionLabel("hurling"), "Training session", "an unknown sport still gets a name");
  assert.equal(mainSessionLabel(null), "Training session");
});

test("a session with no minutes is not a session", () => {
  // The fold only happens when there is something to fold. A day whose length
  // was never filled in has nothing to say, and inventing a nought-minute
  // entry for it would put an empty row above the padel match.
  assert.equal(mainSessionDrill("rugby", 0, 7), null);
  assert.equal(mainSessionDrill("rugby", Number.NaN, 7), null);
});

test("an ordinary gym day reports no sessions of its own", () => {
  // dayTotals speaks for the LIST, and an ordinary day has nothing in it — the
  // day's boxes are the athlete's own. Reporting one session here would make
  // the check-in derive over the top of them and wipe the session length of
  // every gym day in the app.
  const day = dayTotals([{ name: "Barbell back squat", sets: 3, reps: 8 } as never]);
  assert.equal(day.sessions, 0);
  assert.equal(day.minutes, null);
});

test("a day with nothing in it reports nothing, not zero", () => {
  const day = dayTotals([]);
  assert.equal(day.minutes, null);
  assert.equal(day.intensity, null);
  assert.equal(day.sessions, 0);
});

test("lifting drills are not sessions of their own", () => {
  // Each one is an exercise INSIDE a session — three sets of squats and three
  // of bench are one gym session, not six.
  const day = dayTotals([
    { name: "Barbell back squat", sets: 3, reps: 8 } as never,
    { name: "Barbell bench press", sets: 3, reps: 8 } as never,
    activityDrill("Padel", 60, { effort: 6 })!,
  ]);
  assert.equal(day.sessions, 1, "a lift was counted as a session");
  assert.equal(day.minutes, 60);
});

test("every part of the day has a name and a distinct id", () => {
  assert.equal(new Set(PARTS_OF_DAY.map((p) => p.id)).size, PARTS_OF_DAY.length);
  for (const part of PARTS_OF_DAY) {
    assert.ok(part.label.length > 2 && part.emoji.length > 0, part.id);
  }
});

test("the first session is folded in exactly once, as the list begins", () => {
  // Fold twice and the morning session is counted twice; fold on the second
  // add instead of the first and it is lost. `was === 0` is the only moment
  // the day's boxes describe a session that is not already in the list.
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("const setSessions"), src.indexOf("const setDrill"));
  assert.match(body, /if \(was === 0 && \(value\.total_minutes \?\? 0\) > 0\) \{/);
  assert.match(body, /mainSessionDrill\(sport, value\.total_minutes as number, value\.intensity \?\? null\)/);
  // And a day with no list before and none after is left completely alone.
  assert.match(body, /if \(was === 0 && now === 0\) \{\s*update\(\{ drills: next \}\);/);
});

test("the runner's clock stops rewriting the day once the day has two sessions", () => {
  // A runner's run IS their session, so the run clock writes total_minutes —
  // right up until they add the gym afterwards. From then on that same write
  // erases the second session every time they correct their time, which is a
  // worse bug than the one it fixes because it happens silently and often.
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("const setRunPart"), src.indexOf("const setSessionMinutes"));
  assert.match(body, /if \(!value\.drills\.some\(isActivityDrill\)\) \{/);
  assert.match(body, /mainSessionLabel\(sport\)/, "the run's own entry is left stale");
  assert.match(body, /const totals = dayTotals\(drills\);/);
});

test("the boxes say what they now mean when the day holds more than one session", () => {
  // "Session length: 135" after a 90-minute rugby session and a 45-minute gym
  // one reads as a bug, and the athlete's first instinct is to correct it back
  // to 90 — which is exactly the number the app must not be told.
  const src = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  assert.match(src, /const sessions = value\.drills\.filter\(isActivityDrill\)\.length;/);
  assert.match(src, /sessions > 1 \? "Today's total \(min\)" : "Session length \(min\)"/);
  assert.match(src, /Added up from your \{sessions\} sessions above\./);
});

test("a finished check-in says how many sessions, and which was when", () => {
  // "Training logged — 135 min" hides the fact the athlete recognises: they
  // trained twice. And two rows both reading "Padel · 60 min" look like a
  // double-entry until one of them says morning and the other evening.
  const src = readFileSync(new URL("../components/CheckInDone.tsx", import.meta.url), "utf8");
  assert.match(src, /sessions > 1 \? `\$\{sessions\} sessions logged`/);
  assert.match(src, /PARTS_OF_DAY\.find\(\(p\) => p\.id === d\.part_of_day\)/);
  assert.match(src, /d\.effort \? ` · \$\{d\.effort\}\/10`/);
});

test("the check-in asks for the time of day and the effort of each session", () => {
  const src = readFileSync(new URL("../components/OtherActivity.tsx", import.meta.url), "utf8");
  assert.match(src, /Did you train more than once\?/);
  assert.match(src, /PARTS_OF_DAY\.map/, "there is no way to say when a session happened");
  assert.match(src, /type="range"/, "there is no way to say how hard a session was");
  // The list of what is already logged is the whole feedback loop: without it
  // the second entry goes into a form that looks exactly like the first.
  assert.match(src, /logged\.map/);
});

test("two sessions in a day carry more load than either one alone", () => {
  // The point of the whole thing: a double day is the hardest kind, and the log
  // was recording it as the lightest.
  const morning = { drills: [activityDrill("Spin", 45, { effort: 8 })], total_minutes: 45, intensity: 8 };
  const both = dayTotals([
    activityDrill("Spin", 45, { effort: 8 })!,
    activityDrill("Padel", 60, { effort: 6 })!,
  ]);
  const day = { drills: [], total_minutes: both.minutes, intensity: both.intensity };
  assert.ok(sessionLoad(day as never) > sessionLoad(morning as never), "the afternoon added nothing");
});

test("spin is its own chip, not a note under cycling", () => {
  // Somebody logged "Spin" by hand, which is the signal that a chip is missing.
  // It is separate from cycling on purpose: a studio class is a fixed
  // three quarters of an hour at an effort somebody else picks.
  const spin = matchActivity("Spin");
  assert.equal(spin?.id, "spin");
  assert.ok(spin!.intensity > (matchActivity("Cycling")?.intensity ?? 0),
    "a spin class is not scored harder than a bike ride");
});

