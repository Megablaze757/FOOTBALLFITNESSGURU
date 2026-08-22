// =============================================================================
// The block must not be the same session twice.
//
// Reported by an athlete, in their own words: "gave same exercise 2 days in a
// row, barbell bench press then bench press". Both engines de-duplicated by
// catalogue id, which is a narrower question than the one that matters — Bench
// Press, Dumbbell Bench Press and Smith Machine Bench Press are three rows and
// one exercise, and a week could prescribe two of them without anything
// objecting.
//
// A harness that walked the whole input space measured it: across 2,700
// generated blocks, 8,155 back-to-back days repeated a lift and 4,464 weeks
// contained a pair of names for one movement. The engines were only half the
// cause — most (slot, pattern) pairs in the S&C catalogue held exactly ONE
// movement, so "not yesterday's" had no answer to give. See the depth note in
// lib/exercises.ts.
//
// This is a sample of that harness, sized to run in CI. It asserts properties
// rather than exact output, so an engine change that improves selection passes
// and one that reintroduces the repeat does not.
// =============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { buildProgram, type BuildProgramInput } from "./coach";
import type { ProgramDrill, ProgramPlan } from "./engine";
import { movementKey } from "./movement-key";
import { musclesForName } from "./hypertrophy";
import type { SplitStyle } from "./hypertrophy";
import type { SportId } from "./exercises";
import type { GoalType } from "./movements";
import type { TrainingFocus } from "./engine";

/**
 * The drills a repeat is actually noticeable in.
 *
 * Warm-ups and cool-downs are excluded on purpose — the same eight leg swings
 * before every session is correct, and varying them is theatre. Ball work
 * rotates weekly by design, because skill progresses by variation rather than
 * by load.
 */
const isLift = (d: ProgramDrill) =>
  ["primary", "secondary", "accessory"].includes(String(d.slot)) && !d.skill;

interface Case { label: string; input: BuildProgramInput }

const CASES: Case[] = [];
for (const sport of ["football", "rugby", "basketball", "gym", "weightlifting"] as SportId[])
  for (const goal of ["speed", "strength", "endurance"] as GoalType[])
    for (const focus of [undefined, "aesthetics"] as (TrainingFocus | undefined)[])
      for (const days of [3, 4, 5, 6])
        CASES.push({
          label: `${sport}/${goal}/${focus ?? "-"}/${days}d`,
          input: { goal, sport, focus, painMap: {}, daysPerWeek: days, block: 1 },
        });
// Every named split, since the split decides how often a muscle comes round and
// therefore how many distinct movements it needs.
for (const style of ["ppl", "upper_lower", "full_body", "arnold", "bro"] as SplitStyle[])
  for (const days of [3, 4, 6])
    CASES.push({
      label: `aesthetics/${style}/${days}d`,
      input: { goal: "strength", sport: "gym", focus: "aesthetics", painMap: {}, daysPerWeek: days, style, block: 1 },
    });

const plans: { label: string; plan: ProgramPlan }[] =
  CASES.map(({ label, input }) => ({ label, plan: buildProgram(input) }));

test("no lift lands on two days in a row", () => {
  const offenders: string[] = [];
  for (const { label, plan } of plans) {
    for (const week of plan.weeks) {
      for (let i = 1; i < week.sessions.length; i += 1) {
        const yesterday = new Set(week.sessions[i - 1].drills.filter(isLift).map((d) => movementKey(d.name)));
        const repeated = week.sessions[i].drills.filter(isLift).filter((d) => yesterday.has(movementKey(d.name)));
        if (repeated.length) offenders.push(`${label} d${i}→d${i + 1}: ${repeated.map((d) => d.name).join(", ")}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `${offenders.length} back-to-back repeats`);
});

test("one lift does not appear twice in a week under two names", () => {
  // "Machine Shrug" and "Dumbbell Shrug". "Bench Press" and "Dumbbell Bench
  // Press". Different rows, same exercise — and prescribing both is prescribing
  // the same thing twice while looking like variety.
  const offenders: string[] = [];
  for (const { label, plan } of plans) {
    for (const week of plan.weeks) {
      const names = [...new Set(week.sessions.flatMap((s) => s.drills.filter(isLift).map((d) => d.name)))];
      const byKey = new Map<string, string[]>();
      for (const name of names) {
        const key = movementKey(name);
        byKey.set(key, [...(byKey.get(key) ?? []), name]);
      }
      for (const [, group] of byKey) if (group.length > 1) offenders.push(`${label}: ${group.join(" + ")}`);
    }
  }
  assert.deepEqual(offenders, [], `${offenders.length} weeks contain one lift under two names`);
});

test("no session lists the same movement twice", () => {
  const offenders: string[] = [];
  for (const { label, plan } of plans)
    for (const week of plan.weeks)
      for (const session of week.sessions) {
        const keys = session.drills.filter(isLift).map((d) => movementKey(d.name));
        const twice = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (twice.length) offenders.push(`${label} "${session.title}": ${[...new Set(twice)].join(", ")}`);
      }
  assert.deepEqual(offenders, [], "a session prescribes one movement twice");
});

test("a day called Lower or Legs trains the lower body", () => {
  // The other half of the same report: "it said it was a lower body day but
  // didn't give a single lower body exercise". A title is a promise.
  const LOWER = new Set(["quads", "hamstrings", "glutes", "calves"]);
  const UPPER = new Set(["chest", "back", "shoulders", "biceps", "triceps"]);
  const offenders: string[] = [];
  for (const { label, plan } of plans)
    for (const week of plan.weeks)
      for (const session of week.sessions) {
        const lifts = session.drills.filter(isLift);
        if (!lifts.length) continue;
        const trained = new Set(lifts.flatMap((d) => musclesForName(d.name)));
        const listing = lifts.map((d) => d.name).join(" | ");
        if (/\blower\b|\blegs\b/i.test(session.title) && ![...trained].some((g) => LOWER.has(g)))
          offenders.push(`${label} "${session.title}" → ${listing}`);
        if (/\bupper\b/i.test(session.title) && ![...trained].some((g) => UPPER.has(g)))
          offenders.push(`${label} "${session.title}" → ${listing}`);
      }
  assert.deepEqual(offenders, [], "a session's title does not match what is in it");
});

test("every session has something in it", () => {
  const offenders: string[] = [];
  for (const { label, plan } of plans)
    for (const week of plan.weeks)
      for (const session of week.sessions)
        if (session.kind !== "active_rest" && !session.drills.some((d) => String(d.slot) !== "warmup" && String(d.slot) !== "cooldown"))
          offenders.push(`${label} "${session.title}"`);
  assert.deepEqual(offenders, [], "a session is a warm-up and a cool-down with no training between them");
});

test("a day's title says what is actually in it", () => {
  // The other half of the report, in the athlete's words: "it said it was a
  // lower body day but didn't give a single lower body exercise". Reproduced by
  // excluding legs — the split still called day two "Lower" while every leg
  // group had been filtered out of it. Core rides along with legs by design, so
  // a legs day reduced to an ab wheel rollout is not a legs day.
  const LOWER = /\blower\b|\blegs\b/i;
  const offenders: string[] = [];
  for (const notes of ["I don't train legs", "no squats, lunges or deadlifts"]) {
    for (const style of ["upper_lower", "ppl", "full_body"] as SplitStyle[]) {
      const plan = buildProgram({
        goal: "strength", sport: "gym", focus: "aesthetics", painMap: {},
        daysPerWeek: 4, style, notes, block: 1,
      });
      for (const session of plan.weeks[0].sessions) {
        if (!LOWER.test(session.title)) continue;
        const trained = new Set(session.drills.filter(isLift).flatMap((d) => musclesForName(d.name)));
        const hasLower = ["quads", "hamstrings", "glutes", "calves"].some((g) => trained.has(g as never));
        if (!hasLower) offenders.push(`${style}/"${notes}": "${session.title}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a session is called a lower-body day and contains none");
});

test("the block trains the same main lifts every week, so load can progress", () => {
  // The mechanism the whole thing works by: repeat the movement, add load,
  // deload, repeat. Selection is decided once for the block precisely so that
  // the progression line printed under each drill is true.
  //
  // PRIMARY AND SECONDARY ONLY, and the limit is honest rather than
  // aspirational. The doses climb across a block, so a session gets longer, and
  // the time budget then trims an accessory out of the heavier weeks — which is
  // the budget doing its job. Measured, that is where all the remaining
  // week-to-week difference is. Anchoring the fit to week one, and intersecting
  // every week's fit, were both tried: each cost real training volume (muscles
  // reaching the productive band fell from 88% to 78%) to buy tidiness on a
  // face pull. The lifts the block is built on do not move, and that is the
  // part the progression depends on.
  const isMain = (d: ProgramDrill) => ["primary", "secondary"].includes(String(d.slot)) && !d.skill;
  const offenders: string[] = [];
  for (const { label, plan } of plans) {
    // The deload is excluded, and deliberately: it is the one week the engine is
    // supposed to change, easing or dropping the hardest piece of the session.
    const perDay = plan.weeks
      .slice(0, Math.max(1, plan.weeks.length - 1))
      .map((w) => w.sessions.map((s) => s.drills.filter(isMain).map((d) => d.name).sort().join(" | ")));
    for (let w = 1; w < perDay.length; w += 1)
      for (let d = 0; d < perDay[0].length; d += 1)
        if (perDay[w][d] !== undefined && perDay[w][d] !== perDay[0][d])
          offenders.push(`${label} day ${d + 1}: week 1 "${perDay[0][d]}" vs week ${w + 1} "${perDay[w][d]}"`);
  }
  assert.deepEqual(offenders, [], `${offenders.length} days change their exercises mid-block`);
});
