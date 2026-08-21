// =============================================================================
// UK supermarket food database — macros plus typical pack sizes and prices.
//
// Tesco and Sainsbury's do not expose a public grocery API (Tesco retired
// theirs; Sainsbury's never had one), and scraping their storefronts from a
// browser is both CORS-blocked and against their terms. So prices here are a
// maintained estimate of typical UK supermarket pricing, not a live feed —
// every surface that shows a cost must say so. `SUPERMARKETS` provides search
// deep links instead, which need no API and never go stale.
//
// Prices last reviewed: July 2026. Pure data — safe on the static site.
// =============================================================================

export type Aisle =
  | "Meat & fish" | "Dairy & eggs" | "Fruit & veg" | "Bakery"
  | "Cupboard" | "Frozen" | "Drinks";

export interface Food {
  id: string;
  name: string;
  aisle: Aisle;
  // Macros per 100g (or per unit where unit === "each").
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  unit: "g" | "ml" | "each";
  packSize: number;   // grams / ml / count in one pack
  packPrice: number;  // £ for that pack
  packLabel: string;  // how it appears on the shelf
  // Canonical product page, when we have a verified one. Product IDs can only
  // come from a real lookup — inventing them would 404 or, worse, land the
  // athlete on the wrong item — so this stays empty until a URL is confirmed,
  // and we fall back to a tightly-scoped search.
  productUrls?: Partial<Record<StoreId, string>>;
  tags?: FoodTag[];
  budget?: "value" | "normal" | "premium"; // rough cost tier per serving
  /**
   * Survives the week, so the unused part of the pack is not waste.
   *
   * THIS IS A PRICING FACT, NOT A SHELF-LIFE TRIVIA FIELD. Everything here was
   * costed at whole packs — buy the 500ml bottle of oil, pay £3.50 — which is
   * right at the till and wrong twice over afterwards.
   *
   * It overstated the weekly shop by 40%: £45.80 of a £113.55 week was charged
   * to food nobody eats, most of it a bottle of olive oil re-bought every seven
   * days to use 165ml of it.
   *
   * And it distorted the MENU, which is worse. `marginalCost` charges the first
   * meal that needs a pinch of spice the full £3.00 for three jars, against a
   * variety budget of £3 and a favourite bonus of £5 — so the planner quietly
   * avoided whichever dish opened a cupboard item, which is to say it avoided
   * flavour. The flavour shelf at the top of this file was added because every
   * dinner read as "protein + starch + veg"; the pricing was undoing it.
   *
   * Set where the REMAINDER genuinely carries to next week: dry and preserved
   * goods that survive opening, frozen bags, whole tins left in a multi-tin
   * pack, and root veg. Deliberately NOT set for things that spoil once opened
   * — passata, coconut milk, an opened tin of sweetcorn — nor for fresh meat,
   * fish, bread or soft dairy. When it is a judgement call it is left off,
   * because overstating a shopping bill is the safer way to be wrong.
   */
  keeps?: boolean;
}

export type StoreId = "tesco" | "sainsburys" | "asda" | "aldi";

// What's in a food, for diet and allergy filtering. A meal inherits the union
// of its ingredients' tags.
// `honey` sits with the animal products, not the allergens, because that is
// what it is. It is not offered as an avoidance in the UI — nobody ticks "no
// honey" — but the vegan pattern has to exclude it, and before it was tagged
// the planner was putting honey in six vegan meals and honey on the vegan
// shopping list. A vegan athlete reading their own plan would have known
// immediately that nobody had checked it.
export type FoodTag =
  | "meat" | "pork" | "fish" | "dairy" | "egg" | "honey"
  | "gluten" | "nuts" | "soy";

export const FOODS: Food[] = [
  // ===========================================================================
  // THE FLAVOUR SHELF.
  //
  // The database was 38 foods and none of them was garlic. That is not a small
  // omission — it is why every dinner in the planner read as "protein + starch
  // + veg" with the protein swapped: chicken and rice, beef and pasta, turkey
  // and sweet potato. There was literally nothing in the cupboard to make a
  // dish taste of anywhere.
  //
  // Aromatics and spices carry almost no macros, which is exactly why they were
  // missed by a database built protein-first. They decide whether someone cooks
  // the plan twice. They also have to appear on the shopping list, or the
  // recipe asks for something the athlete was never told to buy.
  //
  // Pack prices are the same maintained UK estimate as everything else here,
  // reviewed July 2026.
  // ===========================================================================

  // --- Aromatics and spice -------------------------------------------------
  { id: "garlic", name: "Garlic", aisle: "Fruit & veg", kcal: 149, protein: 6.4, carbs: 33, fats: 0.5, unit: "g", packSize: 150, packPrice: 0.85, packLabel: "3 bulbs", budget: "value", keeps: true },
  { id: "ginger", name: "Root ginger", aisle: "Fruit & veg", kcal: 80, protein: 1.8, carbs: 18, fats: 0.8, unit: "g", packSize: 150, packPrice: 0.90, packLabel: "150g", budget: "value", keeps: true },
  { id: "chilli_fresh", name: "Red chillies", aisle: "Fruit & veg", kcal: 40, protein: 1.9, carbs: 9, fats: 0.4, unit: "g", packSize: 60, packPrice: 0.75, packLabel: "60g pack", budget: "value" },
  { id: "spice_mix", name: "Ground spices (cumin, paprika, turmeric)", aisle: "Cupboard", kcal: 300, protein: 14, carbs: 45, fats: 12, unit: "g", packSize: 150, packPrice: 3.00, packLabel: "3 jars", budget: "value", keeps: true },
  { id: "curry_paste", name: "Curry paste", aisle: "Cupboard", kcal: 180, protein: 3, carbs: 12, fats: 13, unit: "g", packSize: 180, packPrice: 1.60, packLabel: "180g jar", keeps: true },
  { id: "soy_sauce", name: "Soy sauce", aisle: "Cupboard", kcal: 66, protein: 8, carbs: 6, fats: 0.1, unit: "ml", packSize: 250, packPrice: 1.50, packLabel: "250ml", tags: ["soy", "gluten"], keeps: true },
  { id: "stock_cubes", name: "Stock cubes", aisle: "Cupboard", kcal: 240, protein: 10, carbs: 25, fats: 12, unit: "g", packSize: 120, packPrice: 1.20, packLabel: "12 cubes", budget: "value", keeps: true },
  { id: "lemon", name: "Lemons", aisle: "Fruit & veg", kcal: 29, protein: 1.1, carbs: 9, fats: 0.3, unit: "each", packSize: 4, packPrice: 1.10, packLabel: "4 pack", budget: "value", keeps: true },
  { id: "honey", name: "Honey", aisle: "Cupboard", kcal: 304, protein: 0.3, carbs: 82, fats: 0, unit: "g", packSize: 340, packPrice: 2.20, packLabel: "340g jar", tags: ["honey"], keeps: true },
  // The vegan swap for honey, and the reason tagging honey didn't cost the
  // vegan pool six meals — those recipes take maple instead and cook the same.
  { id: "maple_syrup", name: "Maple syrup", aisle: "Cupboard", kcal: 260, protein: 0, carbs: 67, fats: 0.1, unit: "g", packSize: 250, packPrice: 3.20, packLabel: "250ml bottle", keeps: true },
  { id: "pesto", name: "Green pesto", aisle: "Cupboard", kcal: 430, protein: 5, carbs: 6, fats: 43, unit: "g", packSize: 190, packPrice: 1.80, packLabel: "190g jar", tags: ["dairy", "nuts"], keeps: true },
  { id: "coconut_milk", name: "Coconut milk", aisle: "Cupboard", kcal: 169, protein: 1.6, carbs: 3, fats: 17, unit: "ml", packSize: 400, packPrice: 1.20, packLabel: "400ml tin" },
  { id: "passata", name: "Passata", aisle: "Cupboard", kcal: 32, protein: 1.4, carbs: 6, fats: 0.2, unit: "g", packSize: 500, packPrice: 0.85, packLabel: "500g carton", budget: "value" },
  { id: "hummus", name: "Hummus", aisle: "Dairy & eggs", kcal: 290, protein: 7.5, carbs: 12, fats: 23, unit: "g", packSize: 200, packPrice: 1.30, packLabel: "200g tub" },

  // --- Vegetables that do something ----------------------------------------
  { id: "peppers", name: "Mixed peppers", aisle: "Fruit & veg", kcal: 30, protein: 1, carbs: 6, fats: 0.3, unit: "g", packSize: 500, packPrice: 1.90, packLabel: "3 pack" },
  { id: "mushrooms", name: "Chestnut mushrooms", aisle: "Fruit & veg", kcal: 22, protein: 3.1, carbs: 0.4, fats: 0.5, unit: "g", packSize: 250, packPrice: 1.10, packLabel: "250g pack", budget: "value" },
  { id: "courgette", name: "Courgettes", aisle: "Fruit & veg", kcal: 17, protein: 1.2, carbs: 3, fats: 0.3, unit: "g", packSize: 400, packPrice: 1.20, packLabel: "2 pack", budget: "value" },
  { id: "carrots", name: "Carrots", aisle: "Fruit & veg", kcal: 41, protein: 0.9, carbs: 9, fats: 0.2, unit: "g", packSize: 1000, packPrice: 0.70, packLabel: "1kg bag", budget: "value", keeps: true },
  { id: "sweetcorn", name: "Sweetcorn", aisle: "Cupboard", kcal: 86, protein: 3.2, carbs: 19, fats: 1.2, unit: "g", packSize: 340, packPrice: 0.75, packLabel: "340g tin", budget: "value" },
  { id: "peas_frozen", name: "Frozen peas", aisle: "Frozen", kcal: 81, protein: 5.4, carbs: 14, fats: 0.4, unit: "g", packSize: 900, packPrice: 1.40, packLabel: "900g bag", budget: "value", keeps: true },
  { id: "cucumber", name: "Cucumber", aisle: "Fruit & veg", kcal: 15, protein: 0.7, carbs: 3.6, fats: 0.1, unit: "g", packSize: 300, packPrice: 0.85, packLabel: "1 cucumber", budget: "value" },
  { id: "avocado", name: "Avocado", aisle: "Fruit & veg", kcal: 160, protein: 2, carbs: 9, fats: 15, unit: "each", packSize: 2, packPrice: 1.70, packLabel: "2 pack" },
  { id: "tomatoes_fresh", name: "Cherry tomatoes", aisle: "Fruit & veg", kcal: 18, protein: 0.9, carbs: 3.9, fats: 0.2, unit: "g", packSize: 330, packPrice: 1.10, packLabel: "330g punnet" },

  // --- Protein with a personality ------------------------------------------
  { id: "feta", name: "Feta", aisle: "Dairy & eggs", kcal: 264, protein: 14, carbs: 1.5, fats: 22, unit: "g", packSize: 200, packPrice: 2.00, packLabel: "200g block", tags: ["dairy"] },
  { id: "halloumi", name: "Halloumi", aisle: "Dairy & eggs", kcal: 321, protein: 22, carbs: 2.6, fats: 25, unit: "g", packSize: 225, packPrice: 2.50, packLabel: "225g block", tags: ["dairy"] },
  { id: "cottage_cheese", name: "Cottage cheese", aisle: "Dairy & eggs", kcal: 78, protein: 11, carbs: 4, fats: 2, unit: "g", packSize: 300, packPrice: 1.30, packLabel: "300g tub", tags: ["dairy"] },
  { id: "prawns", name: "Cooked king prawns", aisle: "Meat & fish", kcal: 76, protein: 17, carbs: 0.5, fats: 0.6, unit: "g", packSize: 180, packPrice: 3.25, packLabel: "180g pack", tags: ["fish"] },
  { id: "edamame", name: "Frozen edamame", aisle: "Frozen", kcal: 121, protein: 12, carbs: 8, fats: 5, unit: "g", packSize: 500, packPrice: 2.40, packLabel: "500g bag", tags: ["soy"], keeps: true },

  // --- Carbs beyond rice and pasta -----------------------------------------
  { id: "noodles", name: "Egg noodles", aisle: "Cupboard", kcal: 356, protein: 12, carbs: 71, fats: 2.5, unit: "g", packSize: 375, packPrice: 1.20, packLabel: "375g pack", tags: ["gluten", "egg"], keeps: true },
  { id: "couscous", name: "Couscous", aisle: "Cupboard", kcal: 358, protein: 12, carbs: 72, fats: 0.6, unit: "g", packSize: 500, packPrice: 1.10, packLabel: "500g box", tags: ["gluten"], budget: "value", keeps: true },
  { id: "pitta", name: "Wholemeal pittas", aisle: "Bakery", kcal: 253, protein: 9, carbs: 47, fats: 1.5, unit: "g", packSize: 300, packPrice: 0.90, packLabel: "6 pack", tags: ["gluten"], budget: "value" },

  // --- Meat & fish ---------------------------------------------------------
  { id: "chicken_breast", name: "Chicken breast fillets", aisle: "Meat & fish", kcal: 106, protein: 24, carbs: 0, fats: 1.1, unit: "g", packSize: 650, packPrice: 5.50, packLabel: "650g pack" , tags: ["meat"] },
  { id: "beef_mince_5", name: "Beef mince (5% fat)", aisle: "Meat & fish", kcal: 136, protein: 21, carbs: 0, fats: 5, unit: "g", packSize: 500, packPrice: 4.75, packLabel: "500g pack" , tags: ["meat"] },
  { id: "salmon_fillet", name: "Salmon fillets", aisle: "Meat & fish", kcal: 208, protein: 20, carbs: 0, fats: 13, unit: "g", packSize: 240, packPrice: 4.50, packLabel: "2 fillets, 240g" , tags: ["fish"] },
  { id: "tuna_tin", name: "Tuna chunks in spring water", aisle: "Cupboard", kcal: 108, protein: 25, carbs: 0, fats: 0.6, unit: "g", packSize: 400, packPrice: 3.50, packLabel: "4 x 100g tins" , tags: ["fish"], keeps: true },
  { id: "turkey_mince", name: "Turkey breast mince", aisle: "Meat & fish", kcal: 105, protein: 24, carbs: 0, fats: 1, unit: "g", packSize: 500, packPrice: 4.25, packLabel: "500g pack" , tags: ["meat"] },

  // --- Dairy & eggs --------------------------------------------------------
  { id: "eggs", name: "Free range eggs", aisle: "Dairy & eggs", kcal: 74, protein: 6.4, carbs: 0.4, fats: 5.1, unit: "each", packSize: 12, packPrice: 3.20, packLabel: "12 pack" , tags: ["egg"], keeps: true },
  { id: "greek_yoghurt", name: "Greek style yoghurt (0% fat)", aisle: "Dairy & eggs", kcal: 57, protein: 10, carbs: 4, fats: 0.2, unit: "g", packSize: 1000, packPrice: 2.50, packLabel: "1kg tub" , tags: ["dairy"] },
  { id: "milk", name: "Semi-skimmed milk", aisle: "Dairy & eggs", kcal: 50, protein: 3.6, carbs: 4.8, fats: 1.8, unit: "ml", packSize: 2272, packPrice: 1.65, packLabel: "4 pint bottle" , tags: ["dairy"] },
  { id: "cheddar", name: "Mature cheddar", aisle: "Dairy & eggs", kcal: 416, protein: 25, carbs: 0.1, fats: 35, unit: "g", packSize: 400, packPrice: 3.75, packLabel: "400g block" , tags: ["dairy"], keeps: true },

  // --- Carbs / cupboard ----------------------------------------------------
  { id: "oats", name: "Porridge oats", aisle: "Cupboard", kcal: 379, protein: 11, carbs: 60, fats: 8, unit: "g", packSize: 1000, packPrice: 1.60, packLabel: "1kg bag" , tags: ["gluten"], keeps: true },
  { id: "rice", name: "Basmati rice", aisle: "Cupboard", kcal: 349, protein: 8, carbs: 78, fats: 1, unit: "g", packSize: 1000, packPrice: 2.20, packLabel: "1kg bag", keeps: true },
  { id: "pasta", name: "Wholewheat pasta", aisle: "Cupboard", kcal: 348, protein: 13, carbs: 63, fats: 2.5, unit: "g", packSize: 500, packPrice: 1.10, packLabel: "500g bag" , tags: ["gluten"], keeps: true },
  { id: "potatoes", name: "White potatoes", aisle: "Fruit & veg", kcal: 79, protein: 2, carbs: 17, fats: 0.2, unit: "g", packSize: 2500, packPrice: 2.15, packLabel: "2.5kg bag", keeps: true },
  { id: "sweet_potato", name: "Sweet potatoes", aisle: "Fruit & veg", kcal: 86, protein: 1.6, carbs: 20, fats: 0.1, unit: "g", packSize: 1000, packPrice: 1.50, packLabel: "1kg" },
  { id: "wholemeal_bread", name: "Wholemeal bread", aisle: "Bakery", kcal: 235, protein: 9.5, carbs: 41, fats: 2, unit: "g", packSize: 800, packPrice: 1.40, packLabel: "800g loaf" , tags: ["gluten"] },
  { id: "tortilla_wrap", name: "Wholemeal wraps", aisle: "Bakery", kcal: 290, protein: 9, carbs: 47, fats: 6.5, unit: "each", packSize: 8, packPrice: 1.50, packLabel: "8 pack" , tags: ["gluten"] },

  // --- Fruit & veg ---------------------------------------------------------
  { id: "banana", name: "Bananas", aisle: "Fruit & veg", kcal: 95, protein: 1.2, carbs: 23, fats: 0.3, unit: "each", packSize: 6, packPrice: 1.05, packLabel: "6 pack" },
  { id: "berries_frozen", name: "Frozen mixed berries", aisle: "Frozen", kcal: 45, protein: 1, carbs: 8, fats: 0.3, unit: "g", packSize: 500, packPrice: 2.50, packLabel: "500g bag", keeps: true },
  { id: "broccoli", name: "Broccoli", aisle: "Fruit & veg", kcal: 34, protein: 2.8, carbs: 4, fats: 0.4, unit: "g", packSize: 350, packPrice: 0.75, packLabel: "350g head" },
  { id: "mixed_veg_frozen", name: "Frozen mixed vegetables", aisle: "Frozen", kcal: 42, protein: 2.6, carbs: 6, fats: 0.5, unit: "g", packSize: 1000, packPrice: 1.50, packLabel: "1kg bag", keeps: true },
  { id: "spinach", name: "Baby spinach", aisle: "Fruit & veg", kcal: 25, protein: 2.9, carbs: 1.6, fats: 0.4, unit: "g", packSize: 240, packPrice: 1.40, packLabel: "240g bag" },
  { id: "apple", name: "Apples", aisle: "Fruit & veg", kcal: 78, protein: 0.4, carbs: 19, fats: 0.2, unit: "each", packSize: 6, packPrice: 1.75, packLabel: "6 pack", keeps: true },
  { id: "onion", name: "Onions", aisle: "Fruit & veg", kcal: 40, protein: 1.1, carbs: 9, fats: 0.1, unit: "g", packSize: 1000, packPrice: 1.05, packLabel: "1kg bag", keeps: true },
  { id: "tomatoes_tin", name: "Chopped tomatoes", aisle: "Cupboard", kcal: 22, protein: 1.2, carbs: 3.5, fats: 0.2, unit: "g", packSize: 1600, packPrice: 1.80, packLabel: "4 x 400g tins", keeps: true },

  // --- Fats & extras -------------------------------------------------------
  { id: "olive_oil", name: "Olive oil", aisle: "Cupboard", kcal: 899, protein: 0, carbs: 0, fats: 100, unit: "ml", packSize: 500, packPrice: 3.50, packLabel: "500ml bottle", keeps: true },
  { id: "peanut_butter", name: "Peanut butter", aisle: "Cupboard", kcal: 588, protein: 25, carbs: 12, fats: 50, unit: "g", packSize: 340, packPrice: 2.40, packLabel: "340g jar" , tags: ["nuts"], keeps: true },
  { id: "almonds", name: "Almonds", aisle: "Cupboard", kcal: 613, protein: 21, carbs: 7, fats: 53, unit: "g", packSize: 200, packPrice: 2.75, packLabel: "200g bag" , tags: ["nuts"], keeps: true },
  { id: "whey_protein", name: "Whey protein powder", aisle: "Cupboard", kcal: 380, protein: 78, carbs: 6, fats: 5, unit: "g", packSize: 1000, packPrice: 22.00, packLabel: "1kg tub" , tags: ["dairy"], keeps: true },
  { id: "beans_baked", name: "Baked beans", aisle: "Cupboard", kcal: 78, protein: 4.7, carbs: 13, fats: 0.2, unit: "g", packSize: 1600, packPrice: 2.60, packLabel: "4 x 400g tins", keeps: true },
  { id: "chickpeas", name: "Chickpeas", aisle: "Cupboard", kcal: 115, protein: 7, carbs: 16, fats: 2.1, unit: "g", packSize: 800, packPrice: 1.40, packLabel: "2 x 400g tins", keeps: true },

  // --- Plant proteins & swaps ----------------------------------------------
  { id: "tofu", name: "Firm tofu", aisle: "Cupboard", kcal: 144, protein: 15, carbs: 2, fats: 9, unit: "g", packSize: 396, packPrice: 2.00, packLabel: "396g block", tags: ["soy"] },
  { id: "red_lentils", name: "Red lentils", aisle: "Cupboard", kcal: 353, protein: 25, carbs: 60, fats: 1, unit: "g", packSize: 500, packPrice: 1.30, packLabel: "500g bag", keeps: true },
  { id: "black_beans", name: "Black beans", aisle: "Cupboard", kcal: 114, protein: 7, carbs: 16, fats: 0.5, unit: "g", packSize: 800, packPrice: 1.50, packLabel: "2 x 400g tins", keeps: true },
  { id: "soy_milk", name: "Soya milk (unsweetened)", aisle: "Dairy & eggs", kcal: 33, protein: 3.3, carbs: 0.6, fats: 1.8, unit: "ml", packSize: 1000, packPrice: 1.35, packLabel: "1L carton", tags: ["soy"] },
  { id: "pea_protein", name: "Pea protein powder", aisle: "Cupboard", kcal: 375, protein: 80, carbs: 3, fats: 5, unit: "g", packSize: 1000, packPrice: 20.00, packLabel: "1kg tub", keeps: true },
  { id: "quinoa", name: "Quinoa", aisle: "Cupboard", kcal: 368, protein: 14, carbs: 64, fats: 6, unit: "g", packSize: 500, packPrice: 2.80, packLabel: "500g bag", keeps: true },
  { id: "coconut_yoghurt", name: "Coconut yoghurt", aisle: "Dairy & eggs", kcal: 130, protein: 1.5, carbs: 6, fats: 11, unit: "g", packSize: 350, packPrice: 2.20, packLabel: "350g tub" },
  { id: "seeds_mixed", name: "Mixed seeds", aisle: "Cupboard", kcal: 570, protein: 20, carbs: 12, fats: 48, unit: "g", packSize: 250, packPrice: 2.00, packLabel: "250g bag", keeps: true },

  // ===========================================================================
  // WHAT THE RECIPE BOOK KEPT RUNNING OUT OF.
  //
  // "A lot of people didn't like the recipes." Counting what the book could
  // actually be built from says why, and every one of these exists to unlock
  // dishes rather than to pad a table:
  //
  // NO PLANT MILK THAT ISN'T SOYA. `soy_milk` was the only one, so a vegan who
  // avoids soy had no milk at all — no porridge, no overnight oats, no shake,
  // no smoothie. Their breakfast pool was NINE. Oat and almond between them
  // reopen the whole slot, and almond is the one that is also gluten-free.
  //
  // NO GLUTEN-FREE NOODLE, PASTA OR WRAP. Every long carb in the book was
  // wheat: pasta, couscous, egg noodles, pittas, wraps, bread. A gluten-free
  // athlete had rice, potatoes and quinoa, which is why their lunches came out
  // at 26 against an omnivore's 51. Rice noodles and corn tortillas are the two
  // that carry the most dishes each.
  //
  // TICKING "NO PORK" DID NOTHING, because there was no pork in the database.
  // An avoidance in the UI that excludes zero meals is a promise the app was
  // not keeping.
  //
  // ONLY FIVE ANIMAL PROTEINS, three of them premium. The plan is now asked to
  // keep meat and fish on an omnivore's menu (see SOURCE_WEEKLY_BUDGET in
  // meal-plan.ts) and there were 24 meat dishes and 20 fish ones to do it from,
  // so it ran into the repeat cap rather than the budget. Cod, mackerel,
  // sardines, thighs and bacon are also the CHEAP end of animal protein, which
  // the old table had none of — salmon and chicken breast are what made "eat
  // meat" and "eat cheaply" mutually exclusive.
  //
  // Same maintained UK pricing as everything above, reviewed July 2026.
  // ===========================================================================

  // --- Plant milks that aren't soya ----------------------------------------
  { id: "oat_milk", name: "Oat milk", aisle: "Dairy & eggs", kcal: 45, protein: 1, carbs: 6.7, fats: 1.5, unit: "ml", packSize: 1000, packPrice: 1.20, packLabel: "1L carton", tags: ["gluten"], budget: "value" },
  { id: "almond_milk", name: "Almond milk (unsweetened)", aisle: "Dairy & eggs", kcal: 24, protein: 0.5, carbs: 0.1, fats: 1.1, unit: "ml", packSize: 1000, packPrice: 1.40, packLabel: "1L carton", tags: ["nuts"] },

  // --- Carbs without wheat --------------------------------------------------
  { id: "rice_noodles", name: "Rice noodles", aisle: "Cupboard", kcal: 364, protein: 6, carbs: 82, fats: 0.6, unit: "g", packSize: 250, packPrice: 1.50, packLabel: "250g pack", budget: "value", keeps: true },
  { id: "corn_tortilla", name: "Corn tortillas", aisle: "Bakery", kcal: 45, protein: 1.2, carbs: 9.5, fats: 0.6, unit: "each", packSize: 8, packPrice: 1.80, packLabel: "8 pack", keeps: true },
  { id: "rice_cakes", name: "Rice cakes", aisle: "Cupboard", kcal: 380, protein: 8, carbs: 81, fats: 3, unit: "g", packSize: 130, packPrice: 0.90, packLabel: "14 cakes", budget: "value", keeps: true },
  { id: "oatcakes", name: "Oatcakes", aisle: "Cupboard", kcal: 430, protein: 10, carbs: 60, fats: 16, unit: "g", packSize: 300, packPrice: 1.20, packLabel: "300g pack", tags: ["gluten"], budget: "value", keeps: true },

  // --- Cheap animal protein -------------------------------------------------
  { id: "white_fish", name: "Frozen cod loins", aisle: "Frozen", kcal: 82, protein: 18, carbs: 0, fats: 0.7, unit: "g", packSize: 480, packPrice: 5.50, packLabel: "4 loins, 480g", tags: ["fish"], keeps: true },
  { id: "mackerel_tin", name: "Mackerel fillets in tomato", aisle: "Cupboard", kcal: 200, protein: 19, carbs: 2, fats: 13, unit: "g", packSize: 250, packPrice: 2.40, packLabel: "2 x 125g tins", tags: ["fish"], budget: "value", keeps: true },
  { id: "sardines_tin", name: "Sardines in olive oil", aisle: "Cupboard", kcal: 195, protein: 21, carbs: 0, fats: 12, unit: "g", packSize: 240, packPrice: 1.60, packLabel: "2 x 120g tins", tags: ["fish"], budget: "value", keeps: true },
  { id: "chicken_thigh", name: "Chicken thigh fillets", aisle: "Meat & fish", kcal: 146, protein: 20, carbs: 0, fats: 7.3, unit: "g", packSize: 640, packPrice: 4.75, packLabel: "640g pack", tags: ["meat"], budget: "value" },
  { id: "bacon_medallions", name: "Bacon medallions", aisle: "Meat & fish", kcal: 130, protein: 23, carbs: 0.6, fats: 4, unit: "g", packSize: 200, packPrice: 2.50, packLabel: "200g pack", tags: ["meat", "pork"] },
  { id: "chorizo", name: "Cooking chorizo", aisle: "Meat & fish", kcal: 340, protein: 22, carbs: 1.5, fats: 28, unit: "g", packSize: 200, packPrice: 2.30, packLabel: "200g ring", tags: ["meat", "pork"], keeps: true },

  // --- Plant protein that isn't soy ----------------------------------------
  { id: "butter_beans", name: "Butter beans", aisle: "Cupboard", kcal: 100, protein: 6.5, carbs: 13, fats: 0.5, unit: "g", packSize: 800, packPrice: 1.40, packLabel: "2 x 400g tins", budget: "value", keeps: true },
  { id: "kidney_beans", name: "Red kidney beans", aisle: "Cupboard", kcal: 100, protein: 6.9, carbs: 14, fats: 0.5, unit: "g", packSize: 800, packPrice: 1.30, packLabel: "2 x 400g tins", budget: "value", keeps: true },
  // A seed paste, so it carries neither the nut nor the soy tag — which is what
  // makes it the fat and the flavour for the diet with the fewest of both.
  { id: "tahini", name: "Tahini", aisle: "Cupboard", kcal: 595, protein: 17, carbs: 9, fats: 54, unit: "g", packSize: 300, packPrice: 2.50, packLabel: "300g jar", keeps: true },
  { id: "cashews", name: "Cashew nuts", aisle: "Cupboard", kcal: 580, protein: 18, carbs: 27, fats: 44, unit: "g", packSize: 200, packPrice: 2.50, packLabel: "200g bag", tags: ["nuts"], keeps: true },

  // --- Things that make a dish taste of somewhere --------------------------
  { id: "harissa", name: "Rose harissa", aisle: "Cupboard", kcal: 130, protein: 3, carbs: 10, fats: 8, unit: "g", packSize: 90, packPrice: 1.40, packLabel: "90g jar", keeps: true },
  { id: "gochujang", name: "Gochujang paste", aisle: "Cupboard", kcal: 210, protein: 5, carbs: 40, fats: 2, unit: "g", packSize: 200, packPrice: 2.50, packLabel: "200g tub", tags: ["soy", "gluten"], keeps: true },
  { id: "mozzarella", name: "Mozzarella", aisle: "Dairy & eggs", kcal: 250, protein: 18, carbs: 1.5, fats: 19, unit: "g", packSize: 125, packPrice: 0.85, packLabel: "125g ball", tags: ["dairy"], budget: "value" },
  { id: "kale", name: "Curly kale", aisle: "Fruit & veg", kcal: 49, protein: 4.3, carbs: 4, fats: 0.9, unit: "g", packSize: 200, packPrice: 1.00, packLabel: "200g bag", budget: "value" },
  { id: "mango_frozen", name: "Frozen mango chunks", aisle: "Frozen", kcal: 60, protein: 0.7, carbs: 14, fats: 0.2, unit: "g", packSize: 500, packPrice: 2.20, packLabel: "500g bag", keeps: true },
  { id: "dates", name: "Medjool dates", aisle: "Cupboard", kcal: 282, protein: 2.5, carbs: 68, fats: 0.2, unit: "g", packSize: 250, packPrice: 1.80, packLabel: "250g pack", keeps: true },
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Search deep links — no API needed, and they can't go stale the way a scraped
// price would. The athlete taps through and their own basket does the rest.
export const SUPERMARKETS: { id: StoreId; name: string; search: (q: string) => string }[] = [
  { id: "tesco", name: "Tesco", search: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}` },
  { id: "sainsburys", name: "Sainsbury's", search: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` },
  { id: "asda", name: "Asda", search: (q) => `https://groceries.asda.com/search/${encodeURIComponent(q)}` },
  { id: "aldi", name: "Aldi", search: (q) => `https://groceries.aldi.co.uk/en-GB/Search?keywords=${encodeURIComponent(q)}` },
];

/**
 * Where tapping an item should send the athlete. A verified product page when
 * we have one, otherwise a search narrowed by pack size so the right item is
 * the first result rather than the twentieth.
 */
export function productLink(food: Food, store: { id: StoreId; search: (q: string) => string }): string {
  const direct = food.productUrls?.[store.id];
  if (direct) return direct;
  // "Basmati rice 1kg bag" beats "Basmati rice" for landing on the right pack.
  return store.search(`${food.name} ${food.packLabel}`.trim());
}

export const PRICES_REVIEWED = "July 2026";

/**
 * A COARSE PRICE LEVEL PER SUPERMARKET.
 *
 * The table above is one number per food, and one number cannot be right in
 * four shops at once — the same basket differs by well over 10% between a
 * discounter and a mid-market chain, which is more than most of the savings the
 * planner works to find. Applying nothing at all meant an Aldi shopper was
 * quoted Tesco prices and told that was what their week would cost.
 *
 * These are TIER adjustments, not per-item pricing: the baseline table reads as
 * mid-market, and each store scales off it. That is a blunt instrument and is
 * described as one wherever it appears — it will be wrong on any individual
 * line, and it is closer than pretending every shop charges the same.
 *
 * The honest fix for a specific line is the athlete correcting it (see
 * `PriceOverrides`), because they are standing in the shop and we are not.
 */
export const STORE_PRICE_INDEX: Record<StoreId, number> = {
  tesco: 1,
  sainsburys: 1.03,
  asda: 0.95,
  aldi: 0.85,
};

/**
 * Prices the athlete has corrected themselves, keyed by food id, in £ per pack.
 *
 * Worth more than everything above put together: it is the one price in the app
 * that is known rather than estimated. An override wins outright and is never
 * scaled by the store index — they typed what they actually paid.
 */
export type PriceOverrides = Record<string, number>;

/** What one pack of this food costs, best information first. */
export function packPriceFor(
  food: Food,
  opts: { store?: StoreId; overrides?: PriceOverrides } = {}
): number {
  const own = opts.overrides?.[food.id];
  if (own != null && Number.isFinite(own) && own > 0) return own;
  const index = opts.store ? STORE_PRICE_INDEX[opts.store] ?? 1 : 1;
  return Math.round(food.packPrice * index * 100) / 100;
}

/** True when this line's price came from the athlete rather than our table. */
export function isCorrected(food: Food, overrides?: PriceOverrides): boolean {
  const own = overrides?.[food.id];
  return own != null && Number.isFinite(own) && own > 0;
}
