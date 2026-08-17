import test from "node:test";
import assert from "node:assert/strict";
import { anatomyActivation } from "./muscle-activation";

test("anatomy map distinguishes the front and back of the body", () => {
  const chest = anatomyActivation(["Chest", "Triceps", "Shoulders"]);
  assert.equal(chest.frontChest, "primary");
  assert.equal(chest.backTriceps, "secondary");
  assert.equal(chest.frontShoulders, "secondary");
  assert.equal(chest.backHamstrings, undefined);

  const posterior = anatomyActivation(["Hamstrings", "Glutes", "Back"]);
  assert.equal(posterior.backHamstrings, "primary");
  assert.equal(posterior.backGlutes, "secondary");
  assert.equal(posterior.backLats, "secondary");
  assert.equal(posterior.frontQuads, undefined);
});

test("a later assistant never downgrades a primary region", () => {
  const activation = anatomyActivation(["Calves", "Legs"]);
  assert.equal(activation.frontCalves, "primary");
  assert.equal(activation.backCalves, "primary");
  assert.equal(activation.frontQuads, "secondary");
});
