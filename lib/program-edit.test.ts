import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEdit, moveDrill, removeDrill, restoreDrill, addDrill, resetSession,
  isEdited, orderWarnings, removeWarning, sessionKey, slotLabel,
  type SessionEdit,
} from "./program-edit";
import type { ProgramDrill, ProgramSession } from "./engine";

const d = (name: string, slot?: ProgramDrill["slot"], extra: Partial<ProgramDrill> = {}): ProgramDrill =>
  ({ name, sets: 3, reps: 8, cue: "", reason: "", slot, ...extra });

const session = (drills: ProgramDrill[]): ProgramSession =>
  ({ day: 1, title: "Lower", focus: "strength", drills });

const BASE = session([
  d("Leg swings", "warmup"),
  d("Back squat", "primary"),
  d("Romanian deadlift", "secondary"),
  d("Leg curl", "accessory"),
  d("Couch stretch", "cooldown"),
]);

const names = (s: ProgramSession) => s.drills.map((x) => x.name);

test("no edit means the session the engine wrote", () => {
  assert.deepEqual(applyEdit(BASE, undefined), BASE);
  assert.deepEqual(names(applyEdit(BASE, {})), names(BASE));
});

test("sessionKey matches the completion list's spelling", () => {
  assert.equal(sessionKey(1, 3), "w1d3");
});

// --- moving -------------------------------------------------------------------

test("a move writes the whole order, not just the drill that moved", () => {
  const edit = moveDrill(BASE.drills, 3, 1);
  assert.deepEqual(edit.order, [
    "Leg swings", "Leg curl", "Back squat", "Romanian deadlift", "Couch stretch",
  ]);
  assert.deepEqual(names(applyEdit(BASE, edit)), edit.order);
});

test("a move to where it already is changes nothing", () => {
  assert.deepEqual(moveDrill(BASE.drills, 2, 2), {});
});

test("an index off the end is clamped rather than losing the drill", () => {
  const edit = moveDrill(BASE.drills, 0, 99);
  assert.equal(edit.order?.length, 5);
  assert.equal(edit.order?.[4], "Leg swings");
  assert.deepEqual(moveDrill(BASE.drills, 99, 0), {}, "a source that does not exist is a no-op");
  assert.deepEqual(moveDrill(BASE.drills, -1, 0), {});
});

// --- the plan moving underneath a saved edit -----------------------------------

/**
 * THE FAILURE THIS PREVENTS. Blocks regenerate — a new week, a rebuild after an
 * injury, a settings change — so an order saved last week names drills that may
 * no longer exist and misses ones that now do. Sorting the unknowns to the end
 * puts a freshly-generated warm-up after the cool-down, which is exactly the
 * kind of nonsense that makes people switch a feature off.
 */
test("a drill the athlete never sorted stays next to where the engine put it", () => {
  const edit: SessionEdit = { order: ["Back squat", "Leg swings", "Couch stretch"] };
  const grown = session([
    d("Leg swings", "warmup"),
    d("Hip airplane", "warmup"),       // new, never sorted
    d("Back squat", "primary"),
    d("Bulgarian split squat", "accessory"), // new, never sorted
    d("Couch stretch", "cooldown"),
  ]);
  const out = names(applyEdit(grown, edit));
  assert.ok(out.indexOf("Hip airplane") < out.indexOf("Couch stretch"), "not dumped at the end");
  assert.ok(out.indexOf("Hip airplane") === out.indexOf("Leg swings") + 1, "still beside its neighbour");
  assert.equal(out.length, 5, "nothing is lost");
});

test("an order naming a drill the engine dropped is simply ignored", () => {
  const edit: SessionEdit = { order: ["Back squat", "Gone forever", "Leg swings"] };
  const out = names(applyEdit(session([d("Leg swings", "warmup"), d("Back squat", "primary")]), edit));
  assert.deepEqual(out, ["Back squat", "Leg swings"]);
});

test("applying is stable — the same edit twice gives the same order", () => {
  const edit = moveDrill(BASE.drills, 4, 0);
  const once = names(applyEdit(BASE, edit));
  const twice = names(applyEdit(applyEdit(BASE, edit), edit));
  assert.deepEqual(twice, once);
});

// --- removing -----------------------------------------------------------------

test("a removed drill is gone, and restoring brings it back", () => {
  const removedEdit = removeDrill(BASE.drills, "Leg curl");
  assert.deepEqual(removedEdit.removed, ["Leg curl"]);
  assert.ok(!names(applyEdit(BASE, removedEdit)).includes("Leg curl"));

  const back = restoreDrill("Leg curl", removedEdit);
  assert.equal(back.removed, undefined, "the key is deleted, not left as an empty list");
  assert.ok(names(applyEdit(BASE, back)).includes("Leg curl"));
});

test("removing the same drill twice does not duplicate it", () => {
  const once = removeDrill(BASE.drills, "Leg curl");
  const twice = removeDrill(BASE.drills, "Leg curl", once);
  assert.deepEqual(twice.removed, ["Leg curl"]);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Rehab work comes from an active protocol, not from the block. The app already
 * refuses to offer a SWAP for it for the same reason. Honouring a stale
 * `removed` entry would take somebody off their protocol without anybody
 * choosing to — so it is refused at both ends.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("rehab work cannot be removed, at the source or on apply", () => {
  const withRehab = session([d("Back squat", "primary"), d("Calf raise", "accessory", { rehab: true })]);

  assert.deepEqual(removeDrill(withRehab.drills, "Calf raise"), {}, "refused at the source");

  // And a hand-edited or stale overlay naming it is ignored too.
  const forced: SessionEdit = { removed: ["Calf raise"] };
  assert.ok(names(applyEdit(withRehab, forced)).includes("Calf raise"));
});

test("removing a drill that is not there is a no-op", () => {
  assert.deepEqual(removeDrill(BASE.drills, "Never existed"), {});
});

// --- adding -------------------------------------------------------------------

test("an added drill appears, and adding it again replaces rather than duplicates", () => {
  const extra = d("Face pull", "accessory");
  const once = addDrill(extra);
  assert.ok(names(applyEdit(BASE, once)).includes("Face pull"));

  const twice = addDrill({ ...extra, sets: 4 }, once);
  assert.equal(twice.added?.length, 1);
  assert.equal(twice.added?.[0].sets, 4);
});

test("an added drill can then be ordered like any other", () => {
  const withExtra = addDrill(d("Face pull", "accessory"));
  const shown = applyEdit(BASE, withExtra);
  const moved = moveDrill(shown.drills, shown.drills.length - 1, 0);
  assert.equal(names(applyEdit(BASE, { ...withExtra, ...moved }))[0], "Face pull");
});

// --- reset --------------------------------------------------------------------

test("reset is deleting a key, so the engine's session comes back untouched", () => {
  const edits = { w1d1: moveDrill(BASE.drills, 0, 4), w1d2: { removed: ["X"] } };
  const after = resetSession(edits, "w1d1");
  assert.equal(after.w1d1, undefined);
  assert.ok(after.w1d2, "other sessions are left alone");
  assert.deepEqual(names(applyEdit(BASE, after.w1d1)), names(BASE));
});

test("isEdited drives whether reset is even offered", () => {
  assert.equal(isEdited(undefined), false);
  assert.equal(isEdited({}), false);
  assert.equal(isEdited({ order: [] }), false);
  assert.equal(isEdited({ removed: [] }), false);
  assert.equal(isEdited({ order: ["a"] }), true);
  assert.equal(isEdited({ removed: ["a"] }), true);
  assert.equal(isEdited({ added: [d("a")] }), true);
});

// --- warnings, which never block ----------------------------------------------

test("a tidy session warns about nothing", () => {
  assert.deepEqual(orderWarnings(BASE.drills), []);
});

test("accessories ahead of the main lift are called out once, by name", () => {
  const moved = applyEdit(BASE, moveDrill(BASE.drills, 3, 0));
  const warnings = orderWarnings(moved.drills);
  assert.equal(warnings.length, 1, "one warning, not one per accessory");
  assert.match(warnings[0], /Back squat/);
  assert.match(warnings[0], /Leg curl/);
});

test("a warm-up after the main work, and a cool-down that is not last", () => {
  const late = [d("Back squat", "primary"), d("Leg swings", "warmup")];
  assert.match(orderWarnings(late).join(" "), /Leg swings is a warm-up/);

  const early = [d("Couch stretch", "cooldown"), d("Back squat", "primary")];
  assert.match(orderWarnings(early).join(" "), /cool-down with work after it/);
});

/** v1 programs have no slot at all, and must not warn on every session. */
test("drills with no slot are treated as main work, not as warm-ups", () => {
  assert.deepEqual(orderWarnings([d("Squat"), d("Bench"), d("Row")]), []);
});

test("removing the only main lift says what the day becomes", () => {
  assert.match(removeWarning(BASE.drills, "Back squat") ?? "", /only main lift/i);
  assert.equal(removeWarning(BASE.drills, "Leg curl"), null, "an accessory is a free choice");
  assert.match(removeWarning(BASE.drills, "Leg swings") ?? "", /last of the warm-up/i);
});

test("the rehab refusal is explained rather than silent", () => {
  const withRehab = session([d("Back squat", "primary"), d("Calf raise", "accessory", { rehab: true })]);
  assert.match(removeWarning(withRehab.drills, "Calf raise") ?? "", /recovery plan/i);
});

test("removeWarning on a drill that is not there says nothing", () => {
  assert.equal(removeWarning(BASE.drills, "Never existed"), null);
});

test("slotLabel falls back to main work rather than showing a raw key", () => {
  assert.equal(slotLabel(d("Squat", "primary")), "Main work");
  assert.equal(slotLabel(d("Leg swings", "warmup")), "Warm-up");
  assert.equal(slotLabel(d("Old drill")), "Main work");
});
