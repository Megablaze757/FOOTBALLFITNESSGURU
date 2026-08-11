import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateMeal, fromAiItems, fitDimensions, scaleItem, totalOf, type EstimatedItem } from "./food-estimate";

const names = (t: string) => estimateMeal(t).items.map((i) => i.name.toLowerCase());

// --- the headline case -------------------------------------------------------

test("\"today i had chicken and rice\" produces real numbers", () => {
  const e = estimateMeal("today i had chicken and rice");
  assert.equal(e.items.length, 2);
  assert.ok(names("today i had chicken and rice").some((n) => n.includes("chicken")));
  assert.ok(names("today i had chicken and rice").some((n) => n.includes("rice")));
  assert.ok(e.total.kcal > 300, `only ${e.total.kcal} kcal`);
  assert.ok(e.total.protein > 30, `only ${e.total.protein}g protein`);
});

test("filler words are not mistaken for foods", () => {
  const e = estimateMeal("today i had chicken and rice");
  assert.deepEqual(e.unmatched, []);
  assert.equal(estimateMeal("i had some lunch").items.length, 0);
});

// --- quantities --------------------------------------------------------------

test("a stated weight is used as given", () => {
  const e = estimateMeal("200g chicken");
  assert.equal(e.items[0].qty, 200);
  assert.equal(e.items[0].explicit, true);
});

test("kg and litres are converted", () => {
  assert.equal(estimateMeal("0.3kg chicken").items[0].qty, 300);
  assert.equal(estimateMeal("1l milk").items[0].qty, 1000);
});

test("plain everyday words are recognised, not just qualified ones", () => {
  // "milk" alone matched nothing, because the shared keyword list only carried
  // "cow milk" / "dairy milk" — deliberate for dislike detection, wrong here.
  const e = estimateMeal("milk");
  assert.equal(e.items.length, 1, "plain milk should be recognised");
  assert.match(e.items[0].name.toLowerCase(), /milk/);
});

test("a qualified name still beats the bare one", () => {
  // Adding bare "milk" must not make "soy milk" resolve to dairy.
  const e = estimateMeal("300ml soy milk");
  assert.equal(e.items.length, 1);
  assert.equal(e.items[0].foodId, "soy_milk", `got ${e.items[0].foodId}`);
});

test("a missing portion is assumed, and flagged as assumed", () => {
  const e = estimateMeal("chicken");
  assert.ok(e.items[0].qty > 0);
  assert.equal(e.items[0].explicit, false, "an assumed portion must not look like a stated one");
});

test("counted foods count, weighed foods scale by serving", () => {
  // "two eggs" is two eggs...
  assert.equal(estimateMeal("two eggs").items[0].qty, 2);
  // ...but "2 chicken" is two portions, not two grams.
  assert.ok(estimateMeal("2 chicken").items[0].qty > 100);
});

test("size words move the portion", () => {
  const small = estimateMeal("small portion of rice").items[0].qty;
  const normal = estimateMeal("rice").items[0].qty;
  const large = estimateMeal("large rice").items[0].qty;
  assert.ok(small < normal && normal < large, `${small} / ${normal} / ${large}`);
});

// --- matching ----------------------------------------------------------------

test("the longest name wins so sweet potato isn't potato", () => {
  const e = estimateMeal("sweet potato");
  assert.match(e.items[0].name.toLowerCase(), /sweet potato/);
});

test("a food is not counted twice", () => {
  const e = estimateMeal("chicken, chicken and rice");
  assert.equal(e.items.filter((i) => i.name.toLowerCase().includes("chicken")).length, 1);
});

test("things we don't know are reported, not silently dropped", () => {
  const e = estimateMeal("chicken and a katsu curry sauce");
  assert.ok(e.items.some((i) => i.name.toLowerCase().includes("chicken")));
  assert.ok(e.unmatched.length > 0, "unknown food should be surfaced");
  assert.ok(e.unmatched.join(" ").includes("katsu"));
});

test("empty input is safe", () => {
  for (const v of ["", " ", "a"]) {
    const e = estimateMeal(v);
    assert.equal(e.items.length, 0);
    assert.equal(e.total.kcal, 0);
  }
});

test("macros are whole numbers", () => {
  for (const it of estimateMeal("200g chicken, 90g rice, two eggs").items) {
    for (const v of Object.values(it.macros)) assert.equal(v, Math.round(v), `${it.name} has fractional macros`);
  }
});

test("the total is the sum of the items", () => {
  const e = estimateMeal("200g chicken, 90g rice, broccoli");
  const summed = e.items.reduce((n, i) => n + i.macros.kcal, 0);
  assert.ok(Math.abs(summed - e.total.kcal) <= 1, `${summed} vs ${e.total.kcal}`);
});

// --- AI responses ------------------------------------------------------------

test("AI items fold into the same shape", () => {
  const e = fromAiItems([
    { name: "Katsu curry", qty: 350, unit: "g", kcal: 620, protein: 30, carbs: 70, fats: 22 },
    { name: "Rice", qty: 90, unit: "g", kcal: 320, protein: 7, carbs: 70, fats: 1 },
  ]);
  assert.equal(e.items.length, 2);
  assert.equal(e.total.kcal, 940);
  assert.equal(e.total.protein, 37);
});

test("zero-calorie AI items are dropped as parse failures", () => {
  const e = fromAiItems([
    { name: "Mystery", qty: 100, unit: "g", kcal: 0, protein: 0, carbs: 0, fats: 0 },
    { name: "Chicken", qty: 150, unit: "g", kcal: 250, protein: 45, carbs: 0, fats: 6 },
  ]);
  assert.equal(e.items.length, 1);
  assert.equal(e.items[0].name, "Chicken");
});

test("malformed AI payloads don't throw", () => {
  assert.equal(fromAiItems([]).items.length, 0);
  assert.equal(fromAiItems([{}]).items.length, 0);
  assert.equal(fromAiItems([{ name: "  " }]).items.length, 0);
});

// --- Meal photos -------------------------------------------------------------

test("fitDimensions caps the longest edge and keeps the aspect ratio", () => {
  const landscape = fitDimensions(4000, 3000, 768);
  assert.equal(landscape.width, 768);
  assert.equal(landscape.height, 576); // 4:3 preserved
  const portrait = fitDimensions(3000, 4000, 768);
  assert.equal(portrait.width, 576);
  assert.equal(portrait.height, 768);
});

test("fitDimensions never scales a small photo up", () => {
  assert.deepEqual(fitDimensions(320, 240, 768), { width: 320, height: 240 });
  // Exactly at the cap is left alone too.
  assert.deepEqual(fitDimensions(768, 768, 768), { width: 768, height: 768 });
});

test("fitDimensions survives degenerate input", () => {
  assert.deepEqual(fitDimensions(0, 0), { width: 0, height: 0 });
  assert.deepEqual(fitDimensions(NaN, 100), { width: 0, height: 0 });
  // A panorama must not round its short edge to a canvas of zero height.
  assert.ok(fitDimensions(10000, 3, 768).height >= 1);
});

// --- Correcting an estimate --------------------------------------------------

test("scaleItem moves the macros with the portion", () => {
  const item = { foodId: null, name: "Rice", qty: 200, unit: "g" as const, explicit: false,
    macros: { kcal: 260, protein: 6, carbs: 56, fats: 1 } };
  const half = scaleItem(item, 100);
  assert.equal(half.qty, 100);
  assert.equal(half.macros.kcal, 130);
  assert.equal(half.macros.carbs, 28);
  const double = scaleItem(item, 400);
  assert.equal(double.macros.kcal, 520);
});

test("a corrected portion is no longer an assumption", () => {
  // Otherwise the row keeps saying "(assumed)" about a number the athlete
  // just typed in themselves.
  const item = { foodId: null, name: "Rice", qty: 200, unit: "g" as const, explicit: false,
    macros: { kcal: 260, protein: 6, carbs: 56, fats: 1 } };
  assert.equal(scaleItem(item, 150).explicit, true);
});

test("scaleItem survives zero and nonsense quantities", () => {
  const item = { foodId: null, name: "Rice", qty: 200, unit: "g" as const, explicit: true,
    macros: { kcal: 260, protein: 6, carbs: 56, fats: 1 } };
  assert.equal(scaleItem(item, 0).macros.kcal, 0);
  assert.equal(scaleItem(item, -50).qty, 0);
  // A corrupt source item must not divide by zero.
  const broken = { ...item, qty: 0 };
  assert.ok(Number.isFinite(scaleItem(broken, 100).macros.kcal));
});

test("totalOf keeps the headline honest after an edit", () => {
  const items = [
    { foodId: null, name: "Rice", qty: 200, unit: "g" as const, explicit: true, macros: { kcal: 260, protein: 6, carbs: 56, fats: 1 } },
    { foodId: null, name: "Chicken", qty: 150, unit: "g" as const, explicit: true, macros: { kcal: 250, protein: 46, carbs: 0, fats: 6 } },
  ];
  assert.deepEqual(totalOf(items), { kcal: 510, protein: 52, carbs: 56, fats: 7 });
  // Remove one and the total must follow.
  assert.equal(totalOf(items.slice(1)).kcal, 250);
  assert.deepEqual(totalOf([]), { kcal: 0, protein: 0, carbs: 0, fats: 0 });
});

test("a wildly wrong kcal is corrected from the macros", () => {
  // The two come from the same answer and are meant to agree. When one is
  // wrong it is almost always the kcal — it is written first and least
  // carefully — so 30p/60c/20f is 540 kcal whatever the model then claimed.
  const [item] = fromAiItems([
    { name: "Chicken and rice", qty: 400, unit: "g", kcal: 250, protein: 30, carbs: 60, fats: 20 },
  ]).items;
  assert.equal(item.macros.kcal, 540);
});

test("ordinary rounding slack is left alone", () => {
  // Fibre and sugar alcohols mean real food data never adds up exactly, and
  // "correcting" a 5% gap would replace a good number with a derived one.
  const [item] = fromAiItems([
    { name: "Porridge", qty: 90, unit: "g", kcal: 350, protein: 12, carbs: 60, fats: 7 },
  ]).items;
  assert.equal(item.macros.kcal, 350); // macros say 351 — close enough to keep
});

test("an item with no macros keeps its stated calories", () => {
  // Nothing to reconcile against; deriving 0 kcal would silently drop the food
  // out of the day's total.
  const [item] = fromAiItems([{ name: "Cola", qty: 330, unit: "ml", kcal: 139 }]).items;
  assert.equal(item.macros.kcal, 139);
});

test("negative macros can't drag a total downwards", () => {
  const [item] = fromAiItems([
    { name: "Odd", qty: 100, unit: "g", kcal: 200, protein: -5, carbs: 40, fats: 5 },
  ]).items;
  assert.ok(item.macros.protein >= 0);
  assert.ok(item.macros.kcal > 0);
});

test("a quantity of zero can never reach scaleItem", () => {
  /**
   * REPORTED AS: "it doesn't let you delete the 0 so you can increase the
   * amount of grams and it breaks."
   *
   * Two faults, the second caused by the first. The input was
   * `value={it.qty}` with `Number(e.target.value)`, so clearing the box gave
   * `Number("") === 0` and the field re-rendered as "0" instantly — it could
   * never be emptied to type a new number.
   *
   * That 0 then reached scaleItem, which scales RELATIVE to the current
   * quantity. It multiplied every macro by zero and destroyed the reference
   * the next edit scales from, so typing 150 afterwards gave 150 x 0. The item
   * was stuck at zero calories with no way back.
   *
   * This pins the destructive half. The UI half — holding the text as a string
   * so "" is legal mid-edit — lives in MealCheckIn and is not reachable from
   * here; the guard in setQty is the backstop that makes it impossible rather
   * than merely unlikely.
   */
  const rice: EstimatedItem = {
    foodId: "rice", name: "Rice (dry)", qty: 75, unit: "g", explicit: true,
    macros: { kcal: 260, protein: 5, carbs: 58, fats: 1 },
  };

  // What the old code did, kept as the thing we must never go back to.
  const wiped = scaleItem(rice, 0);
  assert.equal(wiped.macros.kcal, 0, "scaleItem(_, 0) really does zero the macros");
  assert.equal(scaleItem(wiped, 150).macros.kcal, 0,
    "and the zero is unrecoverable — this is why 0 must be refused before it gets here");

  // Doubling the quantity doubles the food, which is the whole point.
  const doubled = scaleItem(rice, 150);
  assert.equal(doubled.qty, 150);
  assert.equal(doubled.macros.kcal, 520);
  assert.equal(doubled.macros.protein, 10);
});
