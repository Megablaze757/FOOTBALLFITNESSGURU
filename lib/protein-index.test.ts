import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIGH_PROTEIN_ENERGY_SHARE,
  MAX_PORTION,
  REFERENCE_PROTEIN,
  indexFacts,
  money,
  portionLabel,
  proteinIndex,
  qualifies,
} from "./protein-index";
import { FOODS } from "./food-db";

const byName = (name: string) => proteinIndex().find((e) => e.name === name);

test("the index is cheapest first and nothing is free", () => {
  const index = proteinIndex();
  assert.ok(index.length >= 15, `only ${index.length} foods qualify`);
  for (let i = 1; i < index.length; i++) {
    assert.ok(index[i - 1].cost <= index[i].cost, `out of order at ${i}`);
  }
  for (const e of index) assert.ok(e.cost > 0, `${e.name} costs nothing`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOTH RULES, BECAUSE EITHER ALONE PUBLISHES SOMETHING SILLY.
 *
 * These are not hypotheticals — they are what the first two versions of this
 * file actually produced. Share test only: soy sauce is a protein source.
 * Portion test only: so are stock cubes. Whichever rule gets relaxed later,
 * this is the test that says why it was there.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("condiments and near-zero-calorie vegetables stay out", () => {
  for (const name of ["Soy sauce", "Stock cubes", "Cherry tomatoes", "Broccoli", "Baby spinach"]) {
    assert.equal(byName(name), undefined, `${name} is listed as a protein source`);
  }
  for (const name of ["Red lentils", "Chicken breast fillets", "Firm tofu", "Greek style yoghurt (0% fat)"]) {
    assert.ok(byName(name), `${name} should be in the index`);
  }
});

test("each rule is doing work the other does not", () => {
  const all = FOODS.filter((f) => f.unit !== "each" && f.protein > 0 && f.kcal > 0 && f.packPrice > 0)
    .map((f) => ({
      name: f.name,
      energyShare: (f.protein * 4) / f.kcal,
      portion: (REFERENCE_PROTEIN / f.protein) * 100,
    }));

  const shareOnly = all.filter((f) => f.energyShare >= HIGH_PROTEIN_ENERGY_SHARE && f.portion > MAX_PORTION);
  const portionOnly = all.filter((f) => f.energyShare < HIGH_PROTEIN_ENERGY_SHARE && f.portion <= MAX_PORTION);

  assert.ok(shareOnly.length > 0,
    "nothing is excluded by the portion rule alone — it has stopped earning its place");
  assert.ok(portionOnly.length > 0,
    "nothing is excluded by the share rule alone — it has stopped earning its place");
  assert.ok(shareOnly.some((f) => f.name === "Soy sauce"), "soy sauce should need the portion rule");
  assert.ok(portionOnly.some((f) => f.name === "Stock cubes"), "stock cubes should need the share rule");
});

test("the share rule matches the statutory definition it cites", () => {
  // 20% of energy from protein, protein at 4 kcal/g. A food with 10g protein
  // per 100g needs to be at or under 200 kcal to qualify.
  assert.equal(HIGH_PROTEIN_ENERGY_SHARE, 0.2);
  for (const e of proteinIndex()) {
    const impliedKcal = (e.proteinPer100 * 4) / e.energyShare;
    assert.ok(e.proteinPer100 * 4 >= impliedKcal * HIGH_PROTEIN_ENERGY_SHARE - 1e-9,
      `${e.name} is in the index below the 20% threshold`);
  }
});

test("every listed portion is one a person could eat", () => {
  for (const e of proteinIndex()) {
    assert.ok(e.portion <= MAX_PORTION,
      `${e.name} needs ${Math.round(e.portion)}${e.unit} for ${REFERENCE_PROTEIN}g of protein`);
  }
});

/** The claim the page makes about a food has to be arithmetic, not memory. */
test("the cost is the price of the stated portion", () => {
  for (const e of proteinIndex()) {
    const food = FOODS.find((f) => f.id === e.id)!;
    const pricePerGram = food.packPrice / food.packSize;
    assert.ok(Math.abs(e.cost - pricePerGram * e.portion) < 0.005,
      `${e.name}: ${money(e.cost)} does not match ${Math.round(e.portion)}${e.unit} at shelf price`);
  }
});

test("the headline facts are true of the list they describe", () => {
  const facts = indexFacts();
  assert.ok(facts);
  const index = proteinIndex();

  assert.equal(facts.count, index.length);
  assert.equal(facts.cheapest.cost, Math.min(...index.map((e) => e.cost)));
  assert.equal(facts.dearest.cost, Math.max(...index.map((e) => e.cost)));
  assert.ok(Math.abs(facts.spread - facts.dearest.cost / facts.cheapest.cost) < 1e-9);
  assert.ok(facts.spread > 1, "a spread of 1 means there is nothing interesting to say");

  // The plant/animal split is the comparison the post is built on, so both
  // sides have to exist and the saving has to be the difference between them.
  assert.ok(facts.cheapestPlant, "no plant source — the comparison cannot be made");
  assert.ok(facts.cheapestAnimal, "no animal source — the comparison cannot be made");
  assert.ok(Math.abs(facts.plantSaving! - (facts.cheapestAnimal!.cost - facts.cheapestPlant!.cost)) < 1e-9);

  for (const e of index) {
    if (e === facts.cheapestPlant) break;
    assert.ok(["meat", "pork", "fish", "dairy", "egg"].some((t) => e.tags.includes(t)),
      `${e.name} is cheaper than the "cheapest plant" and is not animal-derived`);
  }
});

test("labels read the way a person would say them", () => {
  assert.equal(money(0.31), "£0.31");
  assert.equal(money(3.2), "£3.20");
  const lentils = byName("Red lentils")!;
  assert.equal(portionLabel(lentils), "120g");
  // Small portions keep their precision; large ones round to the nearest 5.
  assert.match(portionLabel(byName("Whey protein powder")!), /^\d+g$/);
});

test("qualifies() is the whole gate, so the page and the post cannot disagree", () => {
  for (const e of proteinIndex()) assert.ok(qualifies(e), `${e.name} is listed but does not qualify`);
});
