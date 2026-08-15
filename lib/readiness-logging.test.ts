import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adjustForReadiness } from "./engine";
import { prescribedEffort } from "./effort";
import type { ProgramSession } from "./engine";

const session = {
  day: 1, title: "Day 1 · Strength", focus: "strength",
  drills: [
    { name: "A-skips", sets: 3, reps: 20, cue: "", reason: "", prescription: "3 × 20m", slot: "warmup", rest: 30 },
    { name: "Back squat", sets: 4, reps: 5, cue: "", reason: "", prescription: "4 × 5", slot: "primary", rest: 150, intensity: "RPE 8" },
    { name: "Bulgarian split squat", sets: 3, reps: 8, cue: "", reason: "", prescription: "3 × 8", slot: "secondary", rest: 90, intensity: "RPE 8" },
  ],
} as unknown as ProgramSession;

/**
 * READINESS EASING WAS COSMETIC IN THE RECORD.
 *
 * On a Yellow morning the card, the drill list and the guided player all showed
 * the eased session — a set off every working drill, RPE down a notch — and
 * then `toggleSession` logged the ORIGINAL. So the app told you to do less,
 * walked you through less, and wrote down the full prescription.
 *
 * Everything downstream believed the written version: ACWR treated a
 * deliberately easy day as a full one, the volume chart over-counted, and the
 * effort check compared how hard you said it felt against a prescription you
 * were never given.
 */
test("easing a session actually removes work", () => {
  const eased = adjustForReadiness(session, "Yellow");
  const setsOf = (s: ProgramSession, name: string) => s.drills.find((d) => d.name === name)!.sets;

  assert.equal(setsOf(eased, "Back squat"), setsOf(session, "Back squat") - 1, "no set was removed");
  assert.equal(setsOf(eased, "Bulgarian split squat"), setsOf(session, "Bulgarian split squat") - 1);
  // Warm-ups are untouched — trimming a warm-up on a bad day is the wrong end.
  assert.equal(setsOf(eased, "A-skips"), setsOf(session, "A-skips"), "the warm-up was trimmed");
  // And the prescribed effort really drops, which is what the effort check reads.
  const before = prescribedEffort({ weeks: [{ sessions: [session] }] } as never)!;
  const after = prescribedEffort({ weeks: [{ sessions: [eased] }] } as never)!;
  assert.ok(after < before, `prescribed effort did not drop: ${before} → ${after}`);
});

test("Red is a different session, not a lighter one", () => {
  const red = adjustForReadiness(session, "Red");
  assert.ok(!red.drills.some((d) => d.name === "Back squat"), "a Red day still prescribes the heavy lift");
  assert.match(red.title, /Recovery/i);
});

test("Green is untouched", () => {
  assert.deepEqual(adjustForReadiness(session, "Green"), session);
});

/**
 * The seam. Every assertion above is about the engine, and the engine was
 * always right — the bug was that the page logged a different object than the
 * one it displayed.
 */
test("the page logs the session it showed you, not the one written weeks ago", () => {
  const src = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.ok(!/const newDrills = sess\.s\.drills\.map/.test(noComments),
    "the original session's drills are being logged again, so easing is cosmetic");
  assert.match(noComments, /const logged = isToday && todaySession \? todaySession : sess\.s;/,
    "the adjusted session is no longer preferred when logging today");
  assert.match(noComments, /const newDrills = logged\.drills\.map/,
    "the drills written to the log do not come from the adjusted session");
  // The intensity written must come from the same object, or the effort check
  // compares a reported effort against a prescription nobody was given.
  assert.match(noComments, /sessions: \[logged\]/,
    "the logged intensity is derived from the unadjusted session");
});

test("an eased day is explained, not just retitled", () => {
  const src = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8");
  // Red already had a paragraph. Yellow said only "· eased back" in a title —
  // an athlete who does not know a set was removed adds it back.
  assert.match(src, /Readiness is <b className="text-amber-400">Yellow<\/b>/,
    "a Yellow day no longer explains what was changed");
});
