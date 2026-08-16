import test from "node:test";
import assert from "node:assert/strict";
import {
  activeStage, rehabWork, rehabAvoid, blockedBy, applyRehabAvoid, applyRehabToSession, parseDose, describeRehab,
  type RehabPlanRow,
} from "./rehab-plan";

const plan = (): RehabPlanRow => ({
  created_at: "2026-08-01T09:00:00Z",
  area: "hamstring",
  description: "tweaked sprinting",
  active: true,
  current_stage: 1,
  plan: {
    summary: "Graded loading for a grade-1 hamstring strain.",
    seeAProfessional: "See a physio if it does not settle in two weeks.",
    progressWhen: "Pain-free walking and no swelling.",
    redFlags: ["Sudden loss of power", "Numbness down the leg"],
    stages: [
      {
        name: "Phase 1 — Settle", timeframe: "Week 0–1", goal: "Calm it down and keep the tissue moving.",
        exercises: [
          { name: "Isometric hamstring hold", dose: "5 × 20s", note: "Pain below 3/10." },
          { name: "Glute bridge", dose: "3 × 12", note: "Slow and controlled." },
        ],
        avoid: ["Sprinting", "Nordic curls", "Any heavy hinging"],
      },
      {
        name: "Phase 2 — Load", timeframe: "Week 1–3", goal: "Rebuild strength through range.",
        exercises: [{ name: "Romanian deadlift", dose: "3 × 8", note: "Light, full range." }],
        avoid: ["Maximal sprinting"],
      },
      {
        name: "Phase 3 — Return", timeframe: "Week 3–5", goal: "Back to full speed.",
        exercises: [{ name: "Build-up runs", dose: "6 × 60m", note: "Ramp to 80%." }],
        avoid: [],
      },
    ],
  },
});

// --- which stage -------------------------------------------------------------

test("a new plan starts on stage one", () => {
  const s = activeStage(plan(), "2026-08-05")!;
  assert.equal(s.number, 1);
  assert.equal(s.total, 3);
  assert.match(s.stage.name, /Settle/);
  assert.equal(s.ageDays, 4);
});

/**
 * THE SAFETY PROPERTY OF THE WHOLE MODULE.
 *
 * Every stage carries a timeframe as well as a criterion, and deriving the
 * stage from the date would be wrong in the one direction that matters: an
 * athlete whose hamstring still hurts at week four does not become ready for
 * sprint work because four weeks have passed.
 */
test("time never advances the stage on its own", () => {
  const old = { ...plan(), created_at: "2026-01-01T09:00:00Z" };
  const s = activeStage(old, "2026-08-16")!;
  assert.equal(s.number, 1, "a plan advanced itself by the calendar");
  assert.match(s.stage.name, /Settle/);
  assert.ok(s.ageDays! > 200, "the age is still reported, so the UI can prompt");
});

test("the athlete's chosen stage is what is used", () => {
  assert.equal(activeStage({ ...plan(), current_stage: 2 })!.number, 2);
  assert.match(activeStage({ ...plan(), current_stage: 3 })!.stage.name, /Return/);
});

test("a stage number past the end of the plan is clamped, not crashed", () => {
  // A plan can be regenerated with fewer stages than the one it replaced, and
  // an out-of-range index would take the whole injury page down.
  assert.equal(activeStage({ ...plan(), current_stage: 99 })!.number, 3);
  assert.equal(activeStage({ ...plan(), current_stage: 0 })!.number, 1);
  assert.equal(activeStage({ ...plan(), current_stage: -4 })!.number, 1);
});

test("an inactive or empty plan is no plan at all", () => {
  assert.equal(activeStage({ ...plan(), active: false }), null);
  assert.equal(activeStage(null), null);
  assert.equal(activeStage(undefined), null);
  assert.equal(activeStage({ plan: null }), null);
  assert.equal(activeStage({ plan: { ...plan().plan!, stages: [] } }), null);
});

// --- what goes into a session ------------------------------------------------

test("the current stage's exercises are what the session should carry", () => {
  const work = rehabWork(plan());
  assert.deepEqual(work.map((e) => e.name), ["Isometric hamstring hold", "Glute bridge"]);
  // And they move with the stage.
  assert.deepEqual(rehabWork({ ...plan(), current_stage: 3 }).map((e) => e.name), ["Build-up runs"]);
  assert.deepEqual(rehabWork(null), [], "no plan should be an empty list, not a crash");
});

// --- what comes out of a session ---------------------------------------------

/**
 * THE HALF THAT MATTERS MORE.
 *
 * Adding three band exercises to a session that still opens with heavy squats
 * has not respected the injury; it has made the session longer.
 */
test("an avoid instruction matches the drills it means", () => {
  const avoid = rehabAvoid(plan());
  assert.ok(blockedBy("Sprint 6 × 40m", avoid), "sprinting was not caught");
  assert.ok(blockedBy("Nordic curl", avoid), "the named exercise was not caught");
  assert.ok(blockedBy("Barbell hinge", avoid), "heavy hinging was not caught");
  assert.equal(blockedBy("Bench press", avoid), null, "an unrelated drill was blocked");
  assert.equal(blockedBy("Glute bridge", avoid), null, "the plan's own exercise was blocked");
});

test("matching is on significant words, not the whole phrase", () => {
  // "Avoid explosive hamstring loading" never appears verbatim in a drill name,
  // so a substring test on the full phrase matches nothing — and a filter that
  // silently does nothing is the worst outcome, because the session then looks
  // injury-aware and is not.
  assert.ok(blockedBy("Hamstring curl", ["Avoid explosive hamstring loading"]));
  assert.ok(blockedBy("Depth jumps", ["No jumping for now"]));
});

test("prose connectives cannot block the whole session", () => {
  // "Avoid any exercise that causes pain" is real plan text, and matching on
  // "exercise" or "any" would strip every drill in the programme.
  const woolly = ["Avoid any exercise that causes pain", "Nothing high load for now"];
  for (const name of ["Bench press", "Back squat", "Sled push", "Pull-up"]) {
    assert.equal(blockedBy(name, woolly), null, `"${name}" was blocked by woolly plan prose`);
  }
});

test("removing a drill reports which instruction removed it", () => {
  // A session that quietly shrinks is indistinguishable from a bug, and the
  // reason is the most useful thing the app can say at that moment.
  const drills = [
    { name: "Sprint 6 × 40m" }, { name: "Bench press" },
    { name: "Nordic curl" }, { name: "Back squat" },
  ];
  const { kept, removed } = applyRehabAvoid(drills, rehabAvoid(plan()));
  assert.deepEqual(kept.map((d) => d.name), ["Bench press", "Back squat"]);
  assert.equal(removed.length, 2);
  assert.match(removed[0].because, /Sprint/i);
  assert.ok(removed.every((r) => r.because), "a drill was removed with no reason attached");
});

test("no plan changes nothing", () => {
  const drills = [{ name: "Sprint 6 × 40m" }, { name: "Nordic curl" }];
  const { kept, removed } = applyRehabAvoid(drills, rehabAvoid(null));
  assert.deepEqual(kept, drills);
  assert.deepEqual(removed, []);
});

// --- what the coach is told --------------------------------------------------

test("the briefing line carries the stage, the work and the exit criteria", () => {
  // THE COMPLAINT: "it's not reading my injury plan in ask coach". It could
  // not — the briefing carried the generic protocol for a body area, never the
  // athlete's own generated plan.
  const line = describeRehab(plan(), "2026-08-05")!;
  assert.match(line, /hamstring/);
  assert.match(line, /stage 1 of 3/);
  assert.match(line, /Isometric hamstring hold \(5 × 20s\)/);
  assert.match(line, /Avoiding at this stage/);
  assert.match(line, /Pain-free walking/, "the exit criteria are missing, so the coach cannot say how to progress");
  assert.equal(describeRehab(null), null);
  assert.equal(describeRehab({ ...plan(), active: false }), null);
});

// --- the session it produces -------------------------------------------------

const asDrill = (e: { name: string; dose: string }) => ({ name: e.name, dose: e.dose });

test("an active plan puts its work into the session and takes out what it forbids", () => {
  // THE COMPLAINT: "if i started an injury plan my sessions should include
  // whats in the plan and take it into account." Both halves, in one pass.
  const session = [{ name: "Sprint 6 × 40m", dose: "" }, { name: "Back squat", dose: "" }, { name: "Nordic curl", dose: "" }];
  const out = applyRehabToSession(session, plan(), asDrill);

  assert.deepEqual(out.added.map((e) => e.name), ["Isometric hamstring hold", "Glute bridge"]);
  assert.deepEqual(out.removed.map((r) => r.drill.name), ["Sprint 6 × 40m", "Nordic curl"]);
  assert.deepEqual(out.drills.map((d) => d.name),
    ["Isometric hamstring hold", "Glute bridge", "Back squat"]);
});

test("rehab work opens the session", () => {
  // It is the part with a deadline on it. An athlete who runs out of time
  // should lose the last accessory, not the isometrics that are the reason
  // they can train at all.
  const out = applyRehabToSession([{ name: "Back squat", dose: "" }], plan(), asDrill);
  assert.equal(out.drills[0].name, "Isometric hamstring hold");
});

test("the athlete is told what changed, by name", () => {
  const out = applyRehabToSession([{ name: "Sprint 6 × 40m", dose: "" }], plan(), asDrill);
  assert.match(out.note ?? "", /rehab exercise/);
  assert.match(out.note ?? "", /Sprint 6 × 40m/, "a drill vanished without being named");
});

test("no active plan leaves the session exactly as it was", () => {
  const session = [{ name: "Sprint 6 × 40m", dose: "" }, { name: "Nordic curl", dose: "" }];
  for (const row of [null, undefined, { ...plan(), active: false }]) {
    const out = applyRehabToSession(session, row, asDrill);
    assert.deepEqual(out.drills, session);
    assert.equal(out.note, null, "a note was written about a plan that is not being followed");
  }
});

test("a later stage lets back in what an earlier one blocked", () => {
  // Stage 3 has no avoid list, which is the point of finishing a rehab plan.
  const out = applyRehabToSession([{ name: "Sprint 6 × 40m", dose: "" }], { ...plan(), current_stage: 3 }, asDrill);
  assert.deepEqual(out.removed, []);
  assert.ok(out.drills.some((d) => d.name === "Sprint 6 × 40m"));
});

test("a plan's prose dose becomes something loggable", () => {
  assert.deepEqual(parseDose("5 × 20s"), { sets: 5, reps: 20 });
  assert.deepEqual(parseDose("3 x 12"), { sets: 3, reps: 12 });
  assert.deepEqual(parseDose("Hold for 45 seconds"), { sets: 1, reps: 45 });
  // A drill offered with zero sets cannot be ticked off, so an unparseable
  // dose gets a sensible default the athlete can correct rather than a broken
  // row they have to delete.
  assert.deepEqual(parseDose("as tolerated"), { sets: 3, reps: 10 });
  assert.deepEqual(parseDose(null), { sets: 3, reps: 10 });
  assert.deepEqual(parseDose(""), { sets: 3, reps: 10 });
});
