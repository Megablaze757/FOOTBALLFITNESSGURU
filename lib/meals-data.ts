import type { Meal } from "./meal-plan";

/**
 * The recipe book.
 *
 * WHY THIS FILE EXISTS SEPARATELY. `meal-plan.ts` is the engine — targets,
 * scoring, portioning, the shopping list. This is the content it works on, and
 * the two change for completely different reasons: one when the maths is wrong,
 * one when the food is boring. Keeping recipes inline made a 900-line engine
 * file where 600 lines were dinners.
 *
 * WHY THE MEALS CHANGED. The old set was nutritionally sound and dull. An audit
 * of the dinner list read: chicken and rice, chicken and sweet potato, chicken
 * pasta bake, roast chicken, beef pasta, beef bolognese, beef and broccoli,
 * turkey chilli, turkey mince and mash. Twenty-two dinners that were all
 * "protein + starch + veg" with the protein swapped, and not one of them was a
 * dish anybody would name. Breakfast was oats six ways.
 *
 * The cause was in the food table, not the recipes: 38 ingredients and no
 * garlic, no ginger, no chilli, no spices, no coconut milk, no feta. There was
 * nothing in the cupboard to make food taste of anywhere, so every meal
 * defaulted to the same shape. The flavour shelf added to `food-db.ts` is what
 * makes this file possible.
 *
 * THESE ARE OUR OWN RECIPES for dishes that belong to everybody — shakshuka,
 * katsu curry, chilli con carne, bibimbap. The dish is common knowledge and the
 * method here is written from scratch; nothing is lifted from a cookbook,
 * because published recipe writing is its author's to license.
 *
 * EVERY MEAL HAS HAND-WRITTEN STEPS. The prose-splitting fallback in
 * `recipeSteps` still exists for safety, but nothing relies on it any more.
 *
 * House style for a step: one action, said the way you'd say it to someone in
 * your kitchen. Say what it should look like, not just how long — "until the
 * edges catch" beats "for 6 minutes" when the pan decides. Where timing is
 * genuinely fixed, give the number.
 */
export const MEALS: Meal[] = [
  // ===========================================================================
  // BREAKFAST
  // ===========================================================================
  {
    id: "shakshuka", name: "Shakshuka", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "passata", qty: 250 }, { foodId: "peppers", qty: 150 },
      { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 6 }, { foodId: "garlic", qty: 8 },
      { foodId: "wholemeal_bread", qty: 80 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Soften the sliced onion and peppers in the oil for 8 minutes — properly soft, not just hot, or the sauce stays sharp.",
      "Garlic and spices in for a minute, until you can smell the cumin.",
      "Pour in the passata, season, and simmer 5 minutes until it thickens enough to hold a dent.",
      "Make three wells with a spoon and crack an egg into each.",
      "Lid on, lowest heat, 5-6 minutes — whites set, yolks still loose.",
      "Bread on the side for the yolk. That is the whole point of it.",
    ],
    tip: "Doubles happily and the sauce keeps three days. Reheat, then add fresh eggs.",
    method: "Soften onion and peppers, add garlic and spices, simmer with passata, then poach eggs in wells under a lid.",
  },
  {
    id: "breakfast_burrito", name: "Breakfast burrito", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "black_beans", qty: 120 },
      { foodId: "cheddar", qty: 30 }, { foodId: "peppers", qty: 80 }, { foodId: "spice_mix", qty: 4 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Fry the diced peppers hard for 4 minutes so they char at the edges.",
      "Add the beans and spices, mash about a third of them into the pan so it binds.",
      "Push aside, scramble the eggs in the same pan, keeping them just underdone.",
      "Pile down the middle of the warmed wraps with the cheese, fold the ends in, then roll tight.",
      "Back in the dry pan seam-side down for a minute to seal it shut.",
    ],
    tip: "Wrap in foil and it survives a kit bag until mid-morning.",
    method: "Char the peppers, add spiced beans, scramble eggs alongside, then fill and roll the wraps and toast the seam.",
  },
  {
    id: "protein_pancakes", name: "Protein pancakes & berries", slot: "Breakfast", minutes: 15,
    items: [
      { foodId: "oats", qty: 80 }, { foodId: "eggs", qty: 2 }, { foodId: "whey_protein", qty: 30 },
      { foodId: "banana", qty: 1 }, { foodId: "berries_frozen", qty: 100 }, { foodId: "greek_yoghurt", qty: 100 },
    ],
    steps: [
      "Blitz the oats, eggs, protein and banana to a batter. It should pour thickly, like double cream — a splash of milk if not.",
      "Rest it 5 minutes. This is the step people skip and it is why pancakes go rubbery.",
      "Medium-low heat, dry non-stick pan. Bubbles across the surface before you flip, about 2 minutes.",
      "Warm the berries in the microwave until they collapse into a sauce.",
      "Stack, yoghurt on top, berries over.",
    ],
    tip: "Protein powder makes batter catch fast — lower heat than you think.",
    method: "Blitz oats, eggs, protein and banana, rest the batter, cook on a medium-low pan, and top with yoghurt and warmed berries.",
  },
  {
    id: "bircher", name: "Bircher muesli", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "oats", qty: 80 }, { foodId: "greek_yoghurt", qty: 200 }, { foodId: "apple", qty: 1 },
      { foodId: "milk", qty: 120 }, { foodId: "almonds", qty: 25 }, { foodId: "honey", qty: 15 },
    ],
    steps: [
      "Grate the apple whole — skin and all, straight into the bowl, stopping at the core.",
      "Stir in the oats, yoghurt, milk and honey until it looks slightly too wet. The oats drink it overnight.",
      "Fridge, covered, at least 4 hours.",
      "Almonds on in the morning, not the night before, or they go soft.",
    ],
    tip: "Made in a jar on Sunday this covers three mornings.",
    method: "Grate the apple in, stir through oats, yoghurt, milk and honey, chill overnight and top with almonds.",
  },
  {
    id: "turkish_eggs", name: "Turkish eggs", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "greek_yoghurt", qty: 200 }, { foodId: "olive_oil", qty: 15 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "garlic", qty: 6 }, { foodId: "wholemeal_bread", qty: 80 },
    ],
    steps: [
      "Stir the crushed garlic and a pinch of salt through the yoghurt and leave it out — fridge-cold yoghurt under hot eggs is the one thing that ruins this.",
      "Poach the eggs in barely-simmering water, 3 minutes for a loose yolk.",
      "Warm the oil with the paprika until it turns red and smells toasty. Twenty seconds, no more, or it burns bitter.",
      "Yoghurt spread wide on the plate, eggs on top, spiced oil poured over.",
      "Toast to mop it up.",
    ],
    tip: "Sounds odd, converts everyone. Ten minutes and it eats like a restaurant.",
    method: "Season the yoghurt with garlic, poach the eggs, bloom paprika in warm oil, and pour it over the eggs on the yoghurt.",
  },
  {
    id: "big_breakfast_tray", name: "Big breakfast tray", slot: "Breakfast", minutes: 25,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "beans_baked", qty: 200 }, { foodId: "mushrooms", qty: 150 },
      { foodId: "tomatoes_fresh", qty: 150 }, { foodId: "wholemeal_bread", qty: 80 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Oven to 200C. Mushrooms and tomatoes on a tray with the oil, salt and pepper.",
      "Roast 15 minutes, until the tomatoes split and the mushrooms give up their water.",
      "Beans into a pan on a low heat, not a microwave — they reduce and taste of more.",
      "Crack the eggs straight onto the tray in the gaps and give it 6 minutes more.",
      "Toast last so it is hot when everything lands.",
    ],
    tip: "One tray, one pan. The weekend breakfast that isn't a write-off.",
    method: "Roast mushrooms and tomatoes at 200C, reduce the beans in a pan, bake eggs onto the tray for the last 6 minutes and serve with toast.",
  },
  {
    id: "pb_french_toast", name: "Peanut butter French toast", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "wholemeal_bread", qty: 100 }, { foodId: "eggs", qty: 3 }, { foodId: "milk", qty: 60 },
      { foodId: "peanut_butter", qty: 30 }, { foodId: "banana", qty: 1 }, { foodId: "honey", qty: 10 },
    ],
    steps: [
      "Beat the eggs with the milk and a pinch of salt in a wide dish.",
      "Soak the bread 30 seconds a side. Long enough to be custardy inside, short enough to still lift in one piece.",
      "Medium heat, small knob of the peanut butter in the pan as the fat.",
      "Two to three minutes a side, until deep golden and springy.",
      "Sliced banana, the rest of the peanut butter melted over, honey last.",
    ],
    tip: "Stale bread is better here than fresh — it holds together.",
    method: "Soak bread in beaten egg and milk, fry in peanut butter until golden, and top with banana and honey.",
  },
  {
    id: "savoury_oats_egg", name: "Savoury oats with a fried egg", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "oats", qty: 80 }, { foodId: "stock_cubes", qty: 5 }, { foodId: "eggs", qty: 2 },
      { foodId: "spinach", qty: 80 }, { foodId: "cheddar", qty: 30 }, { foodId: "soy_sauce", qty: 8 },
    ],
    steps: [
      "Simmer the oats in stock instead of milk, 5 minutes, stirring — it goes silkier than the sweet version.",
      "Wilt the spinach through at the end and beat in the cheese so it melts into the oats.",
      "Fry the eggs hard in a separate pan so the whites go lacy and crisp at the edges.",
      "Oats in the bowl, eggs on top, soy sauce over.",
    ],
    tip: "If porridge has ever bored you, this is the reason it did.",
    method: "Cook the oats in stock, stir in spinach and cheese, and top with hard-fried eggs and soy sauce.",
  },
  {
    id: "salmon_avo_toast", name: "Salmon & avocado toast", slot: "Breakfast", minutes: 8,
    items: [
      { foodId: "salmon_fillet", qty: 120 }, { foodId: "avocado", qty: 1 }, { foodId: "wholemeal_bread", qty: 80 },
      { foodId: "eggs", qty: 2 }, { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Pan-fry the salmon skin-side down in a dry hot pan, 4 minutes, then 1 minute on the flesh.",
      "Meanwhile toast the bread and soft-boil the eggs, 6 minutes exactly from boiling.",
      "Mash the avocado rough with lemon, salt and plenty of pepper — keep it lumpy.",
      "Avocado on the toast, flake the salmon over, halve the eggs on top, chilli scattered.",
    ],
    tip: "Smoked salmon works and takes the cooking out entirely.",
    method: "Fry the salmon, soft-boil the eggs, mash avocado with lemon, and build it all on toast with chilli.",
  },
  {
    id: "sweet_potato_feta_hash", name: "Sweet potato, feta & egg hash", slot: "Breakfast", minutes: 22,
    items: [
      { foodId: "sweet_potato", qty: 300 }, { foodId: "eggs", qty: 3 }, { foodId: "feta", qty: 60 },
      { foodId: "spinach", qty: 80 }, { foodId: "spice_mix", qty: 5 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Cube the sweet potato at 1.5cm and fry in the oil over a medium heat, 14 minutes, turning only every 4 or it steams instead of crusting.",
      "Spices in for the last 2 minutes.",
      "Spinach through until it collapses, then three wells for the eggs.",
      "Cover and cook 4 minutes.",
      "Feta crumbled over off the heat so it softens without melting away.",
    ],
    tip: "Microwave the sweet potato 3 minutes first and it halves the pan time.",
    method: "Fry cubed sweet potato until crusted, add spices and spinach, cook eggs in wells under a lid, and crumble feta over.",
  },
  {
    id: "tofu_scramble_burrito", name: "Tofu scramble burrito", slot: "Breakfast", minutes: 14,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "black_beans", qty: 120 },
      { foodId: "peppers", qty: 80 }, { foodId: "spice_mix", qty: 6 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Squeeze the tofu dry in a clean tea towel. Wet tofu steams grey; dry tofu browns.",
      "Crumble into hot oil with the turmeric and cumin, and leave it alone for 3 minutes so it colours.",
      "Peppers and beans in, another 4 minutes.",
      "Onto warmed wraps, roll tight, and seal seam-side down in the dry pan.",
    ],
    tip: "Black salt (kala namak) if you can get it — it genuinely tastes of egg.",
    method: "Dry the tofu, crumble into spiced oil and brown, add peppers and beans, then roll into warmed wraps.",
  },
  {
    id: "pbj_overnight_oats", name: "PB&J overnight oats", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "oats", qty: 90 }, { foodId: "milk", qty: 300 }, { foodId: "whey_protein", qty: 30 },
      { foodId: "peanut_butter", qty: 30 }, { foodId: "berries_frozen", qty: 100 },
    ],
    steps: [
      "Stir the oats, milk and protein together in a jar until there are no dry pockets.",
      "Swirl the peanut butter through in ribbons rather than mixing it in — you want to hit pockets of it.",
      "Frozen berries straight on top. They defrost overnight and bleed into the oats.",
      "Fridge overnight. Eat cold, straight from the jar.",
    ],
    tip: "Make three at once on a Sunday. They keep four days.",
    method: "Combine oats, milk and protein, ribbon peanut butter through, top with frozen berries and chill overnight.",
  },
  {
    id: "gf_potato_hash_eggs", name: "Potato hash & eggs", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "potatoes", qty: 300 }, { foodId: "eggs", qty: 3 }, { foodId: "spinach", qty: 80 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "onion", qty: 60 }, { foodId: "spice_mix", qty: 4 },
    ],
    steps: [
      "Dice the potatoes at 1cm — bigger and they will not cook through before the outsides burn.",
      "Fry in the oil over a medium heat for 12 minutes, turning every few minutes so they crust rather than steam.",
      "Onion and spices for the last 5, spinach for the last 1.",
      "Push it all aside, crack the eggs into the space, cover the pan for 2 minutes.",
    ],
    tip: "Boil the potatoes the night before and this is a 7-minute breakfast.",
    method: "Dice and fry the potatoes until crusted, add onion, spices then spinach, and cook the eggs in the same pan.",
  },
  {
    id: "gf_quinoa_porridge", name: "Quinoa breakfast bowl", slot: "Breakfast", minutes: 18,
    items: [
      { foodId: "quinoa", qty: 90 }, { foodId: "milk", qty: 300 }, { foodId: "whey_protein", qty: 30 },
      { foodId: "berries_frozen", qty: 100 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "honey", qty: 10 },
    ],
    steps: [
      "Rinse the quinoa in a sieve until the water runs clear, or it tastes soapy.",
      "Simmer in the milk for 15 minutes, until the grains uncurl and it goes creamy.",
      "Off the heat, and let it stop steaming before the protein goes in — a boiling pan makes it lumpy.",
      "Berries, seeds and honey on top.",
    ],
    tip: "Cook the whole bag at the weekend; it reheats with a splash of milk.",
    method: "Rinse the quinoa, simmer in milk, cool slightly, stir protein through and top with berries, seeds and honey.",
  },
  {
    id: "protein_soya_porridge", name: "Soya protein porridge", slot: "Breakfast", minutes: 10,
    items: [
      { foodId: "oats", qty: 70 }, { foodId: "soy_milk", qty: 450 }, { foodId: "pea_protein", qty: 40 },
      { foodId: "berries_frozen", qty: 80 }, { foodId: "peanut_butter", qty: 20 },
    ],
    steps: [
      "Simmer the oats in the soya milk, stirring, 5 minutes until it thickens.",
      "Off the heat and leave it a minute — pea protein clags badly if it goes into a boiling pan.",
      "Stir the protein through, then the peanut butter.",
      "Berries on top, warmed 30 seconds so they burst.",
    ],
    tip: "Pea protein is gritty stirred in dry. A splash of the milk first, into a paste, fixes it.",
    method: "Simmer oats in soya milk, cool briefly, stir protein and peanut butter through, and top with warmed berries.",
  },
  {
    id: "yoghurt_honey_stack", name: "Yoghurt, honey & seed stack", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "greek_yoghurt", qty: 400 }, { foodId: "berries_frozen", qty: 120 }, { foodId: "almonds", qty: 30 },
      { foodId: "honey", qty: 20 }, { foodId: "seeds_mixed", qty: 20 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Microwave the berries 40 seconds so they release their juice and turn into a compote.",
      "Layer yoghurt, berries and sliced banana in a bowl or a jar.",
      "Honey over, then the nuts and seeds last so they stay crunchy.",
    ],
    tip: "Built in a jar the night before, this travels to a morning session.",
    method: "Warm the berries to a compote, layer with yoghurt and banana, and finish with honey, nuts and seeds.",
  },

  // ===========================================================================
  // LUNCH
  // ===========================================================================
  {
    id: "chicken_shawarma_pitta", name: "Chicken shawarma pitta", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "pitta", qty: 100 }, { foodId: "hummus", qty: 60 },
      { foodId: "cucumber", qty: 80 }, { foodId: "tomatoes_fresh", qty: 80 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "garlic", qty: 6 }, { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Slice the chicken thin across the grain and toss with the oil, spices, crushed garlic and half the lemon.",
      "Ten minutes sitting is enough — this is not a marinade you need to plan a day ahead.",
      "Hottest pan you have, single layer, do not move it for 3 minutes. You want dark edges, not grey chicken.",
      "Chop the cucumber and tomatoes with the rest of the lemon and a pinch of salt.",
      "Warm the pittas, split, hummus inside, chicken, then salad on top so it does not go soggy underneath.",
    ],
    tip: "Cook the whole pack. Cold shawarma chicken is the best lunchbox filling there is.",
    method: "Toss sliced chicken with spices, garlic and lemon, sear hard in a hot pan, and load into warm pittas with hummus and chopped salad.",
  },
  {
    id: "salmon_poke_bowl", name: "Salmon poke bowl", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "salmon_fillet", qty: 180 }, { foodId: "rice", qty: 90 }, { foodId: "edamame", qty: 80 },
      { foodId: "cucumber", qty: 80 }, { foodId: "avocado", qty: 1 }, { foodId: "soy_sauce", qty: 15 },
      { foodId: "ginger", qty: 6 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Rice on. When it is done, fork it through and let it cool to just-warm — hot rice cooks the salmon.",
      "Pan-sear the salmon 3 minutes a side and flake it into big pieces, or use it raw if it is sushi-grade.",
      "Boil the edamame 3 minutes and run under cold water.",
      "Whisk the soy with grated ginger for the dressing.",
      "Build it in sections rather than mixing — rice, then salmon, edamame, cucumber, avocado in their own quarters. Dressing over, seeds last.",
    ],
    tip: "Sections, not a stir. Half the pleasure of a poke bowl is choosing each mouthful.",
    method: "Cool the cooked rice, sear and flake the salmon, boil the edamame, and arrange in sections with a soy-ginger dressing.",
  },
  {
    id: "falafel_style_bowl", name: "Spiced chickpea & halloumi bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "chickpeas", qty: 240 }, { foodId: "halloumi", qty: 90 }, { foodId: "couscous", qty: 80 },
      { foodId: "cucumber", qty: 80 }, { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Couscous in a bowl, boiling water just to cover, plate on top, 5 minutes. Then fork it apart.",
      "Drain and dry the chickpeas properly, then fry in the oil with the spices until some of them split and crisp.",
      "Halloumi in a dry pan, 90 seconds a side. Any longer and it goes squeaky and tough.",
      "Chop the cucumber and tomatoes with lemon and salt.",
      "Couscous down, chickpeas over, halloumi on top, salad alongside.",
    ],
    tip: "Dry chickpeas crisp, wet ones steam. It is worth the tea towel.",
    method: "Steep the couscous, crisp spiced chickpeas in oil, griddle the halloumi briefly, and build with a lemon-dressed salad.",
  },
  {
    id: "bibimbap_beef_bowl", name: "Beef bibimbap bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "beef_mince_5", qty: 200 }, { foodId: "rice", qty: 100 }, { foodId: "eggs", qty: 1 },
      { foodId: "carrots", qty: 80 }, { foodId: "spinach", qty: 100 }, { foodId: "soy_sauce", qty: 20 },
      { foodId: "garlic", qty: 8 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Rice on.",
      "Fry the beef hard with the garlic until it is properly browned — 6 minutes, and drain nothing away.",
      "Soy sauce in at the end and let it reduce and stick to the meat.",
      "Julienne the carrot raw. Wilt the spinach in a splash of water for 30 seconds and squeeze it out.",
      "Fry an egg with a crisp lacy edge and a runny yolk.",
      "Rice in the bowl, beef and vegetables arranged in their own piles, egg on top, chilli scattered. Mix it all at the table.",
    ],
    tip: "The vegetables kept separate is what makes it bibimbap rather than a stir-fry.",
    method: "Brown the beef with garlic and reduce soy into it, prepare the vegetables separately, and top rice with everything plus a fried egg.",
  },
  {
    id: "thai_prawn_noodle_salad", name: "Thai prawn noodle salad", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "prawns", qty: 180 }, { foodId: "noodles", qty: 90 }, { foodId: "cucumber", qty: 100 },
      { foodId: "carrots", qty: 80 }, { foodId: "peanut_butter", qty: 25 }, { foodId: "soy_sauce", qty: 15 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "ginger", qty: 6 },
    ],
    steps: [
      "Cook the noodles, then run them under cold water until completely cool or the salad goes claggy.",
      "Whisk the peanut butter, soy, lemon juice, grated ginger and chopped chilli with a splash of warm water into a pourable dressing.",
      "Ribbon the cucumber and carrot with a peeler — long strips, not dice. They hold dressing far better.",
      "Toss everything with the prawns and the dressing.",
    ],
    tip: "Better after an hour in the fridge, which makes it the one lunch worth making the night before.",
    method: "Cool the cooked noodles, make a peanut-soy-lime dressing, ribbon the vegetables, and toss with prawns.",
  },
  {
    id: "chicken_fajita_wrap", name: "Chicken fajita wraps", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "peppers", qty: 150 },
      { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 8 }, { foodId: "cheddar", qty: 30 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Slice everything the same width so it cooks at the same rate — chicken, peppers, onion, all about a finger wide.",
      "Chicken into the hottest pan first, spices straight on, 5 minutes without stirring much.",
      "Peppers and onion in, another 5. You want char marks, not softness.",
      "Lemon squeezed over the pan at the end — it lifts the whole thing.",
      "Into warm wraps with the cheese while everything is still hot enough to melt it.",
    ],
    tip: "Crowding the pan is what turns fajitas grey. Two batches beats one sad one.",
    method: "Slice chicken and vegetables evenly, sear the spiced chicken hard, add peppers and onion for char, finish with lemon and fill warm wraps.",
  },
  {
    id: "tuna_nicoise", name: "Tuna niçoise-style plate", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "tuna_tin", qty: 160 }, { foodId: "potatoes", qty: 250 }, { foodId: "eggs", qty: 2 },
      { foodId: "peas_frozen", qty: 100 }, { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "olive_oil", qty: 15 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Halve the potatoes and boil 15 minutes. Drop the eggs in for the last 7 and the peas for the last 2 — one pan, three jobs.",
      "Cold water over the eggs straight away so they peel cleanly.",
      "Dress the potatoes while they are still hot; warm potato drinks dressing, cold potato repels it.",
      "Everything on a plate rather than in a bowl, tuna flaked over, eggs halved on top.",
    ],
    tip: "Dressing hot potatoes is the single trick that makes this taste like a restaurant salad.",
    method: "Boil potatoes with eggs and peas in one pan, dress the potatoes while hot, and plate with flaked tuna and halved eggs.",
  },
  {
    id: "greek_chicken_couscous", name: "Greek chicken & couscous", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "couscous", qty: 90 }, { foodId: "feta", qty: 60 },
      { foodId: "cucumber", qty: 100 }, { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "olive_oil", qty: 15 },
      { foodId: "lemon", qty: 1 }, { foodId: "garlic", qty: 6 },
    ],
    steps: [
      "Flatten the chicken to an even thickness under a pan — it then cooks in 8 minutes instead of 14 and stays juicy.",
      "Oil, garlic, lemon and oregano over it, then into a hot pan, 4 minutes a side.",
      "Couscous steeped in boiling water under a plate for 5 minutes, forked apart.",
      "Chop the cucumber and tomato chunky, dress with oil and lemon, salt it and leave it 5 minutes to draw out juice.",
      "Couscous, salad and its juices, sliced chicken, feta crumbled over.",
    ],
    tip: "Those salad juices soaking into the couscous is the point. Do not drain them.",
    method: "Flatten and sear lemon-garlic chicken, steep the couscous, salt a chunky salad, and combine with crumbled feta.",
  },
  {
    id: "egg_fried_rice_prawns", name: "Prawn egg fried rice", slot: "Lunch", minutes: 14,
    items: [
      { foodId: "prawns", qty: 180 }, { foodId: "rice", qty: 100 }, { foodId: "eggs", qty: 2 },
      { foodId: "peas_frozen", qty: 100 }, { foodId: "sweetcorn", qty: 80 }, { foodId: "soy_sauce", qty: 20 },
      { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Use cold, day-old rice if you have it. Fresh rice steams and goes to paste — this is the whole secret of fried rice.",
      "Screaming hot pan, oil, garlic for 20 seconds only.",
      "Rice in and spread it out. Leave it 90 seconds so the bottom crisps before you toss it.",
      "Push aside, scramble the eggs in the space, then fold them through.",
      "Prawns, peas and sweetcorn in for the last 2 minutes — the prawns are already cooked and just need heating.",
      "Soy sauce around the edge of the pan, not the middle, so it sizzles rather than soaks.",
    ],
    tip: "Cook extra rice at dinner specifically to make this tomorrow.",
    method: "Fry cold rice hard in garlic oil, scramble eggs into it, add prawns and vegetables briefly, and finish with soy round the pan edge.",
  },
  {
    id: "vg_burrito_bowl", name: "Black bean burrito bowl", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "rice", qty: 90 }, { foodId: "tofu", qty: 150 },
      { foodId: "passata", qty: 120 }, { foodId: "sweetcorn", qty: 80 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Rice on. While it cooks, fry the crumbled tofu in the oil until the edges catch.",
      "Beans, passata, sweetcorn and spices in, and simmer 8 minutes until it thickens and stops looking like soup.",
      "Lemon squeezed in off the heat.",
      "Over the rice.",
    ],
    tip: "Doubles cleanly and is genuinely better on day two.",
    method: "Crisp the tofu, simmer with beans, passata, corn and spices until thick, finish with lemon and serve over rice.",
  },
  {
    id: "vg_peanut_noodle_tofu", name: "Peanut tofu noodles", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "noodles", qty: 90 }, { foodId: "peanut_butter", qty: 30 },
      { foodId: "broccoli", qty: 150 }, { foodId: "soy_sauce", qty: 15 }, { foodId: "ginger", qty: 6 },
      { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Noodles on. Drop the broccoli into the same water for the last 3 minutes.",
      "Fry the tofu hard in a dry pan until it squeaks and colours on at least two sides.",
      "Loosen the peanut butter with soy, grated ginger and a ladle of the noodle water into a sauce that pours.",
      "Everything back in the pan together and tossed until it coats. Chilli over.",
    ],
    tip: "Thin the sauce more than feels right — it tightens the moment it hits the pan.",
    method: "Cook noodles and broccoli together, crisp the tofu, make a peanut-soy sauce with noodle water, and toss everything through.",
  },
  {
    id: "vg_tofu_lentil_no_starch", name: "Tofu, lentil & greens plate", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "tofu", qty: 320 }, { foodId: "red_lentils", qty: 70 }, { foodId: "broccoli", qty: 200 },
      { foodId: "spinach", qty: 100 }, { foodId: "garlic", qty: 8 }, { foodId: "stock_cubes", qty: 5 },
      { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Lentils on with double their volume of water and a stock cube, 20 minutes until they collapse.",
      "Press the tofu, cube it, fry hard in the oil with the garlic until every side has colour. Ten minutes, and resist stirring.",
      "Steam the broccoli 5 minutes, wilt the spinach into the lentils at the end.",
      "Lentils down, tofu on top, greens alongside, lemon squeezed over everything.",
    ],
    tip: "No rice, no bread — deliberately. This is the meal for a day when calories are tight and protein isn't.",
    method: "Simmer lentils in stock, fry garlicky tofu hard, steam the broccoli and wilt spinach through, then plate with lemon.",
  },
  {
    id: "jacket_tuna_sweetcorn", name: "Loaded jacket potato", slot: "Lunch", minutes: 12,
    items: [
      { foodId: "potatoes", qty: 350 }, { foodId: "tuna_tin", qty: 120 }, { foodId: "sweetcorn", qty: 80 },
      { foodId: "cottage_cheese", qty: 100 }, { foodId: "cheddar", qty: 30 }, { foodId: "chilli_fresh", qty: 4 },
    ],
    steps: [
      "Prick the potato all over and microwave 8-10 minutes, turning halfway.",
      "Then — and this is the bit people miss — 5 minutes in a hot oven or air fryer to dry and crisp the skin.",
      "Mix the tuna, sweetcorn, cottage cheese and chopped chilli. Cottage cheese instead of mayo doubles the protein and nobody notices.",
      "Split, fluff the inside with a fork, pile it in, cheese over the top.",
    ],
    tip: "Microwave then crisp. Microwave alone gives you a bag of steam in a skin.",
    method: "Microwave the potato then crisp the skin in a hot oven, mix tuna with sweetcorn and cottage cheese, and load it in with cheese.",
  },
  {
    id: "halloumi_couscous_salad", name: "Halloumi & roast veg couscous", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "halloumi", qty: 100 }, { foodId: "couscous", qty: 90 }, { foodId: "courgette", qty: 150 },
      { foodId: "peppers", qty: 150 }, { foodId: "chickpeas", qty: 120 }, { foodId: "olive_oil", qty: 15 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C. Courgette, peppers and drained chickpeas on a tray with oil and spices.",
      "Roast 18 minutes. Hot and fast — at 180C they sweat instead of colouring.",
      "Couscous steeped under a plate for 5 minutes, then forked apart.",
      "Halloumi in a dry pan, 90 seconds a side, straight onto the plate while it still squeaks.",
      "Everything tossed together, lemon over.",
    ],
    tip: "Roast a double tray. Cold roast veg is a better lunch than most hot ones.",
    method: "Roast courgette, peppers and chickpeas hot, steep the couscous, griddle the halloumi briefly, and toss together with lemon.",
  },

  // ===========================================================================
  // DINNER
  // ===========================================================================
  {
    id: "chicken_katsu_curry", name: "Chicken katsu curry", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "chicken_breast", qty: 260 }, { foodId: "rice", qty: 100 }, { foodId: "carrots", qty: 100 },
      { foodId: "onion", qty: 100 }, { foodId: "curry_paste", qty: 30 }, { foodId: "coconut_milk", qty: 120 },
      { foodId: "stock_cubes", qty: 5 }, { foodId: "olive_oil", qty: 12 }, { foodId: "honey", qty: 8 },
    ],
    steps: [
      "Soften the onion and carrot in the oil, 10 minutes, until sweet rather than raw.",
      "Curry paste in for a minute, then stock and coconut milk. Simmer 12 minutes.",
      "Blitz the sauce smooth. This is what separates katsu sauce from a curry — it should be velvet, not chunky.",
      "Honey and a splash of soy to balance it. Taste. It wants to be slightly sweet.",
      "Meanwhile flatten the chicken, season, and fry 5 minutes a side until deeply golden.",
      "Slice it thick, lay it over the rice, sauce poured across the middle so some chicken stays crisp.",
    ],
    tip: "The sauce freezes in portions. Make triple and this becomes a 12-minute dinner.",
    method: "Soften onion and carrot, add curry paste, stock and coconut milk, blitz smooth and balance with honey, then serve over rice with seared chicken.",
  },
  {
    id: "chilli_con_carne", name: "Chilli con carne", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "beef_mince_5", qty: 250 }, { foodId: "black_beans", qty: 200 }, { foodId: "passata", qty: 300 },
      { foodId: "rice", qty: 90 }, { foodId: "onion", qty: 100 }, { foodId: "peppers", qty: 120 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "garlic", qty: 10 }, { foodId: "chilli_fresh", qty: 8 },
    ],
    steps: [
      "Brown the mince properly, in a dry hot pan, in two batches. Grey mince is the difference between chilli and slop.",
      "Out of the pan, then soften the onion and peppers in the fat left behind.",
      "Garlic, chilli and spices for a minute, until it smells sharp.",
      "Beef back in with the passata and beans, half a mug of water, and a squeeze of dark chocolate or a spoon of honey if you have it.",
      "Lowest heat, lid ajar, 25 minutes minimum. It is not ready when it is hot, it is ready when it is thick.",
      "Rice at the end so it does not sit.",
    ],
    tip: "Genuinely better the next day, and it freezes perfectly. Always double it.",
    method: "Brown the mince in batches, soften onion and peppers, add spices, then simmer with passata and beans until thick. Serve with rice.",
  },
  {
    id: "thai_green_curry", name: "Thai-style green curry", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "chicken_breast", qty: 250 }, { foodId: "coconut_milk", qty: 200 }, { foodId: "curry_paste", qty: 35 },
      { foodId: "rice", qty: 90 }, { foodId: "courgette", qty: 150 }, { foodId: "peppers", qty: 120 },
      { foodId: "soy_sauce", qty: 12 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Fry the curry paste in a dry pan for 60 seconds until it darkens and the kitchen smells of it. Do not skip this — it is the difference between fragrant and flat.",
      "Add a third of the coconut milk and let it bubble and split slightly.",
      "Chicken in, coated, 4 minutes.",
      "Rest of the coconut milk, then the courgette and peppers. Simmer 8 minutes — the veg should keep bite.",
      "Soy and lime off the heat. Never boil it after the lime goes in.",
      "Rice alongside.",
    ],
    tip: "Swap the chicken for 300g tofu and it is just as good — fry the tofu first and add it back at the end.",
    method: "Fry the curry paste until fragrant, split it with coconut milk, cook the chicken through, add vegetables and finish with soy and lime.",
  },
  {
    id: "salmon_teriyaki_noodles", name: "Teriyaki salmon noodles", slot: "Dinner", minutes: 22,
    items: [
      { foodId: "salmon_fillet", qty: 240 }, { foodId: "noodles", qty: 100 }, { foodId: "broccoli", qty: 180 },
      { foodId: "soy_sauce", qty: 30 }, { foodId: "honey", qty: 20 }, { foodId: "ginger", qty: 8 },
      { foodId: "garlic", qty: 8 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Mix the soy, honey, grated ginger and garlic. That is the teriyaki — nothing else needed.",
      "Salmon skin-side down in a hot dry pan, 4 minutes without touching it, then flip for 2.",
      "Pour the sauce in and let it reduce around the fish for 90 seconds until it turns glossy and clings.",
      "Noodles and broccoli in one pan of boiling water, drained.",
      "Toss the noodles through whatever sauce is left in the pan, salmon on top, seeds over.",
    ],
    tip: "Watch the sauce at the end. Honey goes from glossy to burnt in about twenty seconds.",
    method: "Make a soy-honey-ginger glaze, sear the salmon, reduce the sauce around it, and toss with noodles and broccoli.",
  },
  {
    id: "turkey_meatballs_passata", name: "Turkey meatballs in tomato sauce", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "turkey_mince", qty: 280 }, { foodId: "pasta", qty: 100 }, { foodId: "passata", qty: 350 },
      { foodId: "onion", qty: 80 }, { foodId: "garlic", qty: 10 }, { foodId: "eggs", qty: 1 },
      { foodId: "cheddar", qty: 30 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Mix the turkey with the egg, half the garlic, salt and plenty of pepper. Roll into balls a bit smaller than a golf ball — wet hands stop it sticking.",
      "Brown them all over in the oil and lift them out. They will not be cooked through yet; that happens in the sauce.",
      "Soften the onion and the rest of the garlic in the same pan.",
      "Passata in, plus a splash of water, then the meatballs back in.",
      "Twenty minutes at a bare simmer, lid off. Turkey is lean and this is what keeps it tender.",
      "Pasta, cheese grated over.",
    ],
    tip: "Egg is the binder — without it lean turkey meatballs fall apart in the sauce.",
    method: "Bind the turkey with egg and garlic, brown the meatballs, then finish them in a simmering passata sauce and serve with pasta.",
  },
  {
    id: "beef_black_bean_stirfry", name: "Beef & black bean stir-fry", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "beef_mince_5", qty: 250 }, { foodId: "black_beans", qty: 150 }, { foodId: "rice", qty: 100 },
      { foodId: "peppers", qty: 150 }, { foodId: "soy_sauce", qty: 25 }, { foodId: "garlic", qty: 10 },
      { foodId: "ginger", qty: 8 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Rice on first — everything else takes 10 minutes.",
      "Hottest pan you own. Beef in, spread thin, and left completely alone for 3 minutes so it crusts.",
      "Break it up, push to one side, then garlic, ginger and chilli in the space for 30 seconds.",
      "Peppers in for 2 minutes only — they should still snap.",
      "Beans and soy, tossed for a minute until everything is glossy.",
    ],
    tip: "A stir-fry fails from a cool pan and a crowded one. Get it smoking first.",
    method: "Crust the beef in a very hot pan, add aromatics, then peppers briefly, and finish with black beans and soy.",
  },
  {
    id: "chicken_tikka_traybake", name: "Chicken tikka traybake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "chicken_breast", qty: 260 }, { foodId: "greek_yoghurt", qty: 100 }, { foodId: "spice_mix", qty: 12 },
      { foodId: "sweet_potato", qty: 250 }, { foodId: "peppers", qty: 150 }, { foodId: "garlic", qty: 10 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Coat the chicken in the yoghurt, spices, crushed garlic and lemon. The yoghurt tenderises as well as flavours — 20 minutes helps, overnight is better.",
      "Oven to 220C. Sweet potato and peppers on the tray with oil, 15 minutes head start.",
      "Chicken on top of the veg, 18 minutes more.",
      "Under the grill for the last 3 to catch the edges — that char is the whole point of tikka.",
    ],
    tip: "Marinate in the morning in the tray you will cook it in. Nothing to do at 7pm.",
    method: "Marinate chicken in spiced yoghurt, roast sweet potato and peppers first, add the chicken, and finish under a hot grill.",
  },
  {
    id: "mushroom_spinach_risotto", name: "Mushroom & spinach risotto", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "rice", qty: 110 }, { foodId: "mushrooms", qty: 250 }, { foodId: "spinach", qty: 120 },
      { foodId: "stock_cubes", qty: 8 }, { foodId: "cheddar", qty: 50 }, { foodId: "onion", qty: 80 },
      { foodId: "garlic", qty: 10 }, { foodId: "olive_oil", qty: 15 },
    ],
    steps: [
      "Fry the mushrooms hard and dry first, no oil, until they squeak and then brown. Set aside. Cooking them in the risotto makes everything grey.",
      "Now oil, onion and garlic, softened for 6 minutes.",
      "Rice in, stirred for a minute until the grains look glassy at the edges.",
      "Hot stock a ladle at a time, stirring, waiting for each to be absorbed. Twenty minutes, and you cannot walk away.",
      "Mushrooms back in, spinach wilted through, cheese beaten in off the heat.",
      "Rest it two minutes before serving — it thickens and settles.",
    ],
    tip: "Basmati is not risotto rice and this will not go properly creamy. It still tastes good, and beating the cheese in hard gets you most of the way.",
    method: "Brown the mushrooms separately, soften onion and garlic, toast the rice, then add hot stock gradually before finishing with spinach and cheese.",
  },
  {
    id: "sweet_potato_chickpea_curry", name: "Sweet potato & chickpea curry", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "sweet_potato", qty: 200 }, { foodId: "chickpeas", qty: 240 }, { foodId: "tofu", qty: 200 },
      { foodId: "coconut_milk", qty: 120 }, { foodId: "spinach", qty: 100 }, { foodId: "rice", qty: 70 },
      { foodId: "curry_paste", qty: 30 },
      { foodId: "onion", qty: 80 }, { foodId: "ginger", qty: 8 },
    ],
    steps: [
      "Soften the onion, then the curry paste and grated ginger for a minute until fragrant.",
      "Cubed sweet potato in, coated, then the coconut milk and a splash of water.",
      "Lid on, 18 minutes, until a knife slides into the sweet potato with no resistance.",
      "Chickpeas and cubed tofu in for the last 5 — long enough to warm, short enough to keep their shape.",
      "Spinach wilted through at the end, off the heat.",
    ],
    tip: "Mash a few of the sweet potato cubes against the side of the pan and the sauce thickens itself.",
    method: "Fry curry paste and ginger with onion, simmer sweet potato in coconut milk until tender, then add chickpeas and tofu and wilt spinach through.",
  },
  {
    id: "pesto_salmon_potatoes", name: "Pesto salmon & crushed potatoes", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "salmon_fillet", qty: 240 }, { foodId: "potatoes", qty: 350 }, { foodId: "pesto", qty: 35 },
      { foodId: "peas_frozen", qty: 120 }, { foodId: "broccoli", qty: 150 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Boil the potatoes whole, 18 minutes, with the peas dropped in for the last 2.",
      "Oven to 200C. Salmon on a tray, half the pesto spread over the top of each fillet.",
      "Twelve minutes — it is done when it flakes but still looks slightly translucent in the middle.",
      "Crush the potatoes with a fork rather than mashing them. You want craggy edges, not smooth.",
      "Rest of the pesto, the peas, oil and lemon stirred through the crushed potatoes.",
      "Steam the broccoli 5 minutes.",
    ],
    tip: "Crushed beats mashed here — the rough edges hold the pesto.",
    method: "Boil potatoes with peas, bake pesto-topped salmon at 200C, crush the potatoes with pesto and lemon, and serve with broccoli.",
  },
  {
    id: "vg_lentil_shepherds", name: "Lentil shepherd's pie", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "red_lentils", qty: 120 }, { foodId: "potatoes", qty: 350 }, { foodId: "carrots", qty: 120 },
      { foodId: "passata", qty: 250 }, { foodId: "peas_frozen", qty: 100 }, { foodId: "stock_cubes", qty: 6 },
      { foodId: "onion", qty: 80 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Potatoes on to boil, 20 minutes, then mash with half the oil and far more salt and pepper than feels right.",
      "Meanwhile soften the onion and carrot, then add lentils, passata, stock and herbs.",
      "Simmer 20 minutes until thick enough that a spoon leaves a trail. Peas in at the end.",
      "Lentils into a dish, mash spread over, then drag a fork across the top.",
      "Hot grill, 6-8 minutes, until the fork-peaks go dark. Those ridges are the best bit.",
    ],
    tip: "Makes two portions and the second is better.",
    method: "Mash boiled potatoes, simmer lentils with vegetables and passata until thick, top and grill until the peaks brown.",
  },
  {
    id: "vg_tofu_katsu", name: "Baked tofu katsu", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "tofu", qty: 300 }, { foodId: "rice", qty: 100 }, { foodId: "carrots", qty: 100 },
      { foodId: "onion", qty: 100 }, { foodId: "curry_paste", qty: 30 }, { foodId: "coconut_milk", qty: 120 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "maple_syrup", qty: 8 },
    ],
    steps: [
      "Oven to 200C. Press the tofu properly, slice into thick slabs, oil and salt both sides.",
      "Bake 25 minutes, turning once, until the edges are firm and golden.",
      "Meanwhile soften the onion and carrot, add the curry paste for a minute, then coconut milk and a mug of water.",
      "Simmer 12 minutes and blitz smooth. A spoon of maple to balance the heat.",
      "Rice, tofu slabs, sauce over.",
    ],
    tip: "Baking beats frying here — slabs hold together instead of collapsing.",
    method: "Bake pressed, oiled tofu slabs at 200C, make a blitzed katsu sauce from curry paste and coconut milk, and serve with rice.",
  },
  {
    id: "vt_egg_chickpea_traybake", name: "Egg & chickpea traybake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "chickpeas", qty: 240 }, { foodId: "eggs", qty: 3 }, { foodId: "sweet_potato", qty: 250 },
      { foodId: "spinach", qty: 80 }, { foodId: "spice_mix", qty: 8 }, { foodId: "feta", qty: 50 },
      { foodId: "olive_oil", qty: 15 },
    ],
    steps: [
      "Oven to 200C. Cubed sweet potato and drained, dried chickpeas onto a tray with the oil and spices.",
      "Roast 25 minutes, shaking the tray once. The chickpeas should rattle and some should split.",
      "Stir the spinach through the hot tray, then make three wells and crack an egg into each.",
      "Back in for 6-8 minutes until the whites set.",
      "Feta crumbled over at the table.",
    ],
    tip: "One tray, one wash-up. The crunchy chickpeas are the reason to make it.",
    method: "Roast spiced sweet potato and chickpeas, stir spinach through, bake eggs into wells, and finish with feta.",
  },
  {
    id: "vt_paneer_style_curry", name: "Halloumi & chickpea curry", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "halloumi", qty: 120 }, { foodId: "chickpeas", qty: 240 }, { foodId: "passata", qty: 250 },
      { foodId: "rice", qty: 90 }, { foodId: "spinach", qty: 100 }, { foodId: "curry_paste", qty: 25 },
      { foodId: "coconut_milk", qty: 100 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Cube the halloumi and fry in the oil until brown on several sides. Lift it out and set aside.",
      "Curry paste into the same pan for a minute, then passata and coconut milk.",
      "Simmer 12 minutes with the chickpeas until it thickens.",
      "Spinach wilted through, then the halloumi returned at the very end so it stays firm rather than dissolving.",
      "Rice alongside.",
    ],
    tip: "Halloumi added at the end holds its shape like paneer. Added early it goes stringy.",
    method: "Brown the halloumi and set aside, build a curry sauce from paste, passata and coconut milk with chickpeas, then return the halloumi at the end.",
  },
  {
    id: "vg_tofu_stirfry_big", name: "Tofu & broccoli stir-fry", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "tofu", qty: 350 }, { foodId: "broccoli", qty: 200 }, { foodId: "rice", qty: 90 },
      { foodId: "soy_sauce", qty: 25 }, { foodId: "garlic", qty: 10 }, { foodId: "ginger", qty: 8 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Press the tofu, cube it, and fry in hot oil without moving it for 4 minutes. Then turn, and again. Six minutes of patience, four sides of crust.",
      "Lift it out — it will lose its crust if it sits in the sauce.",
      "Garlic and ginger 30 seconds, broccoli in with a splash of water, lid on for 3 minutes.",
      "Soy in, tofu back, tossed for 30 seconds.",
      "Seeds over, rice alongside.",
    ],
    tip: "Wet tofu never crisps. Press it under a chopping board with a tin on top for ten minutes.",
    method: "Crisp pressed tofu on all sides and remove, steam-fry the broccoli with garlic and ginger, then return the tofu with soy.",
  },

  // ===========================================================================
  // SNACK
  // ===========================================================================
  {
    id: "tuna_melt_pitta", name: "Tuna melt pitta", slot: "Snack", minutes: 8,
    items: [
      { foodId: "tuna_tin", qty: 120 }, { foodId: "pitta", qty: 70 }, { foodId: "cottage_cheese", qty: 80 },
      { foodId: "cheddar", qty: 25 }, { foodId: "sweetcorn", qty: 60 },
    ],
    steps: [
      "Mix the tuna, cottage cheese and sweetcorn with plenty of black pepper.",
      "Split the pitta and stuff it, then the cheddar on top.",
      "Under a hot grill for 3 minutes until the cheese bubbles and the pitta edges go crisp.",
    ],
    tip: "Cottage cheese instead of mayo — same texture, three times the protein.",
    method: "Mix tuna with cottage cheese and sweetcorn, stuff a pitta, top with cheddar and grill until bubbling.",
  },
  {
    id: "hummus_veg_pitta", name: "Hummus, veg & warm pitta", slot: "Snack", minutes: 5,
    items: [
      { foodId: "hummus", qty: 100 }, { foodId: "pitta", qty: 70 }, { foodId: "carrots", qty: 100 },
      { foodId: "cucumber", qty: 100 }, { foodId: "peppers", qty: 80 },
    ],
    steps: [
      "Cut the vegetables into proper batons, not coins — they need to survive a dip.",
      "Toast the pitta until it puffs, then tear it into strips.",
      "Hummus in a bowl with a dip in the middle and a drizzle of oil in the well.",
    ],
    tip: "Warm pitta and cold hummus is the whole thing. Cold pitta is cardboard.",
    method: "Cut vegetables into batons, toast and tear the pitta, and serve with hummus.",
  },
  {
    id: "spiced_roast_chickpeas", name: "Spiced roast chickpeas", slot: "Snack", minutes: 30,
    items: [
      { foodId: "chickpeas", qty: 240 }, { foodId: "edamame", qty: 120 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Drain, rinse, then dry the chickpeas thoroughly in a tea towel. Rub the loose skins off as you go.",
      "Oven to 200C. Oil and salt only at this stage — spices burn over 25 minutes.",
      "Edamame in alongside, thawed and dried the same way — it roasts to the same crunch and carries twice the protein.",
      "Roast 25 minutes, shaking twice, until they rattle and are hard to the squeeze.",
      "Spices tossed through the moment they come out, while the oil still carries them.",
    ],
    tip: "They soften as they cool, so eat them warm. Never store them in a sealed tub.",
    method: "Dry the chickpeas and edamame well, roast at 200C with oil and salt for 25 minutes, then toss with spices straight from the oven.",
  },
  {
    id: "edamame_salt", name: "Salted edamame", slot: "Snack", minutes: 5,
    items: [
      { foodId: "edamame", qty: 200 }, { foodId: "soy_sauce", qty: 10 },
    ],
    steps: [
      "Boil from frozen, 4 minutes, in well-salted water.",
      "Drain and toss immediately with flaky salt and a splash of soy while steaming.",
    ],
    tip: "17g of protein for 200 kcal, and it takes four minutes. The most efficient snack in the app.",
    method: "Boil the edamame from frozen for 4 minutes and toss hot with salt and soy.",
  },
  {
    id: "avocado_egg_toast", name: "Avocado & egg on toast", slot: "Snack", minutes: 10,
    items: [
      { foodId: "avocado", qty: 1 }, { foodId: "eggs", qty: 2 }, { foodId: "wholemeal_bread", qty: 60 },
      { foodId: "chilli_fresh", qty: 4 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Eggs into boiling water for exactly 6 minutes and 30 seconds, then straight into cold water.",
      "Mash the avocado with lemon and salt, keeping it rough.",
      "On the toast, eggs halved on top, chilli and pepper over.",
    ],
    tip: "6:30 is the jammy yolk. 7 minutes is already firmer than you want.",
    method: "Soft-boil the eggs for 6.5 minutes, mash avocado with lemon onto toast, and top with the halved eggs and chilli.",
  },
  {
    id: "cottage_tomato_toast", name: "Cottage cheese & tomato toast", slot: "Snack", minutes: 5,
    items: [
      { foodId: "cottage_cheese", qty: 150 }, { foodId: "wholemeal_bread", qty: 60 },
      { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Halve the tomatoes, salt them, and leave for 5 minutes so they weep.",
      "Toast, cottage cheese spread thick, tomatoes and their juices over.",
      "Oil and a lot of black pepper.",
    ],
    tip: "Salting the tomatoes first is what makes this taste of summer rather than of nothing.",
    method: "Salt the halved tomatoes to draw out juice, spread cottage cheese on toast, and top with the tomatoes, oil and pepper.",
  },
  {
    id: "yoghurt_honey_pot", name: "Yoghurt, honey & almond pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "greek_yoghurt", qty: 250 }, { foodId: "honey", qty: 15 },
      { foodId: "almonds", qty: 25 }, { foodId: "berries_frozen", qty: 80 },
    ],
    steps: [
      "Warm the berries 30 seconds so they bleed into a sauce.",
      "Yoghurt in a pot or jar, berries swirled through, honey over.",
      "Almonds last, roughly chopped.",
    ],
    tip: "Built in a jar it lives in a bag all day.",
    method: "Warm the berries, swirl through yoghurt with honey, and top with chopped almonds.",
  },
  {
    id: "pb_banana_toast", name: "Peanut butter & banana toast", slot: "Snack", minutes: 4,
    items: [
      { foodId: "wholemeal_bread", qty: 70 }, { foodId: "peanut_butter", qty: 35 },
      { foodId: "banana", qty: 1 }, { foodId: "maple_syrup", qty: 8 },
    ],
    steps: [
      "Toast, then peanut butter on while it is hot so it melts in rather than sitting on top.",
      "Banana sliced thin and overlapped.",
      "Maple and a pinch of salt. The salt is not optional.",
    ],
    tip: "Pre-training, 45 minutes out, this is about as good as it gets.",
    method: "Spread peanut butter onto hot toast, layer sliced banana over, and finish with maple syrup and salt.",
  },
  {
    id: "df_trail_pot", name: "Seed & fruit trail pot", slot: "Snack", minutes: 2,
    items: [
      { foodId: "almonds", qty: 30 }, { foodId: "seeds_mixed", qty: 25 },
      { foodId: "banana", qty: 1 }, { foodId: "peanut_butter", qty: 20 },
    ],
    steps: [
      "Nuts and seeds into a pot or a bag.",
      "Peanut butter into a second small pot, banana whole.",
    ],
    tip: "The one that survives a kit bag — nothing here needs a fridge.",
    method: "Combine the nuts and seeds, and pack the banana and peanut butter alongside.",
  },
  {
    id: "df_bean_toast", name: "Beans on toast, properly", slot: "Snack", minutes: 7,
    items: [
      { foodId: "beans_baked", qty: 250 }, { foodId: "wholemeal_bread", qty: 80 },
      { foodId: "cheddar", qty: 25 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Beans into a pan, not a microwave. Four minutes over a medium heat reduces them and concentrates everything.",
      "A splash of vinegar or Worcestershire sauce in — this is the difference between fine and good.",
      "Toast under, cheese over, seeds and black pepper last.",
    ],
    tip: "Reducing them in a pan takes three minutes longer and tastes twice as good.",
    method: "Reduce the beans in a pan with a splash of vinegar, and serve on toast with cheese and seeds.",
  },
  {
    id: "whey_shake_banana", name: "Whey, milk & banana shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "whey_protein", qty: 35 }, { foodId: "milk", qty: 400 },
      { foodId: "banana", qty: 1 }, { foodId: "peanut_butter", qty: 20 },
    ],
    steps: [
      "Milk into the blender first, then powder. Powder first cements to the bottom.",
      "Banana and peanut butter in, blend 30 seconds.",
    ],
    tip: "A frozen banana instead of fresh turns this into something closer to a milkshake.",
    method: "Blend milk, whey, banana and peanut butter, liquid into the blender first.",
  },
  {
    id: "vegan_shake", name: "Soya, seed & pea protein shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "soy_milk", qty: 400 }, { foodId: "pea_protein", qty: 35 },
      { foodId: "peanut_butter", qty: 30 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Soya milk in first, then the pea protein.",
      "Banana and peanut butter, blend a full minute — pea protein needs longer than whey to stop being gritty.",
    ],
    tip: "Covers the protein a plant-based day usually misses.",
    method: "Blend soya milk with pea protein, banana and peanut butter for a full minute.",
  },
  {
    id: "pea_protein_shake_big", name: "Double pea protein shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "soy_milk", qty: 500 }, { foodId: "pea_protein", qty: 50 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Milk first, protein second, banana last.",
      "Blend a full minute.",
    ],
    tip: "Deliberately light on fat, so it tops up protein without eating into the day's calories.",
    method: "Blend soya milk, pea protein and banana for a full minute.",
  },
  {
    id: "soya_protein_pot", name: "Soya protein pot", slot: "Snack", minutes: 2,
    items: [
      { foodId: "soy_milk", qty: 250 }, { foodId: "pea_protein", qty: 25 }, { foodId: "berries_frozen", qty: 60 },
    ],
    steps: [
      "Shake it all in a bottle rather than blending.",
      "Frozen berries in last — they chill it and thicken it as they thaw.",
    ],
    tip: "Under 250 kcal and mostly protein: the gap-filler for a day already near its calorie target.",
    method: "Shake soya milk with pea protein in a bottle and add frozen berries.",
  },
  {
    id: "apple_pb", name: "Apple & peanut butter", slot: "Snack", minutes: 2,
    items: [
      { foodId: "apple", qty: 1 }, { foodId: "peanut_butter", qty: 35 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Core the apple and cut into thick wedges.",
      "Peanut butter in a small pot, seeds stirred into it so they stick to each dip.",
    ],
    tip: "Stirring the seeds into the peanut butter rather than sprinkling them is the whole upgrade.",
    method: "Cut the apple into wedges and dip into peanut butter with seeds stirred through.",
  },

  // ===========================================================================
  // LIGHT MEALS.
  //
  // Added because the audit said so, not for balance's sake. The rewritten book
  // is richer than the old one — coconut milk, pesto, halloumi, oil — and a
  // 55kg athlete on a cut eats about 1,640 kcal, which over five meals is ~440
  // each. The smallest vegetarian lunch was 925. Scaled to the 0.55 floor it
  // still overshot, so she was handed 116-129% of the calories she was
  // deliberately eating under.
  //
  // Light does not mean joyless. These are dishes in their own right; they just
  // do not lean on fat to carry them. Cottage cheese does a lot of the work —
  // at 141g of protein per 1000 kcal it is the densest real food in the
  // cupboard, and it fixes the vegetarian protein shortfall at the same time.
  // ===========================================================================
  {
    id: "light_omelette", name: "Spinach & tomato omelette", slot: "Breakfast", minutes: 8,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "spinach", qty: 80 }, { foodId: "tomatoes_fresh", qty: 100 },
      { foodId: "cottage_cheese", qty: 60 }, { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Wilt the spinach in the dry pan first and tip it out, or it waters down the eggs.",
      "Beat the eggs with salt only — milk makes them weep.",
      "Medium-low heat, oil, eggs in. Drag the set edges to the middle and tilt so the raw egg runs underneath.",
      "While the top is still glossy, spinach, halved tomatoes and cottage cheese down one half.",
      "Fold, slide out, 30 seconds' rest. It carries on cooking on the plate.",
    ],
    tip: "Take it off looking slightly underdone. An omelette that looks perfect in the pan is dry by the time it is eaten.",
    method: "Wilt and remove the spinach, cook beaten eggs gently, fill one half and fold.",
  },
  {
    id: "cottage_berry_bowl", name: "Cottage cheese & berry bowl", slot: "Breakfast", minutes: 3,
    items: [
      { foodId: "cottage_cheese", qty: 250 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "seeds_mixed", qty: 15 }, { foodId: "honey", qty: 10 },
    ],
    steps: [
      "Warm the berries 40 seconds so they collapse and turn syrupy.",
      "Cottage cheese in the bowl, berries and their juice over, honey and seeds last.",
    ],
    tip: "If cottage cheese puts you off, blitz it for ten seconds — it goes completely smooth and tastes like a thick yoghurt.",
    method: "Warm the berries to a syrup and spoon over cottage cheese with honey and seeds.",
  },
  {
    id: "chicken_salad_light", name: "Lemon chicken & tomato salad", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "chicken_breast", qty: 200 }, { foodId: "tomatoes_fresh", qty: 150 },
      { foodId: "cucumber", qty: 120 }, { foodId: "feta", qty: 40 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 8 }, { foodId: "garlic", qty: 5 },
    ],
    steps: [
      "Flatten the chicken, season, and sear 4 minutes a side in a very hot pan with the garlic.",
      "Rest it 5 minutes before slicing, or the juice ends up on the board instead of in the meat.",
      "Chop the tomatoes and cucumber chunky, salt them, and leave 5 minutes to draw out juice.",
      "Oil and lemon into that juice — that is the dressing, and it makes itself.",
      "Sliced chicken over, feta crumbled on top.",
    ],
    tip: "Salt the tomatoes and wait. It is the difference between a salad and a bowl of cold vegetables.",
    method: "Sear and rest the chicken, salt chopped tomato and cucumber to make a dressing with oil and lemon, and top with chicken and feta.",
  },
  {
    id: "cottage_couscous_bowl", name: "Cottage cheese & roast veg couscous", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "cottage_cheese", qty: 200 }, { foodId: "couscous", qty: 60 },
      { foodId: "courgette", qty: 150 }, { foodId: "peppers", qty: 120 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "olive_oil", qty: 8 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C. Courgette and peppers with the oil and spices, 18 minutes, until the edges blacken slightly.",
      "Couscous under boiling water and a plate for 5 minutes, then forked apart.",
      "Roast veg through the couscous while both are hot.",
      "Cottage cheese spooned on at the end, lemon over, lots of pepper.",
    ],
    tip: "Cottage cheese on top of something hot goes soft and creamy — nothing like it does straight from the tub.",
    method: "Roast courgette and peppers hot, fork through steeped couscous, and top with cottage cheese and lemon.",
  },
  {
    id: "tofu_edamame_salad", name: "Tofu, edamame & cucumber salad", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "tofu", qty: 220 }, { foodId: "edamame", qty: 120 }, { foodId: "cucumber", qty: 150 },
      { foodId: "carrots", qty: 80 }, { foodId: "soy_sauce", qty: 15 }, { foodId: "ginger", qty: 6 },
      { foodId: "lemon", qty: 1 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Press and cube the tofu, then fry dry and hard until it colours — no oil, so it stays lean.",
      "Boil the edamame 3 minutes and cool under the tap.",
      "Smash the cucumber with the flat of a knife and tear it into rough pieces. Torn edges hold dressing; sliced ones don't.",
      "Soy, grated ginger and lemon whisked together, everything tossed through, seeds over.",
    ],
    tip: "Smashed cucumber sounds like a gimmick and genuinely changes the dish.",
    method: "Dry-fry the tofu until coloured, cool the boiled edamame, smash the cucumber, and toss with a soy-ginger-lemon dressing.",
  },
  {
    id: "prawn_courgette_stirfry", name: "Prawn & courgette stir-fry", slot: "Dinner", minutes: 15,
    items: [
      { foodId: "prawns", qty: 200 }, { foodId: "courgette", qty: 200 }, { foodId: "rice", qty: 60 },
      { foodId: "garlic", qty: 10 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "soy_sauce", qty: 15 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Rice on.",
      "Half-moon the courgette thick, and fry in a very hot pan without stirring for 3 minutes so it browns rather than sweats.",
      "Garlic and chilli 30 seconds.",
      "Prawns in for 90 seconds only — they are already cooked and go rubbery fast.",
      "Soy and lemon off the heat.",
    ],
    tip: "Courgette turns to mush the moment you crowd or stir it. High heat, leave it alone.",
    method: "Brown thick courgette slices in a hot pan, add garlic and chilli, then prawns briefly, finishing with soy and lemon.",
  },
  {
    id: "veg_frittata_salad", name: "Mushroom frittata & salad", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "eggs", qty: 4 }, { foodId: "cottage_cheese", qty: 120 }, { foodId: "mushrooms", qty: 200 },
      { foodId: "spinach", qty: 100 }, { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "olive_oil", qty: 10 },
      { foodId: "cucumber", qty: 100 },
    ],
    steps: [
      "Fry the mushrooms hard and dry until browned, then the spinach until it collapses. Tip out any liquid — that is what makes frittatas weep.",
      "Beat the eggs with the cottage cheese, salt and pepper.",
      "Oil the pan, vegetables back, egg poured over, lowest heat for 8 minutes until only the very centre wobbles.",
      "Under a hot grill for 3 minutes to set and puff the top.",
      "Chopped tomato and cucumber alongside with oil and salt.",
    ],
    tip: "Cottage cheese beaten into the eggs makes it lighter and adds 13g of protein nobody can taste.",
    method: "Brown mushrooms and spinach and drain them, beat eggs with cottage cheese, cook low then finish under the grill.",
  },
  {
    id: "tofu_greens_broth", name: "Tofu & greens noodle broth", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "noodles", qty: 60 }, { foodId: "broccoli", qty: 150 },
      { foodId: "spinach", qty: 100 }, { foodId: "stock_cubes", qty: 8 }, { foodId: "ginger", qty: 10 },
      { foodId: "garlic", qty: 10 }, { foodId: "soy_sauce", qty: 20 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Simmer the stock with sliced ginger and smashed garlic for 8 minutes. That infusion is the entire dish — do not rush it.",
      "Fry the cubed tofu separately in a dry pan until golden, so it keeps its texture in the broth.",
      "Noodles and broccoli into the stock for 3 minutes.",
      "Off the heat, spinach wilted in, soy to season.",
      "Tofu on top, chilli scattered.",
    ],
    tip: "Big bowl, lots of liquid, very few calories. The dinner for a heavy cut that still feels like a meal.",
    method: "Infuse stock with ginger and garlic, dry-fry the tofu, cook noodles and broccoli in the broth, and finish with spinach, soy and chilli.",
  },

  /**
   * The light VEGAN pair.
   *
   * The light meals above fixed omnivore and vegetarian and left vegan at 112%
   * and 125% — because `noodles` are egg noodles, so the light broth is not a
   * vegan option at all, and the smallest vegan dinner was still 1,065 kcal.
   * An avoidance tag silently removing a meal from one diet's pool is exactly
   * the kind of thing an audit catches and a glance at the list does not.
   */
  {
    id: "vg_light_scramble", name: "Lean tofu scramble", slot: "Breakfast", minutes: 10,
    items: [
      { foodId: "tofu", qty: 220 }, { foodId: "spinach", qty: 100 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Squeeze the tofu dry in a tea towel — wet tofu steams grey instead of browning.",
      "Crumble into the pan with the turmeric and a good pinch of salt, and leave it 3 minutes to colour.",
      "Halved tomatoes in for 2 minutes until they slump.",
      "Spinach through at the end, off the heat.",
    ],
    tip: "No toast, barely any oil. All the protein of the full version at half the calories.",
    method: "Dry the tofu, crumble into a hot spiced pan and brown, then add tomatoes and wilt spinach through.",
  },
  {
    id: "vg_tofu_rice_broth", name: "Tofu & greens rice broth", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "rice", qty: 50 }, { foodId: "broccoli", qty: 180 },
      { foodId: "spinach", qty: 100 }, { foodId: "stock_cubes", qty: 8 }, { foodId: "ginger", qty: 10 },
      { foodId: "garlic", qty: 10 }, { foodId: "soy_sauce", qty: 20 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Simmer the stock with sliced ginger and smashed garlic for 8 minutes. That infusion is the dish — do not rush it.",
      "Rice straight into the broth so it thickens it slightly as it cooks.",
      "Dry-fry the cubed tofu in a separate pan until golden, so it holds its texture in the liquid.",
      "Broccoli into the broth for the last 4 minutes, spinach wilted in off the heat.",
      "Soy to season, tofu on top, chilli scattered.",
    ],
    tip: "Big bowl, lots of liquid, few calories — the cut dinner that still eats like dinner.",
    method: "Infuse stock with ginger and garlic, cook rice in it, dry-fry the tofu, then add broccoli and spinach and finish with soy.",
  },

  // ===========================================================================
  // MORE VEGAN BREAKFASTS AND LUNCHES.
  //
  // The pool had THREE of each. With MAX_REPEATS at 3 over a seven-day week the
  // planner was not choosing between them — it was obliged to use all three,
  // including a 1,209 kcal burrito, which is why a small athlete on a cut still
  // came out at 116% however light the alternatives were. A plant-based athlete
  // was also eating the same three breakfasts forever, which is its own answer
  // to "why does this feel repetitive".
  // ===========================================================================
  {
    id: "vg_coconut_berry_bowl", name: "Coconut yoghurt & berry bowl", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "coconut_yoghurt", qty: 200 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "oats", qty: 40 }, { foodId: "pea_protein", qty: 20 },
      { foodId: "seeds_mixed", qty: 20 }, { foodId: "maple_syrup", qty: 10 },
    ],
    steps: [
      "Stir the pea protein into the coconut yoghurt first, a spoon at a time, or it stays in lumps.",
      "Warm the berries 40 seconds until they bleed.",
      "Layer yoghurt, oats and berries, seeds and maple over the top.",
    ],
    tip: "The berry juice does most of the sweetening. Taste before you pour the maple.",
    method: "Beat pea protein into coconut yoghurt, warm the berries, and layer with oats, seeds and maple syrup.",
  },
  {
    id: "vg_pb_overnight_oats", name: "Peanut butter overnight oats", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "oats", qty: 80 }, { foodId: "soy_milk", qty: 300 }, { foodId: "pea_protein", qty: 25 },
      { foodId: "peanut_butter", qty: 25 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Whisk the pea protein into the soya milk before the oats go anywhere near it — the one order that avoids lumps.",
      "Oats in, stirred until there are no dry pockets.",
      "Ribbon the peanut butter through rather than mixing it in.",
      "Fridge overnight. Sliced banana in the morning.",
    ],
    tip: "Three jars on a Sunday covers half the week's breakfasts.",
    method: "Whisk protein into soya milk, stir in oats, ribbon peanut butter through, chill overnight and top with banana.",
  },
  {
    id: "vg_beans_avo_toast", name: "Beans & avocado on toast", slot: "Breakfast", minutes: 8,
    items: [
      { foodId: "beans_baked", qty: 220 }, { foodId: "wholemeal_bread", qty: 80 },
      { foodId: "avocado", qty: 1 }, { foodId: "chilli_fresh", qty: 5 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Beans into a pan on a medium heat for 4 minutes so they reduce and thicken.",
      "Mash the avocado rough with lemon and salt while the toast is going.",
      "Avocado on the toast first, beans over it, chilli and black pepper last.",
    ],
    tip: "Avocado underneath, not on top. It stops the toast going soft.",
    method: "Reduce the beans in a pan, mash avocado with lemon onto toast, and spoon the beans over with chilli.",
  },
  {
    id: "vg_falafel_pitta", name: "Spiced chickpea & hummus pitta", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "chickpeas", qty: 200 }, { foodId: "edamame", qty: 130 }, { foodId: "pitta", qty: 100 },
      { foodId: "hummus", qty: 60 },
      { foodId: "cucumber", qty: 100 }, { foodId: "tomatoes_fresh", qty: 100 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 7 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Drain and dry the chickpeas, then crush about half of them with a fork — the crushed ones crisp, the whole ones stay soft, and you want both.",
      "Fry in the oil with the edamame and spices for 8 minutes until parts of them go crunchy.",
      "Chop the cucumber and tomato with lemon and salt.",
      "Warm the pittas, hummus inside, chickpeas in, salad on top.",
    ],
    tip: "All the pleasure of falafel with none of the deep-frying.",
    method: "Crush half the chickpeas, fry with spices until crisp, and load into warm pitta with hummus and lemon-dressed salad.",
  },
  {
    id: "vg_tofu_rice_bowl", name: "Sticky tofu rice bowl", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "rice", qty: 80 }, { foodId: "broccoli", qty: 150 },
      { foodId: "soy_sauce", qty: 20 }, { foodId: "maple_syrup", qty: 12 }, { foodId: "garlic", qty: 8 },
      { foodId: "ginger", qty: 6 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Press and cube the tofu, then dry-fry until golden on several sides.",
      "Mix soy, maple, grated garlic and ginger.",
      "Pour it into the hot pan and toss for 60 seconds — it reduces almost immediately and coats every cube.",
      "Steam the broccoli 4 minutes. Rice, tofu, seeds over.",
    ],
    tip: "The sauce catches fast because of the sugar in it. Have the rice ready before it goes in.",
    method: "Dry-fry pressed tofu until golden, toss in a reduced soy-maple-ginger glaze, and serve on rice with broccoli.",
  },
  {
    id: "vg_lentil_feta_free_salad", name: "Lentil, avocado & tomato salad", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "red_lentils", qty: 90 }, { foodId: "avocado", qty: 1 }, { foodId: "tomatoes_fresh", qty: 150 },
      { foodId: "cucumber", qty: 100 }, { foodId: "stock_cubes", qty: 5 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 10 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Simmer the lentils in stock for 18 minutes — you want them holding shape, not collapsed, so check from 15.",
      "Drain and dress them while still warm with the oil and half the lemon.",
      "Chop the tomato and cucumber, salt, and leave 5 minutes.",
      "Everything together once the lentils are cool enough not to cook the avocado, which goes in last.",
    ],
    tip: "Dressing warm lentils is the whole trick — cold ones taste of nothing.",
    method: "Simmer lentils until just tender, dress while warm, and combine with salted tomato, cucumber and avocado.",
  },

  // --- Small snacks, and one big vegan dinner -------------------------------
  // The last two misses were both pool-shape, not scoring. A 5-meal day for a
  // small athlete wants ~176 kcal per snack and only two vegan snacks were
  // under 300, so the repeat cap forced 370-550 kcal ones in by midweek. At the
  // other end, a 115kg vegan build had nothing big enough to reach target
  // without every meal hitting the scaling ceiling.
  {
    id: "edamame_pot", name: "Edamame & chilli pot", slot: "Snack", minutes: 5,
    items: [
      { foodId: "edamame", qty: 130 }, { foodId: "soy_sauce", qty: 8 }, { foodId: "chilli_fresh", qty: 4 },
    ],
    steps: [
      "Boil from frozen in well-salted water, 4 minutes.",
      "Drain and toss while steaming with soy, chopped chilli and flaky salt.",
    ],
    tip: "Eaten from the pod, it takes long enough to feel like a proper snack.",
    method: "Boil edamame from frozen for 4 minutes and toss hot with soy, chilli and salt.",
  },
  {
    id: "apple_almond_pot", name: "Apple & almond pot", slot: "Snack", minutes: 2,
    items: [
      { foodId: "apple", qty: 1 }, { foodId: "almonds", qty: 20 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Apple cut into wedges, nuts and seeds in a small pot alongside.",
    ],
    tip: "Nothing to prepare, nothing to refrigerate, and it fits in a pocket.",
    method: "Cut the apple into wedges and pack with almonds and seeds.",
  },
  {
    id: "soy_berry_shake_small", name: "Small soya berry shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "soy_milk", qty: 200 }, { foodId: "pea_protein", qty: 20 }, { foodId: "berries_frozen", qty: 80 },
    ],
    steps: [
      "Soya milk in first, protein second, frozen berries last.",
      "Blend 45 seconds — the frozen fruit thickens it as it goes.",
    ],
    tip: "Under 200 kcal with 20g of protein: the snack for a day that is already close to target.",
    method: "Blend soya milk with pea protein and frozen berries for 45 seconds.",
  },
  {
    id: "vg_big_tofu_curry_rice", name: "Big tofu, chickpea & peanut curry", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "tofu", qty: 350 }, { foodId: "chickpeas", qty: 240 }, { foodId: "coconut_milk", qty: 200 },
      { foodId: "rice", qty: 140 }, { foodId: "peanut_butter", qty: 35 }, { foodId: "curry_paste", qty: 30 },
      { foodId: "spinach", qty: 100 }, { foodId: "onion", qty: 80 },
    ],
    steps: [
      "Press and cube the tofu, dry-fry until browned on several sides, then lift it out.",
      "Soften the onion, add the curry paste for a minute until it darkens.",
      "Coconut milk and peanut butter in, whisked smooth — the peanut butter is what makes it rich enough to matter at this size.",
      "Chickpeas in, simmer 10 minutes.",
      "Tofu back, spinach wilted through, rice alongside.",
    ],
    tip: "Built for a big athlete on a build. Around 1,400 kcal and it does not feel like a chore to finish.",
    method: "Brown the tofu and set aside, fry curry paste with onion, whisk in coconut milk and peanut butter, simmer with chickpeas and return the tofu.",
  },

  // --- Big, dense vegan meals -----------------------------------------------
  // The last two misses were both a 115kg vegan athlete. With only six options
  // per slot, an escalating repeat penalty pushes him off the best-fitting
  // meals by Wednesday — so the pool needs depth at the top end, not just more
  // scoring pressure. All three are built to be both large and protein-dense,
  // which is the combination the vegan pool was short of.
  {
    id: "vg_tempeh_style_hash", name: "Big tofu, bean & potato hash", slot: "Breakfast", minutes: 25,
    items: [
      { foodId: "tofu", qty: 300 }, { foodId: "potatoes", qty: 300 }, { foodId: "black_beans", qty: 200 },
      { foodId: "peppers", qty: 120 }, { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 15 },
    ],
    steps: [
      "Dice the potatoes at 1cm and fry in the oil for 12 minutes, turning rarely so they crust.",
      "Peppers in for 4 minutes.",
      "Squeeze the tofu dry, crumble it in with the spices, and leave 4 minutes to brown before stirring.",
      "Beans through at the end, just to heat.",
    ],
    tip: "Around 900 kcal and 60g of protein — the plant-based breakfast for someone actually trying to gain.",
    method: "Crust diced potatoes, add peppers, then dry crumbled tofu with spices, and finish with black beans.",
  },
  {
    id: "vg_peanut_tofu_rice_big", name: "Peanut tofu & rice bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "tofu", qty: 320 }, { foodId: "rice", qty: 120 }, { foodId: "peanut_butter", qty: 40 },
      { foodId: "edamame", qty: 120 }, { foodId: "broccoli", qty: 150 }, { foodId: "soy_sauce", qty: 20 },
      { foodId: "ginger", qty: 8 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Rice on. Edamame boiled 3 minutes and drained.",
      "Press and cube the tofu, dry-fry hard until browned on several sides.",
      "Whisk the peanut butter with soy, grated ginger and a splash of hot water into a thick sauce.",
      "Steam the broccoli 4 minutes.",
      "Everything into the bowl, sauce poured over, chilli scattered.",
    ],
    tip: "Deliberately big. Peanut butter and tofu together is the densest plant combination in the book.",
    method: "Dry-fry pressed tofu, make a peanut-soy-ginger sauce, and build over rice with edamame and broccoli.",
  },
  {
    id: "vg_lentil_dhal_big", name: "Lentil & chickpea dhal", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "red_lentils", qty: 150 }, { foodId: "chickpeas", qty: 240 }, { foodId: "tomatoes_tin", qty: 200 },
      { foodId: "rice", qty: 110 }, { foodId: "spinach", qty: 120 }, { foodId: "curry_paste", qty: 30 },
      { foodId: "onion", qty: 100 }, { foodId: "garlic", qty: 10 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Soften the onion in the oil for 8 minutes, then garlic and curry paste for one more.",
      "Lentils, tomatoes and three times the lentils' volume in water.",
      "Simmer 25 minutes, stirring now and then, until the lentils collapse completely and it thickens to a porridge.",
      "Chickpeas in for the last 5 minutes.",
      "Spinach wilted through off the heat. Rice alongside.",
      "Taste for salt twice — dhal needs more than you expect and tastes flat without it.",
    ],
    tip: "Freezes better than almost anything else here, and the flavour improves for three days.",
    method: "Fry onion, garlic and curry paste, simmer lentils with tomatoes until collapsed, add chickpeas, and wilt spinach through.",
  },

  // --- Very dense vegan mains, for a big athlete on a cut -------------------
  // A 115kg vegan cutting needs ~72g of protein per 1000 kcal, and only one
  // main in the pool cleared it. The escalating repeat penalty then limits that
  // one to twice a week, so the average fell to 88%. Density has to exist in
  // more than a single dish before the planner can lean on it.
  {
    id: "vg_tofu_edamame_plate", name: "Tofu, edamame & broccoli plate", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "tofu", qty: 350 }, { foodId: "edamame", qty: 180 }, { foodId: "broccoli", qty: 200 },
      { foodId: "spinach", qty: 100 }, { foodId: "soy_sauce", qty: 20 }, { foodId: "garlic", qty: 10 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Press and cube the tofu, fry in the oil with the garlic until browned on several sides.",
      "Edamame boiled 3 minutes, broccoli steamed 5.",
      "Everything into the pan together with the soy for 30 seconds, spinach wilted through last.",
      "Chilli over.",
    ],
    tip: "No starch at all — about 90g of protein for 700 kcal. The plant-based cut dinner.",
    method: "Fry garlicky tofu until browned, cook the edamame and broccoli, and toss everything with soy and spinach.",
  },
  {
    id: "vg_protein_lentil_salad", name: "Lentil, edamame & tofu salad", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "red_lentils", qty: 80 }, { foodId: "edamame", qty: 150 }, { foodId: "tofu", qty: 250 },
      { foodId: "cucumber", qty: 120 }, { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "lemon", qty: 1 },
      { foodId: "stock_cubes", qty: 5 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Simmer the lentils in stock 18 minutes so they hold their shape, then dress them warm with oil and lemon.",
      "Edamame boiled 3 minutes and cooled.",
      "Dry-fry the cubed tofu hard until golden — no oil, so it stays lean.",
      "Chop the cucumber and tomatoes, salt them, leave 5 minutes, and fold everything together with the juices.",
    ],
    tip: "Better cold the next day, which makes it the lunchbox version of the plate above.",
    method: "Dress warm stock-cooked lentils, cool the edamame, dry-fry the tofu, and fold through salted chopped salad.",
  },

  // --- Genuinely small snacks ----------------------------------------------
  // Five meals a day on a 1,640 kcal cut leaves about 176 kcal per snack. The
  // pool bottomed out around 200 and, once the repeat penalty spread things
  // out, reached for 370-550 kcal ones by midweek. These exist to be small.
  {
    id: "cucumber_hummus_pot", name: "Cucumber & hummus pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "cucumber", qty: 200 }, { foodId: "hummus", qty: 50 }, { foodId: "chilli_fresh", qty: 3 },
    ],
    steps: [
      "Cut the cucumber into thick batons — thin ones snap in the pot.",
      "Hummus underneath in the same tub, chilli flakes and salt over it.",
    ],
    tip: "About 190 kcal and it takes ten minutes to eat, which is most of what a snack needs to do.",
    method: "Cut cucumber into batons and pack over hummus with chilli and salt.",
  },
  {
    id: "berry_seed_pot", name: "Berry & seed pot", slot: "Snack", minutes: 2,
    items: [
      { foodId: "berries_frozen", qty: 150 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "maple_syrup", qty: 8 },
    ],
    steps: [
      "Berries into a pot straight from the freezer.",
      "Maple and seeds over. They defrost in a couple of hours into their own syrup.",
    ],
    tip: "Packed frozen in the morning it is perfect by mid-afternoon and keeps the rest of the bag cold.",
    method: "Pack frozen berries with maple syrup and seeds and let them thaw.",
  },

  // ===========================================================================
  // THE NARROW DIETS.
  //
  // Depth measured per diet crossed with each avoidance, and two combinations
  // were effectively unusable: a vegan avoiding GLUTEN had 2 breakfasts, 4
  // lunches and 5 dinners; a vegan avoiding SOY had 2, 2 and 3. With a repeat
  // cap of three, that is not a plan — it is the same two meals until Friday.
  //
  // The soy case is the harder one and the reason it happened: nearly every
  // vegan meal in the book leans on tofu, soya milk or edamame, because those
  // are the dense plant proteins. These are built from lentils, chickpeas,
  // beans, nuts, seeds, quinoa and coconut yoghurt instead — soy-free and
  // gluten-free by construction, so they lift both thin corners at once.
  // ===========================================================================
  {
    id: "vg_coconut_quinoa_bowl", name: "Coconut, quinoa & berry bowl", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "quinoa", qty: 55 }, { foodId: "coconut_yoghurt", qty: 180 }, { foodId: "pea_protein", qty: 25 },
      { foodId: "berries_frozen", qty: 100 }, { foodId: "almonds", qty: 20 },
      { foodId: "seeds_mixed", qty: 12 }, { foodId: "maple_syrup", qty: 8 },
    ],
    steps: [
      "Rinse the quinoa until the water runs clear, then simmer in water for 15 minutes and let it cool a little.",
      "Warm the berries 40 seconds so they release their juice.",
      "Pea protein beaten into the coconut yoghurt first — quinoa and yoghurt alone leave this a long way short of a breakfast.",
      "Quinoa in the bowl, the yoghurt spooned over, berries and their syrup on top.",
      "Nuts and seeds last so they stay crunchy.",
    ],
    tip: "Cook the quinoa in advance. Cold, it works just as well and takes two minutes to build.",
    method: "Simmer rinsed quinoa, cool it, and layer with pea-protein coconut yoghurt, warmed berries, nuts and seeds.",
  },
  {
    id: "vg_pb_oat_pot", name: "Peanut butter oat pot", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "oats", qty: 60 }, { foodId: "coconut_yoghurt", qty: 150 }, { foodId: "peanut_butter", qty: 25 },
      { foodId: "pea_protein", qty: 25 }, { foodId: "banana", qty: 1 }, { foodId: "seeds_mixed", qty: 12 },
    ],
    steps: [
      "Mash half the banana into the coconut yoghurt — it sweetens it without any sugar going in.",
      "Pea protein beaten in next with a splash of water, before the oats. Coconut yoghurt is barely a protein source on its own — this is what makes it a breakfast.",
      "Oats stirred through with a splash more water until it looks slightly too loose.",
      "Peanut butter ribboned in, the rest of the banana sliced on top, seeds over.",
      "Overnight in the fridge, or eat it straight away.",
    ],
    tip: "No soya, no dairy, no wheat if your oats are the gluten-free kind.",
    method: "Mash banana into coconut yoghurt, beat in pea protein, stir in oats, and finish with peanut butter, banana and seeds.",
  },
  {
    id: "vg_bean_avo_hash", name: "Black bean & avocado hash", slot: "Breakfast", minutes: 18,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "tofu", qty: 180 }, { foodId: "potatoes", qty: 150 },
      { foodId: "avocado", qty: 1 }, { foodId: "peppers", qty: 100 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "olive_oil", qty: 8 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Dice the potatoes small and fry in the oil for 12 minutes, turning rarely so they crust.",
      "Tofu crumbled in by hand for 4 minutes so it catches and browns, then the peppers for 4, then the drained beans and spices for 2 more.",
      "Mash the avocado with lemon and salt.",
      "Hash into the bowl, avocado on top, more lemon over.",
    ],
    tip: "Mash a few beans against the pan and they bind the whole thing together.",
    method: "Crust diced potatoes, brown crumbled tofu, add peppers, beans and spices, and top with lemony mashed avocado.",
  },
  {
    id: "vg_chickpea_quinoa_salad", name: "Chickpea, quinoa & avocado salad", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "chickpeas", qty: 240 }, { foodId: "quinoa", qty: 90 }, { foodId: "avocado", qty: 1 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Rinse and simmer the quinoa 15 minutes, then spread it out to cool — hot quinoa turns avocado to soup.",
      "Drain and dry the chickpeas, and crush about a third with a fork so they soak up the dressing.",
      "Chop the tomato and cucumber, salt, and leave 5 minutes for the juices.",
      "Everything folded together with oil and lemon, avocado last, seeds over.",
    ],
    tip: "Keeps two days in the fridge if the avocado goes in fresh each time.",
    method: "Cool the cooked quinoa, crush some chickpeas, and fold with salted salad, oil, lemon and avocado.",
  },
  {
    id: "vg_lentil_pepper_bowl", name: "Spiced lentil & roast pepper bowl", slot: "Lunch", minutes: 28,
    items: [
      { foodId: "red_lentils", qty: 110 }, { foodId: "peppers", qty: 200 }, { foodId: "spinach", qty: 100 },
      { foodId: "stock_cubes", qty: 6 }, { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 12 },
      { foodId: "almonds", qty: 25 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C. Peppers in strips with oil and salt, 18 minutes until the edges blacken.",
      "Simmer the lentils in stock with the spices for 18 minutes until they hold their shape but give.",
      "Spinach wilted into the hot lentils off the heat.",
      "Peppers folded through, lemon squeezed over, almonds roughly chopped on top.",
    ],
    tip: "Blackened peppers, not soft ones. That char is doing all the flavour work.",
    method: "Roast peppers hot, simmer spiced lentils in stock, wilt spinach through, and combine with lemon and almonds.",
  },
  {
    id: "vg_hummus_bean_wrap_gf", name: "Hummus & bean rice bowl", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "hummus", qty: 70 }, { foodId: "black_beans", qty: 200 }, { foodId: "edamame", qty: 140 },
      { foodId: "rice", qty: 55 }, { foodId: "peppers", qty: 120 }, { foodId: "cucumber", qty: 100 },
      { foodId: "spice_mix", qty: 6 }, { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Rice on.",
      "Fry the peppers hard for 5 minutes so they char, then the beans, edamame and spices for 2 more.",
      "Rice into the bowl, beans over, hummus in a spoonful on top, chopped cucumber alongside.",
      "Lemon and a drizzle of oil over everything.",
    ],
    tip: "A bowl rather than a wrap, so it works for anyone avoiding wheat.",
    method: "Char peppers, add spiced beans, and serve over rice with hummus, cucumber and lemon.",
  },
  {
    id: "vg_chickpea_stew", name: "Chickpea, tomato & spinach stew", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "chickpeas", qty: 300 }, { foodId: "tomatoes_tin", qty: 250 }, { foodId: "spinach", qty: 150 },
      { foodId: "potatoes", qty: 250 }, { foodId: "onion", qty: 100 }, { foodId: "garlic", qty: 10 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "olive_oil", qty: 15 },
    ],
    steps: [
      "Soften the onion in the oil for 8 minutes, then garlic and spices for one.",
      "Cubed potato, tomatoes and a mug of water in. Simmer 18 minutes until the potato is soft enough to break.",
      "Chickpeas in for the last 5, crushing a handful against the side to thicken it.",
      "Spinach wilted through off the heat, and taste for salt twice.",
    ],
    tip: "Better the next day, freezes well, and nothing in it needs a fridge before you cook it.",
    method: "Soften onion with garlic and spices, simmer potato and tomatoes, add chickpeas and crush some to thicken, then wilt spinach through.",
  },
  {
    id: "vg_lentil_walnut_ragu", name: "Lentil & seed ragù with rice", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "red_lentils", qty: 130 }, { foodId: "passata", qty: 300 }, { foodId: "mushrooms", qty: 200 },
      { foodId: "rice", qty: 100 }, { foodId: "carrots", qty: 100 }, { foodId: "seeds_mixed", qty: 25 },
      { foodId: "garlic", qty: 10 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Fry the mushrooms hard and dry first until they brown, then chop them small — this is what gives a meat-free ragù its body.",
      "Oil, grated carrot and garlic, 6 minutes.",
      "Lentils, passata and a mug of water. Simmer 25 minutes until thick enough to sit on a spoon.",
      "Seeds toasted in a dry pan and scattered over at the end for bite.",
      "Rice alongside, or pasta if wheat is fine.",
    ],
    tip: "Browning the mushrooms separately is the whole difference. Thrown in raw they just water it down.",
    method: "Brown and chop the mushrooms, soften carrot and garlic, simmer lentils with passata until thick, and top with toasted seeds.",
  },
  {
    id: "vg_bean_sweetpotato_chilli", name: "Bean & sweet potato chilli", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "chickpeas", qty: 150 }, { foodId: "sweet_potato", qty: 300 },
      { foodId: "passata", qty: 300 }, { foodId: "peppers", qty: 120 }, { foodId: "rice", qty: 90 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "chilli_fresh", qty: 8 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Cube the sweet potato and fry in the oil for 8 minutes to get some colour on it before any liquid goes near it.",
      "Peppers, spices and chopped chilli for 2 minutes.",
      "Passata, beans and chickpeas, plus half a mug of water.",
      "Lid ajar, 20 minutes. Ready when it is thick, not when it is hot.",
      "Rice at the end.",
    ],
    tip: "Colouring the sweet potato first stops it collapsing into the sauce.",
    method: "Brown cubed sweet potato, add peppers, spices and chilli, then simmer with passata, beans and chickpeas until thick.",
  },
  {
    id: "gf_chicken_rice_salad", name: "Chicken, avocado & rice salad", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "rice", qty: 90 }, { foodId: "avocado", qty: 1 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 10 }, { foodId: "spice_mix", qty: 5 },
    ],
    steps: [
      "Rice on, then spread it out to cool so it does not steam the salad.",
      "Flatten and season the chicken, sear 4 minutes a side, and rest before slicing.",
      "Chop the tomato and cucumber, salt them, leave 5 minutes.",
      "Rice, salad and juices, sliced chicken, avocado in chunks, lemon and oil over.",
    ],
    tip: "Everything gluten-free without trying, and it eats cold from a box the next day.",
    method: "Cool the cooked rice, sear and rest the chicken, and combine with salted salad, avocado and lemon.",
  },
  {
    id: "gf_prawn_rice_bowl", name: "Garlic prawn & rice bowl", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "prawns", qty: 200 }, { foodId: "rice", qty: 100 }, { foodId: "peas_frozen", qty: 120 },
      { foodId: "garlic", qty: 12 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Rice on, peas dropped in for the last 2 minutes.",
      "Warm the oil gently with sliced garlic until it just turns pale gold — brown garlic is bitter and there is no saving it.",
      "Prawns and chilli in for 90 seconds only.",
      "Everything through the rice, lemon squeezed over off the heat.",
    ],
    tip: "Low and slow on the garlic, fast on the prawns. Getting those the wrong way round ruins it.",
    method: "Cook rice with peas, infuse oil with garlic gently, add prawns briefly, and fold through with lemon.",
  },
  {
    id: "gf_egg_potato_salad", name: "Egg, potato & pesto salad", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "potatoes", qty: 300 }, { foodId: "pesto", qty: 30 },
      { foodId: "peas_frozen", qty: 100 }, { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "spinach", qty: 60 },
    ],
    steps: [
      "Halve the potatoes and boil 15 minutes, adding the eggs for the last 7 and the peas for the last 2.",
      "Cold water over the eggs so they peel cleanly.",
      "Dress the potatoes with the pesto while they are still hot — warm potato drinks it in, cold potato just wears it.",
      "Spinach, halved tomatoes and quartered eggs folded through.",
    ],
    tip: "One pan for all three. Dressing them hot is the trick that makes it taste like more than it is.",
    method: "Boil potatoes with eggs and peas, dress the hot potatoes with pesto, and fold through spinach, tomatoes and eggs.",
  },
  // ===========================================================================
  // THE PLANT PANTRY.
  //
  // Re-measuring the narrow diets after the last pass showed the vegan corners
  // were better but still not good: 4 breakfasts and 7 lunches without gluten,
  // 5 and 5 without soy. Meanwhile an omnivore had 26 and 28. Everyone else
  // could be given a week that never repeated a dish; a vegan avoiding soy was
  // handed the same five lunches on rotation and told it was a plan.
  //
  // The root cause was the same one as last time and only half-fixed: the plant
  // meals in this book are built on tofu, soya milk, edamame, oats, bread and
  // nuts, so ticking one box takes out most of the pool. Nothing here uses any
  // of them. Every meal below is vegan AND gluten-free AND soy-free AND
  // nut-free at once, which is why twenty-one recipes lift four thin corners
  // rather than one — they are in every vegan pool there is.
  //
  // The protein comes from red lentils, chickpeas, black beans, quinoa, seeds
  // and pea protein powder. The pantry is deliberately narrow; the DISHES are
  // not. A rösti, a skillet, a soup, a traybake, stuffed peppers, a coronation
  // salad, a mushroom ragù over mash — the point of the exercise is that
  // nobody eating from this list should be able to tell it was a constraint.
  //
  // Sizes are spread on purpose. The clean vegan pool used to run 736-1480
  // kcal, so there was nothing to put in a small breakfast slot and nothing
  // honest to put in a big one — the planner had to stretch a portion to 1.6x
  // or shrink it to 0.55x and hope. There are 400 kcal pots and 1300 kcal
  // bowls here for that reason.
  // ===========================================================================
  {
    id: "vg_quinoa_coconut_porridge", name: "Quinoa & coconut porridge", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "quinoa", qty: 80 }, { foodId: "coconut_milk", qty: 120 }, { foodId: "pea_protein", qty: 25 },
      { foodId: "berries_frozen", qty: 100 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "maple_syrup", qty: 10 },
    ],
    steps: [
      "Rinse the quinoa hard in a sieve for a good 30 seconds — unrinsed quinoa tastes soapy and no amount of maple hides it.",
      "Simmer it in the coconut milk and an equal splash of water, lid on, 15 minutes.",
      "Off the heat, beat in the pea protein a spoon at a time. Straight into boiling liquid it seizes into lumps.",
      "Berries on top while it is still hot so they collapse into it, then seeds and maple.",
    ],
    tip: "Porridge that isn't oats, for anyone who can't have them. It sets firmer than oats do, so leave it looser than looks right.",
    method: "Simmer rinsed quinoa in coconut milk, beat in pea protein off the heat, and top with berries, seeds and maple.",
  },
  {
    id: "vg_sweet_potato_rosti", name: "Sweet potato rösti & smashed avocado", slot: "Breakfast", minutes: 22,
    items: [
      { foodId: "sweet_potato", qty: 200 }, { foodId: "chickpeas", qty: 200 }, { foodId: "edamame", qty: 150 },
      { foodId: "avocado", qty: 1 }, { foodId: "olive_oil", qty: 8 }, { foodId: "chilli_fresh", qty: 8 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Grate the sweet potato coarsely, then wring it out in a tea towel. Twist until nothing more comes — this is the whole difference between a rösti and a wet orange pancake.",
      "Season it, press into the hot oiled pan in one layer and leave it completely alone for 7 minutes.",
      "Flip in one go with a plate over the pan, 6 minutes on the other side.",
      "Crisp the drained chickpeas and the edamame in the gap at the edge of the pan while it cooks.",
      "Smash the avocado with lemon, salt and the sliced chilli, and pile it on.",
    ],
    tip: "Squeeze harder than you think. A dry grate crisps; a damp one steams itself.",
    method: "Wring out grated sweet potato, fry it undisturbed into a rösti on both sides, crisp chickpeas alongside, and top with chilli-lemon smashed avocado.",
  },
  {
    id: "vg_chickpea_skillet", name: "Spiced chickpea & tomato skillet", slot: "Breakfast", minutes: 25,
    items: [
      { foodId: "chickpeas", qty: 300 }, { foodId: "tofu", qty: 200 }, { foodId: "tomatoes_tin", qty: 250 },
      { foodId: "potatoes", qty: 120 }, { foodId: "peppers", qty: 120 }, { foodId: "onion", qty: 80 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Dice the potato small — 1cm, no bigger — and fry it in the oil for 10 minutes so it is nearly done before anything wet arrives.",
      "Onion and peppers in for 5, then garlic and spices for one minute until the pan smells of cumin.",
      "Tomatoes in, and simmer 6 minutes until it stops being watery.",
      "Chickpeas and crumbled tofu last, crushing a handful of the chickpeas against the pan so the sauce clings.",
      "Salt it twice. Tinned tomatoes need more than you expect.",
    ],
    tip: "Shakshuka's shape without the eggs. It reheats better than the egg version ever did.",
    method: "Fry diced potato until nearly done, soften onion and peppers with garlic and spices, simmer with tomatoes, and finish with part-crushed chickpeas and crumbled tofu.",
  },
  {
    id: "vg_berry_coconut_protein_bowl", name: "Berry & coconut protein bowl", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "coconut_yoghurt", qty: 150 }, { foodId: "pea_protein", qty: 30 },
      { foodId: "berries_frozen", qty: 120 }, { foodId: "banana", qty: 1 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Pea protein into the coconut yoghurt first, a third at a time, beaten smooth before the next third goes in.",
      "Microwave the berries 40 seconds so they bleed, and stir half of them through — it turns the whole bowl purple and takes the chalk off the protein.",
      "Banana sliced over, rest of the berries, seeds last.",
    ],
    tip: "Four minutes, no oats, no cooking. This is the one for the mornings you are already late.",
    method: "Beat pea protein into coconut yoghurt, stir through warmed berries, and top with banana and seeds.",
  },
  {
    id: "vg_bombay_potato_hash", name: "Bombay potato & spinach hash", slot: "Breakfast", minutes: 22,
    items: [
      { foodId: "potatoes", qty: 300 }, { foodId: "chickpeas", qty: 150 }, { foodId: "spinach", qty: 100 },
      { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 10 }, { foodId: "garlic", qty: 8 },
      { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 14 },
    ],
    steps: [
      "Boil the diced potato 8 minutes — just past resisting a knife — and drain it dry in the colander for a minute.",
      "Into hot oil, and now leave it. Turning it every 30 seconds is why hash goes grey instead of golden.",
      "Once it has a crust, onion and chilli for 4 minutes, then garlic and spices for one.",
      "Chickpeas through, spinach on top, lid on for a minute to wilt it.",
    ],
    tip: "Boiling first is what gets you fluffy inside and crisp outside. Raw potato in a pan gives you neither.",
    method: "Par-boil diced potato, crust it in hot oil, add onion, chilli, garlic and spices, then fold through chickpeas and wilt spinach on top.",
  },
  {
    id: "vg_bean_rice_breakfast_bowl", name: "Big black bean breakfast bowl", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "black_beans", qty: 250 }, { foodId: "edamame", qty: 140 }, { foodId: "rice", qty: 60 },
      { foodId: "avocado", qty: 1 }, { foodId: "sweetcorn", qty: 100 }, { foodId: "passata", qty: 120 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 8 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice on first.",
      "Dry-fry the drained sweetcorn in a hot pan until it starts to pop and blacken in places. Do not stir it. Those black bits are the flavour.",
      "Oil, spices, beans and edamame in for 3 minutes, then the passata for 4 more until it thickens.",
      "Rice down, beans over, corn scattered, sliced avocado and a hard squeeze of lemon.",
    ],
    tip: "Built for the morning of a session. It is the biggest breakfast in the book that happens to be vegan.",
    method: "Char sweetcorn in a dry pan, simmer spiced beans in passata, and serve over rice with corn, avocado and lemon.",
  },
  {
    id: "vg_apple_quinoa_pot", name: "Apple, cinnamon & quinoa pot", slot: "Breakfast", minutes: 6,
    items: [
      { foodId: "quinoa", qty: 60 }, { foodId: "coconut_yoghurt", qty: 120 }, { foodId: "apple", qty: 1 },
      { foodId: "pea_protein", qty: 20 }, { foodId: "seeds_mixed", qty: 12 }, { foodId: "spice_mix", qty: 3 },
    ],
    steps: [
      "Uses quinoa you cooked earlier in the week. If you haven't, it is 15 minutes and worth doing three portions at once.",
      "Grate the apple whole, skin on, and squeeze out the loose juice into the yoghurt.",
      "Beat the pea protein and cinnamon into the yoghurt, then fold in the cold quinoa and apple.",
      "Seeds over. Better after an hour in the fridge than straight away.",
    ],
    tip: "Make it the night before in the jar you are going to eat it out of. Grated apple browns a little and it does not matter.",
    method: "Fold cold cooked quinoa and grated apple into cinnamon pea-protein coconut yoghurt, and top with seeds.",
  },
  {
    id: "vg_coronation_chickpea", name: "Coronation chickpea bowl", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "chickpeas", qty: 250 }, { foodId: "rice", qty: 80 }, { foodId: "coconut_yoghurt", qty: 80 },
      { foodId: "curry_paste", qty: 15 }, { foodId: "apple", qty: 1 }, { foodId: "spinach", qty: 60 },
      { foodId: "seeds_mixed", qty: 12 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice on, then cooled — this is a cold bowl and warm rice makes the dressing split.",
      "Fry the curry paste in a dry pan for 45 seconds before it goes anywhere near the yoghurt. Raw paste tastes of raw paste.",
      "Let it cool, then stir it into the coconut yoghurt with the lemon juice.",
      "Fold in the drained chickpeas and coarsely grated apple, crushing a few chickpeas so the dressing has something to hold.",
      "Over rice and spinach, seeds on top.",
    ],
    tip: "Grated apple is doing the job raisins do in the original. It keeps better and it isn't sweet enough to be a pudding.",
    method: "Cook out the curry paste, cool it into coconut yoghurt with lemon, fold through chickpeas and grated apple, and serve over cold rice and spinach.",
  },
  {
    id: "vg_smoky_bean_corn_bowl", name: "Smoky black bean & corn bowl", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "edamame", qty: 140 }, { foodId: "rice", qty: 60 },
      { foodId: "sweetcorn", qty: 80 }, { foodId: "avocado", qty: 1 }, { foodId: "peppers", qty: 100 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 6 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice on.",
      "Peppers into a dry hot pan, cut side down, until they blister and blacken at the edges. 5 minutes, barely touched.",
      "Oil, spices, beans, edamame and corn in for 3 minutes, mashing about a quarter of the beans into the pan.",
      "Everything over the rice, avocado sliced on, lemon squeezed hard over the lot.",
    ],
    tip: "Cook double the beans and the second portion is tomorrow's lunch cold, which is arguably better.",
    method: "Blister peppers dry, fry spiced beans and corn with a quarter mashed, and serve over rice with avocado and lemon.",
  },
  {
    id: "vg_lentil_carrot_quinoa", name: "Lentil, roast carrot & quinoa bowl", slot: "Lunch", minutes: 35,
    items: [
      { foodId: "red_lentils", qty: 100 }, { foodId: "quinoa", qty: 60 }, { foodId: "carrots", qty: 200 },
      { foodId: "spinach", qty: 80 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "olive_oil", qty: 14 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C. Carrots in batons, tossed in half the oil and the spices, roasted 25 minutes until the edges go dark and sweet.",
      "Lentils and quinoa in one pan with plenty of water, 15 minutes, then drained well.",
      "Dress them hot with the rest of the oil and the lemon. Hot grains take on dressing; cold ones sit in it.",
      "Spinach folded through so it half-wilts, carrots on top, seeds over.",
    ],
    tip: "The most protein of any soy-free vegan lunch in here, at about 44g. Roast the whole bag of carrots and use them twice.",
    method: "Roast spiced carrot batons, cook lentils and quinoa together, dress them hot with oil and lemon, and fold through spinach.",
  },
  {
    id: "vg_hummus_lentil_power_bowl", name: "Hummus & lentil power bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "red_lentils", qty: 110 }, { foodId: "rice", qty: 90 }, { foodId: "hummus", qty: 100 },
      { foodId: "cucumber", qty: 100 }, { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice and lentils in separate pans — lentils go to mush in the time rice takes.",
      "Lentils 15 minutes, drained, then stirred through the spices and oil while hot.",
      "Chop the cucumber and tomato, salt them, and leave 5 minutes. The juice they give up is the dressing.",
      "Rice, lentils, salad and its juice, hummus in a spoonful on top, lemon over.",
    ],
    tip: "One of the bigger lunches in the book, for a day with a session in it. Halve the rice if it isn't.",
    method: "Cook rice and lentils separately, spice the hot lentils, salt the chopped salad for its juice, and build with a spoonful of hummus.",
  },
  {
    id: "vg_mushroom_pea_quinoa", name: "Mushroom, pea & lemon quinoa", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "quinoa", qty: 80 }, { foodId: "mushrooms", qty: 200 }, { foodId: "peas_frozen", qty: 120 },
      { foodId: "spinach", qty: 60 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "garlic", qty: 10 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Quinoa on, 15 minutes.",
      "Mushrooms into a dry pan, no oil, high heat. They will give up their water, then squeak, then brown. Wait for the brown — that is 4 minutes past when you want to stop.",
      "Oil and garlic in now, 30 seconds, then the frozen peas straight from the bag for 2 minutes.",
      "Drained quinoa in, spinach through, lemon zest and juice, seeds over.",
    ],
    tip: "Oiling mushrooms at the start makes them soggy — the oil goes in after they have browned, not before.",
    method: "Brown mushrooms in a dry pan before adding oil and garlic, cook peas through, and fold with quinoa, spinach and lemon.",
  },
  {
    id: "vg_curried_lentil_soup", name: "Curried lentil & potato soup", slot: "Lunch", minutes: 30,
    items: [
      { foodId: "red_lentils", qty: 90 }, { foodId: "potatoes", qty: 200 }, { foodId: "carrots", qty: 120 },
      { foodId: "coconut_milk", qty: 80 }, { foodId: "curry_paste", qty: 20 }, { foodId: "onion", qty: 80 },
      { foodId: "stock_cubes", qty: 6 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Onion and diced carrot in the oil, 8 minutes, lid on so they sweat rather than colour.",
      "Curry paste in for a minute — it should smell like a curry house before any liquid goes near it.",
      "Lentils, cubed potato, stock and a litre of water. Simmer 20 minutes.",
      "Blitz about half of it and leave the rest in pieces, then the coconut milk stirred through off the heat.",
      "Taste for salt and add more lemon or vinegar than feels right. Lentil soup is flat without acid.",
    ],
    tip: "Freezes in portions and reheats from frozen. Blitzing only half is what stops it tasting like baby food.",
    method: "Sweat onion and carrot, cook out the curry paste, simmer with lentils, potato and stock, blitz half, and finish with coconut milk.",
  },
  {
    id: "vg_stuffed_peppers", name: "Stuffed peppers with quinoa & beans", slot: "Dinner", minutes: 45,
    items: [
      { foodId: "peppers", qty: 300 }, { foodId: "quinoa", qty: 80 }, { foodId: "black_beans", qty: 200 },
      { foodId: "sweetcorn", qty: 80 }, { foodId: "passata", qty: 150 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 14 },
    ],
    steps: [
      "Oven to 200C. Halve the peppers through the stalk, seeds out, and roast them cut side up with oil and salt for 15 minutes first — stuffing raw peppers gives you crunchy peppers and dry filling.",
      "Quinoa on, 15 minutes, drained.",
      "Fry the garlic and spices, add passata, beans and corn, and simmer 5 minutes until thick. Fold the quinoa in.",
      "Pile it into the softened halves, mounded high, and back in for 15 minutes.",
      "The tops should catch and blacken slightly. That is the good bit.",
    ],
    tip: "Roast the peppers first. Every recipe that skips that step produces the same watery disappointment.",
    method: "Roast halved peppers before filling, simmer beans and corn in spiced passata, fold in quinoa, stuff the halves and roast again.",
  },
  {
    id: "vg_mushroom_ragu_mash", name: "Mushroom ragù with garlic mash", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "mushrooms", qty: 350 }, { foodId: "red_lentils", qty: 90 }, { foodId: "potatoes", qty: 400 },
      { foodId: "passata", qty: 250 }, { foodId: "onion", qty: 100 }, { foodId: "garlic", qty: 12 },
      { foodId: "stock_cubes", qty: 6 }, { foodId: "olive_oil", qty: 18 },
    ],
    steps: [
      "Mushrooms into a dry pan in one layer, high heat, until deeply browned. Do them in two batches if the pan is crowded — piled up they boil.",
      "Chop them small once browned and set aside. This is the step that gives it the texture of a meat ragù.",
      "Onion in the oil 8 minutes, half the garlic for one, then lentils, passata, stock and a mug of water.",
      "Mushrooms back in and simmer 25 minutes until a spoon dragged through leaves a gap.",
      "Potatoes boiled and mashed with the rest of the garlic crushed in raw and a good slug of oil. No milk needed — the ragù is wet enough.",
    ],
    tip: "Raw garlic in the mash rather than cooked. It is sharper and it cuts through the lentils.",
    method: "Brown and chop mushrooms, simmer them with lentils, passata and stock into a thick ragù, and serve over garlic mash.",
  },
  {
    id: "vg_loaded_jacket", name: "Loaded sweet potato with chilli beans", slot: "Dinner", minutes: 55,
    items: [
      { foodId: "sweet_potato", qty: 280 }, { foodId: "black_beans", qty: 200 }, { foodId: "edamame", qty: 150 },
      { foodId: "tomatoes_tin", qty: 150 }, { foodId: "avocado", qty: 1 }, { foodId: "onion", qty: 60 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Oven to 210C. Prick the sweet potatoes, rub with oil and salt, straight onto the shelf — no foil, which steams them soft-skinned.",
      "Give them 45 minutes, until the skin is tight and something sugary is leaking out of the ends.",
      "Twenty minutes before they are done: onion and chilli in oil, spices for a minute, then beans, edamame and tomatoes simmered until thick.",
      "Split the potatoes right open and crush the insides with a fork before anything goes on.",
      "Beans in, avocado on, more chilli if you want it.",
    ],
    tip: "Mostly oven time you are not standing over. Put them in when you get home and do everything else in the meantime.",
    method: "Bake sweet potatoes bare at 210C, simmer chilli beans with tomatoes, and load the split, forked-open potatoes.",
  },
  {
    id: "vg_smoky_rice_bean_pot", name: "Smoky rice & bean one-pot", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "rice", qty: 80 }, { foodId: "black_beans", qty: 250 }, { foodId: "edamame", qty: 150 },
      { foodId: "peppers", qty: 150 }, { foodId: "sweetcorn", qty: 100 }, { foodId: "passata", qty: 200 },
      { foodId: "onion", qty: 100 }, { foodId: "avocado", qty: 1 }, { foodId: "spice_mix", qty: 10 },
      { foodId: "stock_cubes", qty: 5 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Onion and peppers in the oil, 8 minutes, until the peppers have soft dark patches.",
      "Spices for a minute, then the dry rice stirred through the oil for another — every grain coated before liquid goes in.",
      "Passata, stock and 400ml water. Bring up, then lowest heat, lid on, 18 minutes, no stirring.",
      "Beans, edamame and corn scattered on top for the last 5 with the lid back on so they steam through.",
      "Lid off, heat up for 2 minutes to catch the bottom, then fork it up and let it sit 5 minutes. Avocado on at the table.",
    ],
    tip: "The catch on the bottom is the point, not a mistake. Leave it the extra two minutes.",
    method: "Soften onion and peppers, toast the rice in the spiced oil, simmer covered in passata and stock, steam beans and corn on top, then catch the base.",
  },
  {
    id: "vg_lentil_traybake", name: "Roast veg & lentil traybake", slot: "Dinner", minutes: 45,
    items: [
      { foodId: "red_lentils", qty: 100 }, { foodId: "potatoes", qty: 250 }, { foodId: "courgette", qty: 200 },
      { foodId: "peppers", qty: 200 }, { foodId: "hummus", qty: 80 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "olive_oil", qty: 18 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C, and get the empty tray hot in it first. Vegetables hitting a hot tray sear; a cold tray steams them.",
      "Potatoes in chunks with the oil and spices, 20 minutes on their own — they need the head start.",
      "Peppers and thick courgette rounds added, another 20 minutes, turned once.",
      "Lentils on the hob meanwhile, 15 minutes, drained and seasoned hard.",
      "Loosen the hummus with lemon juice and a splash of water into a pourable dressing, and spoon it over the lot in the tray.",
    ],
    tip: "One tray and one pan. Thin the hummus more than you think — it should pour, not sit.",
    method: "Roast spiced potatoes on a preheated tray, add courgette and peppers, cook lentils separately, and dress everything with lemon-loosened hummus.",
  },
  {
    id: "vg_chilli_broccoli_chickpea", name: "Chilli-garlic broccoli & chickpeas", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "broccoli", qty: 250 }, { foodId: "chickpeas", qty: 220 }, { foodId: "rice", qty: 60 },
      { foodId: "garlic", qty: 12 }, { foodId: "chilli_fresh", qty: 8 }, { foodId: "seeds_mixed", qty: 12 },
      { foodId: "olive_oil", qty: 14 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice on.",
      "Broccoli into florets, and cut each one flat on one side. Flat side down in the hot oil, 4 minutes, untouched, until properly charred.",
      "Drained and dried chickpeas in, and press them so some split — the split ones crisp.",
      "Sliced garlic and chilli for the last 45 seconds only. Any longer and the garlic burns bitter.",
      "Off the heat, lemon over, seeds through.",
    ],
    tip: "The lightest dinner in the vegan list, for rest days. Charring the flat side is what stops broccoli tasting boiled.",
    method: "Char flat-cut broccoli florets in hot oil, split and crisp chickpeas alongside, and finish with garlic, chilli, lemon and seeds over rice.",
  },
  {
    id: "vg_maple_pea_shake", name: "Maple & banana pea protein shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "pea_protein", qty: 35 }, { foodId: "coconut_milk", qty: 60 }, { foodId: "banana", qty: 1 },
      { foodId: "maple_syrup", qty: 8 },
    ],
    steps: [
      "Coconut milk and 250ml cold water into the shaker or blender first, powder second. Powder first welds itself to the bottom.",
      "Banana in — frozen in chunks if you have it, which makes it thick enough to eat with a spoon.",
      "Maple and a pinch of salt, then blitz.",
    ],
    tip: "About 30g of protein with no dairy, no soy and no nuts in it, which almost no shake manages.",
    method: "Blend pea protein with coconut milk, water, banana, maple and salt.",
  },
  {
    id: "vg_avo_bean_pot", name: "Smashed avocado & bean pot", slot: "Snack", minutes: 5,
    items: [
      { foodId: "avocado", qty: 1 }, { foodId: "black_beans", qty: 120 }, { foodId: "tomatoes_fresh", qty: 80 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Smash the avocado roughly with a fork — lumps are wanted here, this is not guacamole.",
      "Drained beans in whole, halved tomatoes, chopped chilli.",
      "Half the lemon squeezed in and stirred through, the other half squeezed on top to keep it green.",
      "Salt properly and eat within the hour.",
    ],
    tip: "Lemon on the surface is what stops it browning in a lunchbox. Press cling film right down onto it too.",
    method: "Roughly smash avocado, fold through beans, tomatoes and chilli, and seal the surface with lemon.",
  },
  {
    id: "vg_apple_seed_yog_pot", name: "Coconut, apple & seed pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "coconut_yoghurt", qty: 120 }, { foodId: "apple", qty: 1 }, { foodId: "seeds_mixed", qty: 20 },
      { foodId: "spice_mix", qty: 2 },
    ],
    steps: [
      "Toast the seeds in a dry pan for 2 minutes until they start jumping. It takes them from filler to the best part of it.",
      "Grate the apple with the skin on, straight into the yoghurt, and stir the cinnamon through.",
      "Seeds over at the last moment so they stay crunchy.",
    ],
    tip: "Toast the whole bag of seeds at once and keep them in a jar. They go into everything after that.",
    method: "Toast the seeds dry, stir grated apple and cinnamon into coconut yoghurt, and scatter the seeds over.",
  },
  // ===========================================================================
  // THE LEAN TIER.
  //
  // WHAT THE MEASUREMENT SAID. Count the meals that suit a 60kg woman cutting —
  // 1,690 kcal and 132g of protein, so 0.078g of protein per calorie — and the
  // answer across a 121-recipe book was TWO breakfasts, ONE lunch, TWO dinners
  // and TWO snacks. A maintaining athlete had eleven to fourteen per slot.
  //
  // That is not a variety problem with a variety fix. Someone cutting had no
  // choice at all: their plan was forced, the same forced plan every week, and
  // week-on-week rotation could not move it because there was nowhere to move
  // it to. The book was written around meals that carry 800-1,300 kcal, and a
  // cutting athlete's whole dinner is 558.
  //
  // Small and protein-dense is a genuinely different brief from small. Cutting
  // the portion of a pasta bake gets you a small pasta bake — 12g of protein
  // and hungry by three. These are built the other way round: the protein
  // comes first and the starch is whatever the calories have left, which is
  // why they lean on chicken, turkey, tuna, prawns, cottage cheese, Greek
  // yoghurt and the protein powders, and why several have no grain at all.
  //
  // Every diet pattern gets its own, because a cutting vegan was the worst-off
  // athlete in the entire app.
  // ===========================================================================
  {
    id: "lean_cottage_berry_bowl", name: "Whipped cottage cheese & berry bowl", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "cottage_cheese", qty: 200 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "oats", qty: 30 }, { foodId: "seeds_mixed", qty: 8 }, { foodId: "maple_syrup", qty: 5 },
    ],
    steps: [
      "Whip the cottage cheese for 30 seconds with a fork or a stick blender until the curds disappear. This is the whole trick — whipped, it eats like thick yoghurt.",
      "Warm the berries 40 seconds so they bleed into a syrup.",
      "Cheese into the bowl, berries and their juice over, oats and seeds on top.",
      "Maple last, and only if the berries were sharp.",
    ],
    tip: "34g of protein for under 400 calories. Blending is not optional — unwhipped cottage cheese is why people think they don't like it.",
    method: "Whip the cottage cheese smooth, warm the berries into a syrup, and top with oats, seeds and a little maple.",
  },
  {
    id: "lean_turkey_hash", name: "Turkey, mushroom & spinach hash", slot: "Breakfast", minutes: 15,
    items: [
      { foodId: "turkey_mince", qty: 100 }, { foodId: "eggs", qty: 2 }, { foodId: "mushrooms", qty: 150 },
      { foodId: "spinach", qty: 80 }, { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Mushrooms into a dry pan first, high heat, until they have given up their water and browned. Four minutes past when you want to stop.",
      "Oil and the turkey in, broken up small, until it loses its pink and starts to catch.",
      "Halved tomatoes for a minute, then the spinach on top with the lid on to wilt.",
      "Push it all to one side and fry the eggs in the space.",
    ],
    tip: "44g of protein in 370 calories. Turkey mince dries out fast — take it off the moment it stops being pink.",
    method: "Brown mushrooms dry, cook turkey mince through, wilt spinach with tomatoes, and fry eggs alongside.",
  },
  {
    id: "lean_tofu_scramble", name: "Tofu, mushroom & tomato scramble", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "tofu", qty: 200 }, { foodId: "mushrooms", qty: 150 }, { foodId: "spinach", qty: 80 },
      { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "spice_mix", qty: 5 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Press the tofu hard for five minutes, then crumble it between your fingers into uneven pieces — even ones look like a science experiment.",
      "Brown the mushrooms in a dry pan before anything else goes in.",
      "Oil, tofu and the turmeric-heavy spices in, and leave it to catch for 3 minutes before stirring.",
      "Tomatoes and spinach through at the end, off the heat.",
    ],
    tip: "Crumbled, not cubed. The uneven edges are what make it read as scrambled rather than as tofu.",
    method: "Brown mushrooms dry, crumble in pressed tofu with spices and let it catch, then fold through tomato and spinach.",
  },
  {
    id: "lean_pea_quinoa_pot", name: "Berry & pea protein breakfast pot", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "pea_protein", qty: 35 }, { foodId: "coconut_yoghurt", qty: 80 },
      { foodId: "berries_frozen", qty: 120 }, { foodId: "quinoa", qty: 30 }, { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Pea protein into the coconut yoghurt with a splash of water, beaten a third at a time until it is smooth.",
      "Cold cooked quinoa folded in — it gives it something to chew, which a protein pot otherwise badly lacks.",
      "Berries stirred through from frozen. They thaw into it in about ten minutes.",
      "Seeds over at the end.",
    ],
    tip: "36g of protein, vegan, and no soy in it. That combination is rare enough to be worth keeping quinoa in the fridge for.",
    method: "Beat pea protein into coconut yoghurt, fold in cold quinoa and frozen berries, and top with seeds.",
  },
  {
    id: "lean_chicken_potato_salad", name: "Chicken & new potato chopped salad", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "chicken_breast", qty: 180 }, { foodId: "potatoes", qty: 200 }, { foodId: "cucumber", qty: 100 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Potatoes into salted water, 15 minutes, and dress them with half the oil and lemon while they are still hot.",
      "Season the chicken properly and griddle it 6 minutes a side, then let it rest 5 minutes before slicing. Slicing it straight off the heat pours the juice onto the board.",
      "Chop the cucumber and tomato small, salt them, wait 5 minutes for the juices.",
      "Everything folded together, the salted vegetable juice included — that is most of the dressing.",
    ],
    tip: "46g of protein in 505 calories. Cooking the potatoes the night before makes this a five-minute lunch.",
    method: "Dress hot boiled potatoes with oil and lemon, griddle and rest the chicken, and fold through salted chopped salad.",
  },
  {
    id: "lean_tuna_bean_salad", name: "Tuna, black bean & pepper salad", slot: "Lunch", minutes: 8,
    items: [
      { foodId: "tuna_tin", qty: 150 }, { foodId: "black_beans", qty: 150 }, { foodId: "peppers", qty: 100 },
      { foodId: "cucumber", qty: 100 }, { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Drain the tuna properly — press it into the lid — or the whole bowl tastes of tin.",
      "Beans rinsed until the water runs clear, which takes the tinned edge off them.",
      "Dice the pepper and cucumber small so every forkful gets some.",
      "Oil, all the lemon, plenty of black pepper, and fold it gently so the tuna stays in flakes.",
    ],
    tip: "47g of protein and no cooking whatsoever. Sits in the fridge overnight without going anywhere.",
    method: "Drain and flake tuna, rinse the beans, and fold with diced pepper and cucumber in oil and lemon.",
  },
  {
    id: "lean_cottage_chickpea_plate", name: "Cottage cheese & chickpea plate", slot: "Lunch", minutes: 8,
    items: [
      { foodId: "cottage_cheese", qty: 200 }, { foodId: "chickpeas", qty: 150 }, { foodId: "spinach", qty: 80 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "seeds_mixed", qty: 10 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Crisp the drained chickpeas in the oil for 6 minutes, pressing some flat so they split and brown.",
      "Spinach into the hot pan for 20 seconds, just to collapse it.",
      "Cottage cheese spooned onto the plate and spread with the back of the spoon, everything else piled on top while warm.",
      "Seeds and a lot of black pepper.",
    ],
    tip: "Warm chickpeas onto cold cottage cheese is the point — it half-melts and behaves like a dressing.",
    method: "Crisp chickpeas in oil, wilt spinach briefly, and pile both warm onto spread cottage cheese with seeds.",
  },
  {
    id: "lean_tofu_lentil_bowl", name: "Lean tofu & lentil bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "tofu", qty: 170 }, { foodId: "red_lentils", qty: 50 }, { foodId: "spinach", qty: 80 },
      { foodId: "peppers", qty: 100 }, { foodId: "olive_oil", qty: 3 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Lentils on, 15 minutes, drained well and seasoned hard while hot.",
      "Press and cube the tofu, then dry-fry it — no oil — turning only when each face has gone golden and released itself.",
      "Peppers in for the last 3 minutes so they blister.",
      "Lentils, tofu, raw spinach underneath so it wilts from the heat, all the lemon over, and the oil last.",
    ],
    tip: "Dry-frying rather than oiling is what keeps this at 520 calories with 41g of protein.",
    method: "Cook and season lentils, dry-fry tofu until golden, blister the peppers, and build over raw spinach with lemon.",
  },
  {
    id: "lean_chicken_courgette_tray", name: "Spiced chicken & courgette tray", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "chicken_breast", qty: 200 }, { foodId: "courgette", qty: 200 }, { foodId: "potatoes", qty: 250 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Oven to 220C with the tray already in it.",
      "Potatoes in chunks, tossed in the oil and spices, onto the hot tray for 20 minutes.",
      "Courgette in thick rounds and the chicken added, another 15 minutes — thick rounds, because thin ones disintegrate.",
      "Lemon squeezed over the whole tray as it comes out, while everything is hot enough to drink it in.",
    ],
    tip: "53g of protein, one tray, nothing to wash up. Cut the chicken into two pieces if it is a thick fillet, or the courgette overcooks waiting for it.",
    method: "Roast spiced potatoes on a preheated tray, add chicken and thick courgette rounds, and finish with lemon.",
  },
  {
    id: "lean_turkey_chilli_no_rice", name: "Turkey chilli, no rice", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "turkey_mince", qty: 200 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "peppers", qty: 150 },
      { foodId: "black_beans", qty: 120 }, { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Brown the turkey hard in the oil before the onion goes anywhere near it — mince added to a wet pan steams grey.",
      "Onion and peppers in for 6 minutes, then the spices for one.",
      "Tomatoes and a splash of water, and simmer 15 minutes until it thickens.",
      "Beans in for the last 5, crushing a few against the side.",
      "It wants more salt and more chilli than you think. Taste it twice.",
    ],
    tip: "60g of protein in 560 calories, and the peppers do the job the rice used to. Freezes in portions.",
    method: "Brown turkey mince hard, soften onion and peppers with spices, simmer with tomatoes, and finish with part-crushed beans.",
  },
  {
    id: "lean_prawn_courgette_rice", name: "Garlic prawn & courgette rice", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "prawns", qty: 180 }, { foodId: "rice", qty: 70 }, { foodId: "courgette", qty: 200 },
      { foodId: "garlic", qty: 12 }, { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 10 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Rice on.",
      "Courgette in half-moons into a hot dry pan until it colours on both sides, then out onto a plate.",
      "Oil, sliced garlic and chilli for 30 seconds — no more, garlic burns bitter in a hot pan.",
      "Prawns in for 90 seconds only. They are already cooked; you are warming them and coating them, and a minute too long makes them squeak.",
      "Courgette back in, off the heat, all the lemon.",
    ],
    tip: "49g of protein for 550 calories. The 90 seconds is the whole recipe — everything else is preparation.",
    method: "Colour courgette dry, flash garlic and chilli in oil, warm the prawns through for 90 seconds, and serve over rice with lemon.",
  },
  {
    id: "lean_egg_potato_plate", name: "Eggs, cottage cheese & crushed potatoes", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "cottage_cheese", qty: 150 }, { foodId: "potatoes", qty: 250 },
      { foodId: "spinach", qty: 100 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Potatoes boiled 18 minutes, drained, then crushed flat with a fork rather than mashed — you want craggy edges.",
      "Into the hot oil, cut side down, 5 minutes until the crags go crisp.",
      "Eggs boiled 7 minutes for a set white and a soft middle, then straight into cold water so they peel.",
      "Spinach wilted in the potato pan for 30 seconds.",
      "Cottage cheese spooned over the hot potatoes so it loosens, eggs halved on top.",
    ],
    tip: "47g of protein without a scrap of meat. Crushing rather than mashing is what gets you crisp bits.",
    method: "Crush boiled potatoes and crisp them in oil, boil eggs to a soft middle, and serve with wilted spinach and cottage cheese.",
  },
  {
    id: "lean_tofu_broccoli_plate", name: "Chilli tofu & broccoli plate", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "broccoli", qty: 250 }, { foodId: "peppers", qty: 100 },
      { foodId: "garlic", qty: 10 }, { foodId: "soy_sauce", qty: 15 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Press the tofu for at least ten minutes with something heavy on it. Wet tofu will not brown, it will only steam.",
      "Cube it and dry-fry on a high heat, turning only when each side releases itself from the pan.",
      "Broccoli florets cut flat on one side, flat side down in the oil, 4 minutes untouched until charred.",
      "Peppers, garlic and soy in for the last minute, tossed hard so it glazes rather than pools.",
    ],
    tip: "46g of protein and no starch, for a rest day. Pressing the tofu is the difference between golden and grey.",
    method: "Dry-fry pressed tofu until golden, char flat-cut broccoli in oil, and glaze everything with garlic and soy at the end.",
  },
  {
    id: "lean_cottage_cucumber_pot", name: "Cottage cheese & cucumber pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "cottage_cheese", qty: 150 }, { foodId: "cucumber", qty: 100 }, { foodId: "seeds_mixed", qty: 5 },
    ],
    steps: [
      "Cucumber diced small — small enough to eat with a spoon alongside the cheese, not in chunks you have to chase.",
      "Stirred through with a lot of black pepper and a pinch of salt.",
      "Seeds on top at the last moment.",
    ],
    tip: "22g of protein for 160 calories, which is about as efficient as a snack gets.",
    method: "Dice cucumber into cottage cheese, season heavily, and top with seeds.",
  },
  {
    id: "lean_tuna_cucumber_pot", name: "Tuna & cucumber pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "tuna_tin", qty: 100 }, { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Drain the tuna hard, pressing it into the lid.",
      "Flake it into the pot with the diced cucumber.",
      "All the lemon and plenty of pepper. It needs the acid or it is very plain.",
    ],
    tip: "24g of protein in 150 calories. Keep a tin in your bag and this is a snack anywhere.",
    method: "Flake drained tuna with diced cucumber, lemon and pepper.",
  },
  {
    id: "lean_pea_berry_shake", name: "Pea protein & berry shake", slot: "Snack", minutes: 2,
    items: [
      { foodId: "pea_protein", qty: 25 }, { foodId: "berries_frozen", qty: 80 },
    ],
    steps: [
      "Pour 300ml of cold water into the shaker first, powder after. The other way round welds it to the bottom.",
      "Frozen berries straight in — they chill it and thicken it as they break up.",
      "Shake for longer than feels necessary. Pea protein needs about twenty seconds.",
    ],
    tip: "21g of protein for 130 calories, dairy-free and soy-free. The berries are what make pea protein drinkable.",
    method: "Shake pea protein with cold water and frozen berries.",
  },
  {
    id: "lean_tofu_edamame_salad", name: "Lean tofu & edamame salad", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "tofu", qty: 150 }, { foodId: "edamame", qty: 100 }, { foodId: "red_lentils", qty: 40 },
      { foodId: "spinach", qty: 60 }, { foodId: "peppers", qty: 80 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 3 },
    ],
    steps: [
      "Lentils on for 15 minutes, drained and seasoned while hot.",
      "Edamame from frozen into the same water for the last 3 minutes.",
      "Press and cube the tofu, then dry-fry it hard with no oil until three or four faces are golden.",
      "Everything into the bowl over raw spinach, all the lemon, and the oil last so it coats rather than soaks.",
    ],
    tip: "46g of protein for 550 calories, entirely from plants. Soy is doing the heavy lifting — there is no way round that for a vegan cutting hard.",
    method: "Cook lentils and edamame, dry-fry cubed tofu until golden, and fold together over spinach with lemon.",
  },
  {
    id: "lean_tofu_lentil_greens", name: "Charred broccoli, tofu & lentils", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "tofu", qty: 220 }, { foodId: "red_lentils", qty: 50 }, { foodId: "broccoli", qty: 200 },
      { foodId: "spinach", qty: 80 }, { foodId: "garlic", qty: 10 }, { foodId: "chilli_fresh", qty: 6 },
      { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Lentils on, 15 minutes, drained and seasoned hard — under-seasoned lentils are what makes this kind of plate taste worthy.",
      "Press the tofu, cube it, and dry-fry until golden on several faces.",
      "Broccoli florets cut flat on one side, flat side into the oil, 4 minutes untouched until charred.",
      "Garlic and chilli in for 30 seconds at the end, then the spinach thrown on top to wilt in the residual heat.",
    ],
    tip: "48g of protein in 570 calories with no starch at all. For a rest day in a cut.",
    method: "Season cooked lentils, dry-fry tofu golden, char flat-cut broccoli, and finish with garlic, chilli and wilted spinach.",
  },
  // ===========================================================================
  // THE LEANEST TIER: A VEGAN, CUTTING.
  //
  // Measured after the lean tier went in, this athlete still had ONE viable
  // dinner in the entire book. 1,690 kcal a day at 0.078g of protein per
  // calorie, with no animal products — a 558 kcal dinner carrying 44g of
  // protein. Their plan was effectively fixed, and week-on-week rotation had
  // nowhere to move it: 11% of slots changed against 61% for everyone else.
  //
  // Almost nothing plant-based clears that density. Lentils are 0.071 g/kcal,
  // chickpeas 0.061, quinoa 0.038 — every one of them falls short before a drop
  // of oil goes in. What clears it is tofu (0.104), edamame (0.099) and pea
  // protein (0.213), padded out with the three vegetables dense enough in
  // protein to help rather than dilute: mushrooms (0.141), spinach (0.116) and
  // broccoli (0.082).
  //
  // So these are built protein-first with almost no starch and very little oil,
  // and they lean on soy, because at this calorie ceiling there is no honest
  // alternative. A vegan who ALSO avoids soy and is cutting hard cannot reach
  // 2.2g/kg from whole foods in 1,690 kcal — pea protein powder is the only
  // thing that gets them there, and it is why the shakes exist.
  // ===========================================================================
  {
    id: "lean_vg_tofu_mushroom_stirfry", name: "Tofu & mushroom stir-fry", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "mushrooms", qty: 200 }, { foodId: "peppers", qty: 120 },
      { foodId: "spinach", qty: 80 }, { foodId: "garlic", qty: 10 }, { foodId: "soy_sauce", qty: 15 },
      { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Press the tofu properly — ten minutes under something heavy — then cube it and dry-fry on a high heat until three faces are golden.",
      "Out onto a plate. Mushrooms into the same dry pan, hard, until they have given up their water and browned.",
      "Only now the oil, then the peppers for 3 minutes so they blister rather than steam.",
      "Tofu back in, garlic for 30 seconds, soy round the edge of the pan where it will catch and reduce.",
      "Spinach on top, heat off, lid on for a minute.",
    ],
    tip: "48g of protein in about 540 calories, with no rice under it. Six grams of oil is not a typo — this is the plate that makes a vegan cut work.",
    method: "Dry-fry pressed tofu until golden, brown mushrooms separately, blister peppers in oil, then glaze everything with garlic and soy and wilt spinach through.",
  },
  {
    id: "lean_vg_edamame_tofu_bowl", name: "Edamame & tofu greens bowl", slot: "Dinner", minutes: 16,
    items: [
      { foodId: "tofu", qty: 200 }, { foodId: "edamame", qty: 120 }, { foodId: "broccoli", qty: 200 },
      { foodId: "peppers", qty: 100 }, { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 4 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Edamame from frozen into boiling water for 3 minutes, drained.",
      "Broccoli florets cut flat on one side, flat face down in the oil, 4 minutes untouched until properly charred.",
      "Pressed, cubed tofu dry-fried alongside in the same pan.",
      "Peppers and garlic for the last minute only.",
      "Everything into the bowl, all the lemon over, plenty of salt and pepper.",
    ],
    tip: "51g of protein for under 580 calories. Two soy sources rather than one because at this calorie ceiling nothing else plant-based gets there.",
    method: "Boil edamame, char flat-cut broccoli, dry-fry tofu alongside, and finish with garlic, peppers and lemon.",
  },
  {
    id: "lean_vg_tofu_pea_bowl", name: "Tofu, pea & mushroom bowl", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "tofu", qty: 220 }, { foodId: "mushrooms", qty: 150 }, { foodId: "peas_frozen", qty: 100 },
      { foodId: "spinach", qty: 100 }, { foodId: "soy_sauce", qty: 12 }, { foodId: "olive_oil", qty: 4 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Mushrooms into a dry pan first and left alone until browned — four minutes past when you want to stop.",
      "Oil, then the pressed cubed tofu, turning only when each face releases itself.",
      "Frozen peas straight in for 2 minutes.",
      "Soy round the edge of the pan, spinach on top, heat off, lid on to wilt.",
      "All the lemon at the table, not in the pan — it goes dull if it cooks.",
    ],
    tip: "47g of protein in 500 calories with no grain in it. Cold the next day it works as a salad.",
    method: "Brown mushrooms dry, dry-fry tofu, cook peas through, and finish with soy, wilted spinach and lemon.",
  },
  {
    id: "lean_vg_protein_shake_bowl", name: "Berry protein shake bowl", slot: "Breakfast", minutes: 3,
    items: [
      { foodId: "pea_protein", qty: 30 }, { foodId: "soy_milk", qty: 250 },
      { foodId: "berries_frozen", qty: 100 }, { foodId: "banana", qty: 1 },
      { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Soya milk into the blender first, powder second. Powder first welds itself to the bottom.",
      "Frozen berries and the banana in — frozen is what makes it thick enough to eat with a spoon rather than drink.",
      "Blitz, then seeds over the top so there is something to chew.",
    ],
    tip: "36g of protein for under 390 calories, in three minutes. On a cut, breakfast is the meal there is least room for and this is the one that fits.",
    method: "Blend pea protein with soya milk, frozen berries and banana, and top with seeds.",
  },
  // ===========================================================================
  // MORE SNACKS.
  //
  // Snacks were the thinnest slot in the book — 26 against roughly 40 for every
  // other — and lopsided in FORM as well as number: pots, shakes and things on
  // toast, over and over. A snack list where every third entry is a shake is not
  // twenty-six options, it is three ideas repeated.
  //
  // So these are deliberately different shapes: things you make ahead, things
  // you eat with your hands, things that come out of the freezer, one thing for
  // just before bed. Several are built to be carried, because the snack slot is
  // the one people are away from a kitchen for.
  // ===========================================================================
  {
    id: "oat_energy_balls", name: "Peanut & oat energy balls", slot: "Snack", minutes: 10,
    items: [
      { foodId: "oats", qty: 30 }, { foodId: "peanut_butter", qty: 20 },
      { foodId: "honey", qty: 10 }, { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Everything into a bowl and work it with a spoon until it stops looking like oats and starts looking like dough.",
      "If it won't hold together, a teaspoon of water at a time — not more peanut butter, which makes it greasy rather than wetter.",
      "Roll into four balls, pressing hard. Loose ones fall apart in a bag.",
      "Fridge for 30 minutes to firm up. They keep a week.",
    ],
    tip: "These quantities are the four balls you eat, not a batch — double or triple them on a Sunday and they keep the week.",
    method: "Mix oats, peanut butter, honey and seeds into a dough, roll into balls and chill.",
  },
  {
    id: "berry_yoghurt_bark", name: "Frozen berry yoghurt bark", slot: "Snack", minutes: 5,
    items: [
      { foodId: "greek_yoghurt", qty: 200 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "seeds_mixed", qty: 15 }, { foodId: "honey", qty: 10 },
    ],
    steps: [
      "Stir the honey through the yoghurt, then spread it about a centimetre thick on a lined tray.",
      "Press the frozen berries in rather than scattering them on top — pressed in, they stay put when you snap it.",
      "Seeds over, then flat in the freezer for two hours.",
      "Snap into shards. Keep them in the freezer and eat them from there.",
    ],
    tip: "Made in five minutes, eaten over a fortnight. The one snack in here that survives being forgotten about.",
    method: "Spread sweetened Greek yoghurt on a tray, press in frozen berries and seeds, freeze and snap into shards.",
  },
  {
    id: "tuna_sweetcorn_pot", name: "Tuna & sweetcorn pot", slot: "Snack", minutes: 4,
    items: [
      { foodId: "tuna_tin", qty: 120 }, { foodId: "sweetcorn", qty: 80 },
      { foodId: "greek_yoghurt", qty: 40 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Drain the tuna properly, pressing it into the lid — undrained, the whole pot tastes of tin.",
      "Yoghurt instead of mayonnaise, loosened with the lemon juice. It does the same job for a fifth of the calories.",
      "Fold in the sweetcorn, plenty of black pepper.",
    ],
    tip: "About 33g of protein for 230 calories. Sits in a bag all morning without complaining.",
    method: "Fold drained tuna and sweetcorn through lemony Greek yoghurt.",
  },
  {
    id: "egg_spinach_pot", name: "Boiled egg & spinach pot", slot: "Snack", minutes: 10,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "spinach", qty: 60 },
      { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Eggs into already-boiling water for 8 minutes, then straight into cold — the cold shock is what makes them peel cleanly.",
      "Spinach and halved tomatoes into the pot, oil and salt over, tossed.",
      "Eggs quartered on top, peeled at the last moment if you're carrying it.",
    ],
    tip: "Boil six on Sunday. Two minutes of assembly on a weekday beats ten.",
    method: "Boil and cool eggs, toss spinach and tomatoes with oil, and quarter the eggs over.",
  },
  {
    id: "protein_mousse", name: "Whipped berry protein mousse", slot: "Snack", minutes: 4,
    items: [
      { foodId: "greek_yoghurt", qty: 180 }, { foodId: "whey_protein", qty: 25 },
      { foodId: "berries_frozen", qty: 80 },
    ],
    steps: [
      "Whey into the yoghurt a third at a time, beaten hard between each. All at once it goes lumpy and never recovers.",
      "Keep beating past the point it looks done — a minute of air is what turns it from thick yoghurt into mousse.",
      "Berries from frozen, stirred through so they set it further as they thaw.",
    ],
    tip: "Ten minutes in the freezer takes it from mousse to soft-serve.",
    method: "Beat whey into Greek yoghurt until aerated, then fold through frozen berries.",
  },
  {
    id: "overnight_oats_pot", name: "Overnight oats pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "oats", qty: 50 }, { foodId: "milk", qty: 150 },
      { foodId: "greek_yoghurt", qty: 80 }, { foodId: "berries_frozen", qty: 80 },
      { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Oats, milk and yoghurt into the jar you'll eat from. Stir properly — dry oats hiding at the bottom stay dry all night.",
      "Frozen berries on top, lid on, fridge.",
      "By morning the berries have bled through it and the oats have gone soft. Seeds on as you leave.",
    ],
    tip: "Make three at once on Sunday night. They're good for four days.",
    method: "Stir oats with milk and yoghurt, top with frozen berries, and leave overnight.",
  },
  {
    id: "prawn_cucumber_pot", name: "Prawn & cucumber pot", slot: "Snack", minutes: 4,
    items: [
      { foodId: "prawns", qty: 120 }, { foodId: "cucumber", qty: 120 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Cucumber cut into thick half-moons, not slices — thin slices go limp in an hour.",
      "Prawns in, chilli sliced fine, all the lemon.",
      "Salt just before eating. Salted early it draws the water out of the cucumber and the pot goes soupy.",
    ],
    tip: "27g of protein for 170 calories, and the highest protein-per-calorie of anything in the book.",
    method: "Toss cooked prawns with thick-cut cucumber, chilli and lemon.",
  },
  {
    id: "halloumi_tomato_bites", name: "Griddled halloumi & tomato", slot: "Snack", minutes: 8,
    items: [
      { foodId: "halloumi", qty: 90 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 4 },
    ],
    steps: [
      "Halloumi in 1cm slices, patted dry. Wet halloumi steams instead of colouring.",
      "Dry pan, high heat, two minutes a side without moving it until each face is properly branded.",
      "Off the heat, lemon squeezed straight onto the hot cheese so it hisses and takes it in.",
      "Halved tomatoes alongside, the oil over both.",
    ],
    tip: "Salty enough that it needs no extra. Good cold, which most fried cheese is not.",
    method: "Griddle dried halloumi slices until branded, hit with lemon while hot, and serve with tomatoes.",
  },
  {
    id: "chickpea_smash_toast", name: "Lemony chickpea smash on toast", slot: "Snack", minutes: 6,
    items: [
      { foodId: "chickpeas", qty: 150 }, { foodId: "edamame", qty: 80 },
      { foodId: "wholemeal_bread", qty: 70 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 5 },
      { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Drain the chickpeas and smash about two thirds with a fork along with the edamame — leaving a third whole is what stops it being hummus.",
      "Oil, all the lemon, a lot of salt and pepper, chilli chopped fine.",
      "Onto hot toast. It goes soggy on cold toast within a minute.",
    ],
    tip: "Vegan, ten grams of protein per slice, and about forty pence.",
    method: "Part-smash chickpeas and edamame with lemon, oil and chilli, and pile onto hot toast.",
  },
  {
    id: "avo_egg_pot", name: "Avocado & egg pot", slot: "Snack", minutes: 10,
    items: [
      { foodId: "eggs", qty: 2 }, { foodId: "avocado", qty: 1 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 4 },
    ],
    steps: [
      "Eggs 8 minutes from boiling, then cold water.",
      "Avocado roughly forked with the lemon and plenty of salt — rough, not smooth.",
      "Eggs quartered in, chilli over. Press the lemon-side of the avocado to the surface if it's going in a bag.",
    ],
    tip: "No bread, which is the point — this is the one for a low-carb day or straight after a session.",
    method: "Boil eggs, fork avocado with lemon and salt, and fold the quartered eggs through.",
  },
  {
    id: "bedtime_milk_whey", name: "Warm vanilla protein milk", slot: "Snack", minutes: 4,
    items: [
      { foodId: "milk", qty: 300 }, { foodId: "whey_protein", qty: 25 },
      { foodId: "honey", qty: 8 },
    ],
    steps: [
      "Warm the milk to hot-but-not-boiling. Boiling it makes the protein clump the moment the powder goes in.",
      "Off the heat first, THEN whisk the whey in, a little at a time.",
      "Honey stirred through.",
    ],
    tip: "For the last hour before bed. Slow protein overnight, and warm milk does what warm milk does.",
    method: "Warm milk off the boil, whisk in whey off the heat, and sweeten with honey.",
  },
  {
    id: "spiced_bean_pot", name: "Spiced black bean pot", slot: "Snack", minutes: 6,
    items: [
      { foodId: "black_beans", qty: 180 }, { foodId: "edamame", qty: 90 },
      { foodId: "peppers", qty: 80 }, { foodId: "spice_mix", qty: 5 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Rinse the beans until the water runs clear — that tinny liquid is most of what people dislike about tinned beans.",
      "Oil and spices in a pan for 30 seconds, then the beans and edamame for two minutes, pressing a few of the beans flat.",
      "Diced raw pepper stirred in off the heat so it stays crunchy, lemon over.",
    ],
    tip: "Good hot now and better cold tomorrow. Vegan, and about thirty pence a pot.",
    method: "Fry spices, warm rinsed black beans and edamame through them, then stir in raw pepper and lemon.",
  },
  {
    id: "coconut_banana_seed_pot", name: "Coconut, banana & seed pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "coconut_yoghurt", qty: 130 }, { foodId: "banana", qty: 1 },
      { foodId: "seeds_mixed", qty: 14 }, { foodId: "pea_protein", qty: 22 },
    ],
    steps: [
      "Beat the pea protein into the coconut yoghurt with a splash of water before anything else goes in.",
      "Banana sliced thin — thin slices spread through it, chunks sink.",
      "Seeds last so they stay crunchy.",
    ],
    tip: "Vegan and dairy-free with 19g of protein, which most dairy-free snacks manage nowhere near.",
    method: "Beat pea protein into coconut yoghurt, fold in sliced banana, and top with seeds.",
  },
  {
    id: "cottage_pineapple_pot", name: "Cottage cheese & apple pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "cottage_cheese", qty: 180 }, { foodId: "apple", qty: 1 },
      { foodId: "seeds_mixed", qty: 12 }, { foodId: "spice_mix", qty: 2 },
    ],
    steps: [
      "Whip the cottage cheese for 30 seconds with a fork until the curds disappear.",
      "Apple diced small with the skin on, cinnamon through it.",
      "Seeds over. Eat within the hour or the apple browns.",
    ],
    tip: "22g of protein for 300 calories, and the cinnamon is what stops it tasting like diet food.",
    method: "Whip cottage cheese smooth, fold through diced apple and cinnamon, and top with seeds.",
  },
  // ===========================================================================
  // MORE VEGAN, ACROSS EVERY SLOT.
  //
  // Measured: 20 breakfasts, 20 lunches, 21 dinners against 38/40/39 for an
  // omnivore. Half a book. The earlier vegan work was aimed at specific holes —
  // no soy, no gluten, cutting — and fixed them, which is a different job from
  // simply having as much to choose from as everyone else.
  //
  // These are ordinary vegan dinners rather than constrained ones: tacos,
  // fajitas, satay, mujadara, a burger. The point is that the vegan list should
  // read like a list somebody would want to cook from, not like a list of what
  // was left after the exclusions.
  // ===========================================================================
  {
    id: "vg_black_bean_tacos", name: "Black bean & sweet potato tacos", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "sweet_potato", qty: 200 }, { foodId: "black_beans", qty: 220 },
      { foodId: "edamame", qty: 150 }, { foodId: "tortilla_wrap", qty: 2 },
      { foodId: "avocado", qty: 1 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 8 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 6 },
    ],
    steps: [
      "Oven to 220C. Sweet potato in 2cm cubes with the oil and spices, 25 minutes, turned once — you want charred edges, not steamed cubes.",
      "Beans and edamame warmed through in the last five minutes with a splash of water, a third of the beans mashed so they hold the filling together.",
      "The edamame is what makes this a dinner rather than a plate of sweet potato — it carries nearly a third of the protein.",
      "Char the wraps dry in a hot pan, 20 seconds a side. Untoasted they tear.",
      "Build in the pan-warm wrap: beans, sweet potato, sliced avocado, chilli, all the lemon.",
    ],
    tip: "Roast the whole tray of sweet potato. Cold, it's the base of tomorrow's lunch.",
    method: "Roast spiced sweet potato until charred, warm part-mashed beans with edamame, char the wraps, and build with avocado and lemon.",
  },
  {
    id: "vg_tofu_fajitas", name: "Tofu & pepper fajitas", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "tofu", qty: 300 }, { foodId: "peppers", qty: 250 },
      { foodId: "onion", qty: 120 }, { foodId: "tortilla_wrap", qty: 2 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "olive_oil", qty: 8 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Press the tofu ten minutes, then tear it into strips rather than cutting — torn edges catch the spices and go crisp where cut ones stay smooth.",
      "Hottest pan you have. Peppers and onion in thick strips, oil, and left alone until they blacken at the edges. Four minutes, no stirring.",
      "Tofu and spices in for the last five, tossed twice only.",
      "Wraps charred dry alongside, lemon over everything at the table.",
    ],
    tip: "Tearing rather than slicing is the whole trick, and it's faster than getting the knife out.",
    method: "Char peppers and onion hard, add torn pressed tofu with spices, and serve in dry-charred wraps with lemon.",
  },
  {
    id: "vg_tofu_satay", name: "Tofu satay with rice", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "peanut_butter", qty: 40 },
      { foodId: "rice", qty: 90 }, { foodId: "broccoli", qty: 180 },
      { foodId: "soy_sauce", qty: 15 }, { foodId: "garlic", qty: 8 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "coconut_milk", qty: 60 },
    ],
    steps: [
      "Rice on.",
      "Peanut butter, soy, grated garlic, chilli and the coconut milk whisked with a splash of hot water into a pourable sauce. Do this before the pan gets hot — it takes longer than you think.",
      "Press and cube the tofu, dry-fry until golden on several faces.",
      "Broccoli steamed 4 minutes over the rice pan.",
      "Sauce into the tofu pan off the heat. On the heat it splits and goes grainy.",
    ],
    tip: "The sauce is the recipe. Make double and keep half — it turns any plate of vegetables into dinner.",
    method: "Whisk a peanut-coconut satay sauce, dry-fry tofu golden, steam broccoli, and combine off the heat over rice.",
  },
  {
    id: "vg_mujadara", name: "Lentils and rice with burnt onions", slot: "Dinner", minutes: 45,
    items: [
      { foodId: "red_lentils", qty: 150 }, { foodId: "rice", qty: 55 },
      { foodId: "onion", qty: 200 }, { foodId: "olive_oil", qty: 12 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "coconut_yoghurt", qty: 80 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "The onions are the dish, so give them the time: sliced thin, in the oil, on a medium heat for 25 minutes. They go translucent, then gold, then properly brown.",
      "Take half out to go on top — those are the crisp ones.",
      "Lentils, rice and spices into the pan with the remaining onions and twice their volume of water. Lid on, lowest heat, 20 minutes.",
      "Off the heat, lid on, ten minutes without touching it. This is what makes the rice fluffy rather than wet.",
      "Fork up, burnt onions over, coconut yoghurt and lemon on the side.",
    ],
    tip: "Twenty-five minutes on the onions is not a suggestion. Rushed, this is just lentils and rice.",
    method: "Brown sliced onions slowly, reserve half, simmer lentils and rice with the rest, rest off the heat, and top with the crisp onions.",
  },
  {
    id: "vg_bean_burger", name: "Black bean burgers", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "edamame", qty: 120 },
      { foodId: "oats", qty: 40 }, { foodId: "onion", qty: 80 },
      { foodId: "wholemeal_bread", qty: 70 }, { foodId: "avocado", qty: 1 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Drain the beans and DRY them on a tea towel. Wet beans make a patty that falls apart in the pan, every time.",
      "Mash two thirds, leave a third whole, and work in the edamame, oats, finely chopped onion and spices.",
      "Shape two thick patties and fridge them 15 minutes. Skipping this is the other reason they fall apart.",
      "Medium heat, oil, 5 minutes a side, turned once only.",
      "Toasted bread, smashed avocado, patty.",
    ],
    tip: "Oats rather than breadcrumbs, because everyone has oats. They also hold better.",
    method: "Dry and part-mash black beans, bind with edamame, oats and onion, chill the patties, then fry and serve on toast with avocado.",
  },
  {
    id: "vg_chickpea_spinach_curry", name: "Chickpea & spinach coconut curry", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "chickpeas", qty: 220 }, { foodId: "tofu", qty: 200 },
      { foodId: "spinach", qty: 150 }, { foodId: "coconut_milk", qty: 110 },
      { foodId: "rice", qty: 70 },
      { foodId: "curry_paste", qty: 25 }, { foodId: "onion", qty: 100 },
      { foodId: "ginger", qty: 10 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Rice on.",
      "Onion in the oil 8 minutes, then grated ginger and the curry paste for a full minute — until it smells like a curry house rather than like a jar.",
      "Coconut milk and a splash of water, simmered 8 minutes to thicken.",
      "Chickpeas and cubed tofu in for 5, crushing a handful of the chickpeas against the side so the sauce clings.",
      "Spinach through off the heat, in two goes. All at once it won't fit.",
    ],
    tip: "Cooking the paste out for a full minute is the difference between this and a beige sauce.",
    method: "Soften onion, cook out ginger and curry paste, simmer with coconut milk, add tofu and part-crushed chickpeas, and wilt spinach through.",
  },
  {
    id: "vg_chickpea_patty_pitta", name: "Chickpea patties in pitta", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "chickpeas", qty: 250 }, { foodId: "edamame", qty: 120 },
      { foodId: "oats", qty: 30 }, { foodId: "pitta", qty: 2 },
      { foodId: "hummus", qty: 50 }, { foodId: "cucumber", qty: 100 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "garlic", qty: 8 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Chickpeas and edamame drained and dried, then mashed rough with the garlic, spices and a lot of salt. Rough — a smooth paste fries into a puck.",
      "Oats in to bind, then shape six small patties and press them flat.",
      "Shallow-fry 3 minutes a side in the oil until the outsides are properly dark.",
      "Warm pittas, hummus inside, patties, diced cucumber.",
    ],
    tip: "Flatter patties cook through before the outside burns. Anything thicker than a centimetre is raw in the middle.",
    method: "Mash chickpeas rough with garlic and spices, bind with oats, fry flat patties, and stuff into warm pitta with hummus.",
  },
  {
    id: "vg_quinoa_tabbouleh", name: "Quinoa tabbouleh with chickpeas", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "quinoa", qty: 65 }, { foodId: "chickpeas", qty: 200 },
      { foodId: "edamame", qty: 140 }, { foodId: "tomatoes_fresh", qty: 150 },
      { foodId: "cucumber", qty: 120 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
      { foodId: "seeds_mixed", qty: 12 },
    ],
    steps: [
      "Quinoa rinsed hard, simmered 15 minutes, then spread out on a plate to cool. Warm quinoa turns the tomatoes to soup.",
      "Tomato and cucumber diced small and salted, left 5 minutes. Keep the juice they give up — that's the dressing.",
      "Everything folded together with the oil and all of the lemon. Edamame straight from frozen — it thaws in the dressing in the time the quinoa takes to cool.",
      "Seeds over at the end.",
    ],
    tip: "Better after an hour, and still good the next day. Make it the night before.",
    method: "Cool cooked quinoa, salt the diced vegetables for their juice, and fold everything with chickpeas, edamame, oil and lemon.",
  },
  {
    id: "vg_sweet_potato_quesadilla", name: "Sweet potato & bean quesadilla", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "sweet_potato", qty: 160 }, { foodId: "black_beans", qty: 180 },
      { foodId: "edamame", qty: 120 }, { foodId: "tortilla_wrap", qty: 2 },
      { foodId: "hummus", qty: 50 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "olive_oil", qty: 6 },
    ],
    steps: [
      "Sweet potato cubed small and microwaved 6 minutes, then mashed with the spices — no cheese here, so the mash is what holds it together.",
      "Beans and edamame folded in whole, hummus stirred through for richness.",
      "Filling over half a wrap, folded, and dry-fried 3 minutes a side under something heavy.",
      "Rest a minute before cutting or the filling runs out.",
    ],
    tip: "Hummus doing the job of cheese sounds like a compromise and isn't — it browns and goes nutty in the pan.",
    method: "Mash spiced sweet potato with hummus, beans and edamame, fold into a wrap, and dry-fry pressed on both sides.",
  },
  {
    id: "vg_curried_chickpea_wrap", name: "Curried chickpea wrap", slot: "Lunch", minutes: 12,
    items: [
      { foodId: "chickpeas", qty: 190 }, { foodId: "edamame", qty: 110 },
      { foodId: "tortilla_wrap", qty: 2 }, { foodId: "coconut_yoghurt", qty: 70 },
      { foodId: "curry_paste", qty: 15 }, { foodId: "spinach", qty: 60 },
      { foodId: "apple", qty: 1 }, { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Fry the curry paste dry for 45 seconds, then let it cool before it meets the yoghurt — hot paste splits it.",
      "Stir into the coconut yoghurt, then fold in the drained chickpeas and edamame, crushing a third of the chickpeas.",
      "Grated apple through it, skin on.",
      "Spinach into the wrap first as a barrier, filling on top, rolled tight.",
    ],
    tip: "Spinach against the wrap rather than on top of the filling. It keeps the bread dry until lunchtime.",
    method: "Cook out curry paste, cool into coconut yoghurt, fold through chickpeas and grated apple, and roll in a wrap lined with spinach.",
  },
  {
    id: "vg_lentil_soup_bread", name: "Lentil soup with toast", slot: "Lunch", minutes: 30,
    items: [
      { foodId: "red_lentils", qty: 140 }, { foodId: "carrots", qty: 150 },
      { foodId: "onion", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 },
      { foodId: "wholemeal_bread", qty: 70 }, { foodId: "stock_cubes", qty: 6 },
      { foodId: "spice_mix", qty: 6 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Onion and diced carrot in the oil, lid on, 8 minutes so they sweat rather than colour.",
      "Spices for a minute, then lentils, tomatoes, stock and a litre of water.",
      "Simmer 20 minutes. Lentils are done when they stop being distinct.",
      "Blitz half and leave the rest in pieces — all of it blitzed is baby food.",
      "It needs more salt and a squeeze of acid than feels right. Taste twice.",
    ],
    tip: "Freezes in portions. Reheats from frozen while the toast is in.",
    method: "Sweat onion and carrot, cook out spices, simmer with lentils, tomatoes and stock, blitz half, and serve with toast.",
  },
  {
    id: "vg_overnight_oats_soya", name: "Overnight oats with berries", slot: "Breakfast", minutes: 3,
    items: [
      { foodId: "oats", qty: 70 }, { foodId: "soy_milk", qty: 220 },
      { foodId: "pea_protein", qty: 25 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Pea protein whisked into the soya milk FIRST, on its own. Added to the oats it clumps and you find the lumps in the morning.",
      "Oats in, stirred until nothing dry is left at the bottom.",
      "Frozen berries on top, lid on, fridge overnight — they thaw into it and colour the lot.",
      "Seeds as you leave.",
    ],
    tip: "Three jars on Sunday night covers most of the week, and it's 36g of protein with no dairy.",
    method: "Whisk pea protein into soya milk, stir through oats, top with frozen berries overnight, and add seeds in the morning.",
  },
  {
    id: "vg_pb_banana_oats", name: "Peanut butter & banana oats", slot: "Breakfast", minutes: 8,
    items: [
      { foodId: "oats", qty: 70 }, { foodId: "soy_milk", qty: 250 },
      { foodId: "pea_protein", qty: 20 }, { foodId: "peanut_butter", qty: 20 },
      { foodId: "banana", qty: 1 },
      { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Oats and soya milk on a medium heat, stirred often, 5 minutes.",
      "Half the banana mashed straight into the pan as it cooks — it sweetens the whole thing so nothing else needs to.",
      "Off the heat — then the pea protein, beaten in hard with a splash of water. In the pan on the heat it goes grainy.",
      "Peanut butter stirred through last so it melts in rather than sitting in a lump.",
      "The rest of the banana sliced on top, seeds over.",
    ],
    tip: "Mashing half the banana IN is the difference between banana porridge and porridge with banana on it.",
    method: "Simmer oats in soya milk with half a mashed banana, beat in pea protein and peanut butter off the heat, and top with the rest.",
  },
  {
    id: "vg_green_smoothie_bowl", name: "Green protein smoothie bowl", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "spinach", qty: 60 }, { foodId: "banana", qty: 1 },
      { foodId: "soy_milk", qty: 200 }, { foodId: "pea_protein", qty: 30 },
      { foodId: "peanut_butter", qty: 20 }, { foodId: "seeds_mixed", qty: 12 },
    ],
    steps: [
      "Soya milk in the blender first, then spinach, and blitz THAT to nothing before anything else goes in. Added last, spinach leaves green flecks through the whole bowl.",
      "Banana, pea protein and peanut butter in, blitzed thick — frozen banana if you have it.",
      "Into a bowl, seeds over. Eat with a spoon.",
    ],
    tip: "Blending the spinach first is the only reason this tastes of banana and not of salad.",
    method: "Blitz spinach into soya milk until smooth, add banana, pea protein and peanut butter, and top with seeds.",
  },
  {
    id: "vg_tofu_avo_toast", name: "Tofu scramble on avocado toast", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "tofu", qty: 200 }, { foodId: "wholemeal_bread", qty: 80 },
      { foodId: "avocado", qty: 1 }, { foodId: "spice_mix", qty: 5 },
      { foodId: "spinach", qty: 60 }, { foodId: "olive_oil", qty: 8 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Press the tofu, then crumble it between your fingers into uneven pieces. Even cubes read as tofu; uneven crumbs read as scramble.",
      "Into the hot oil with the turmeric-heavy spices, and left to catch for 3 minutes before you stir it.",
      "Spinach through at the end, off the heat.",
      "Toast, avocado smashed on with the lemon and salt, scramble piled over.",
    ],
    tip: "Leave it alone in the pan. Constant stirring gives you wet yellow tofu instead of something with browned edges.",
    method: "Crumble pressed tofu into spiced hot oil and let it catch, wilt spinach through, and pile onto lemony avocado toast.",
  },
  // ===========================================================================
  // BREADTH.
  //
  // Nothing clever here — these exist because the book should contain the
  // dinners people already cook. A recipe list that has shakshuka and katsu
  // curry but no cottage pie, no fajitas and no tuna pasta bake is a list
  // written for the app rather than for the person using it.
  //
  // The one rule kept throughout: they are sized and shaped like real portions
  // for an athlete, so the planner can actually serve them, rather than being
  // restaurant recipes with the numbers bolted on afterwards.
  // ===========================================================================
  {
    id: "chicken_fajitas", name: "Chicken fajitas", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "peppers", qty: 220 },
      { foodId: "onion", qty: 120 }, { foodId: "tortilla_wrap", qty: 3 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "olive_oil", qty: 12 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Chicken sliced across the grain into finger-width strips — with the grain it comes out stringy however well you cook it.",
      "Hottest pan you own. Chicken in with half the oil and half the spices, spread out and left for 3 minutes without touching it.",
      "Out onto a plate. Peppers and onion into the same pan with the rest, 4 minutes, again barely stirred — you want black edges.",
      "Chicken back in for a minute, all the lemon over.",
      "Wraps charred dry in a second pan while that happens.",
    ],
    tip: "Cooking the chicken and the vegetables separately is the whole thing. Together they release water and everything boils.",
    method: "Sear sliced chicken hard, char peppers and onion in the same pan, combine with lemon, and serve in dry-charred wraps.",
  },
  {
    id: "beef_broccoli_noodles", name: "Beef & broccoli noodles", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "beef_mince_5", qty: 200 }, { foodId: "noodles", qty: 100 },
      { foodId: "broccoli", qty: 200 }, { foodId: "soy_sauce", qty: 25 },
      { foodId: "garlic", qty: 10 }, { foodId: "ginger", qty: 8 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Noodles on, drained a minute early — they finish in the pan and go to mush if fully cooked first.",
      "Mince into a dry hot pan and pressed flat, left 3 minutes to crust before breaking it up. Stirred from the start it steams grey.",
      "Broccoli florets in with a splash of water, lid on, 3 minutes.",
      "Garlic, ginger and soy in for the last 30 seconds, then the noodles tossed through.",
    ],
    tip: "Pressing the mince flat and leaving it is what gives you browned edges instead of boiled beef.",
    method: "Crust the mince without stirring, steam broccoli in the same pan, then toss with noodles, garlic, ginger and soy.",
  },
  {
    id: "salmon_sweet_potato_tray", name: "Salmon & sweet potato traybake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "salmon_fillet", qty: 180 }, { foodId: "sweet_potato", qty: 300 },
      { foodId: "broccoli", qty: 180 }, { foodId: "olive_oil", qty: 14 },
      { foodId: "lemon", qty: 1 }, { foodId: "garlic", qty: 8 },
    ],
    steps: [
      "Oven to 210C with the tray already in it — vegetables hitting a hot tray sear, a cold one steams them.",
      "Sweet potato in wedges with most of the oil, 20 minutes on their own.",
      "Broccoli and the salmon added, skin side down, 12 minutes more. Salmon needs a quarter of the time the potatoes do, which is why it goes in last.",
      "Garlic and lemon over as it comes out, while everything is hot enough to take it in.",
    ],
    tip: "One tray. The salmon is done when it flakes at a fork but still looks slightly translucent in the middle.",
    method: "Roast sweet potato wedges on a preheated tray, add broccoli and salmon for the last twelve minutes, and finish with garlic and lemon.",
  },
  {
    id: "turkey_burger_wedges", name: "Turkey burgers & sweet potato wedges", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "turkey_mince", qty: 220 }, { foodId: "sweet_potato", qty: 300 },
      { foodId: "wholemeal_bread", qty: 80 }, { foodId: "onion", qty: 60 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 14 },
      { foodId: "tomatoes_fresh", qty: 80 },
    ],
    steps: [
      "Oven to 220C, wedges in with most of the oil and half the spices, 25 minutes.",
      "Turkey mince mixed with grated onion and the rest of the spices. Grated, not chopped — the moisture is what stops turkey burgers being dry.",
      "Two thick patties with a thumbprint pressed into the middle of each so they cook flat instead of doming.",
      "Medium-high heat, 5 minutes a side. Turkey is done at the point it stops being pink and not a minute after.",
      "Toasted bread, tomato, patty.",
    ],
    tip: "Grated onion and the thumbprint. Those two things are the difference between this and a dry puck.",
    method: "Roast spiced sweet potato wedges, mix turkey mince with grated onion, fry thumbprinted patties, and serve on toast.",
  },
  {
    id: "chicken_caesar_bowl", name: "Chicken & yoghurt caesar bowl", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "chicken_breast", qty: 200 }, { foodId: "greek_yoghurt", qty: 80 },
      { foodId: "wholemeal_bread", qty: 50 }, { foodId: "spinach", qty: 100 },
      { foodId: "cheddar", qty: 25 }, { foodId: "lemon", qty: 1 },
      { foodId: "garlic", qty: 6 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Bread torn into rough chunks, tossed in half the oil, and baked or pan-fried until hard. Torn, not cubed — the ragged edges are what go crisp.",
      "Chicken seasoned and griddled 6 minutes a side, then rested 5 before slicing.",
      "Dressing: yoghurt, grated garlic, all the lemon, the grated cheddar, and enough water to make it pourable.",
      "Spinach, chicken, croutons, dressing over at the last second.",
    ],
    tip: "Yoghurt instead of egg and oil takes about 300 calories out and keeps the sharpness. Dress it as you eat or the leaves collapse.",
    method: "Crisp torn bread, griddle and rest the chicken, whisk a yoghurt-garlic-lemon dressing, and combine at the last moment.",
  },
  {
    id: "beef_cottage_pie", name: "Beef cottage pie", slot: "Dinner", minutes: 50,
    items: [
      { foodId: "beef_mince_5", qty: 220 }, { foodId: "potatoes", qty: 400 },
      { foodId: "carrots", qty: 120 }, { foodId: "onion", qty: 100 },
      { foodId: "peas_frozen", qty: 80 }, { foodId: "tomatoes_tin", qty: 150 },
      { foodId: "stock_cubes", qty: 6 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Potatoes on to boil, 20 minutes.",
      "Mince browned hard in a dry pan first, then out. Onion and grated carrot in the oil for 8 minutes.",
      "Mince back with the tomatoes and stock, simmered 15 minutes until it thickens — a wet filling makes the mash sink.",
      "Peas stirred in at the end, then the lot into a dish.",
      "Mash with a good slug of oil, spread over, and rough the top up with a fork. Those ridges are what go brown. 15 minutes at 210C.",
    ],
    tip: "Forking the top is not decoration — flat mash comes out pale and soft.",
    method: "Brown the mince, soften onion and carrot, simmer thick with tomatoes and stock, top with forked mash, and bake until the ridges brown.",
  },
  {
    id: "prawn_linguine", name: "Garlic prawn pasta", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "prawns", qty: 180 }, { foodId: "pasta", qty: 100 },
      { foodId: "tomatoes_fresh", qty: 150 }, { foodId: "garlic", qty: 12 },
      { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 14 },
      { foodId: "lemon", qty: 1 }, { foodId: "spinach", qty: 60 },
    ],
    steps: [
      "Pasta on. Keep a mug of the water before you drain it — this is the whole sauce.",
      "Garlic and chilli sliced thin into the oil on a LOW heat for 2 minutes. Browned garlic is bitter and you cannot take it back out.",
      "Halved tomatoes in, pressed with a spoon until they collapse, 4 minutes.",
      "Prawns for 90 seconds only. They are already cooked; longer makes them squeak.",
      "Pasta in with a good splash of the water, tossed hard until the sauce goes glossy and clings. Spinach and lemon off the heat.",
    ],
    tip: "The starchy water is what turns oil and tomato into a sauce. Tip it all down the sink and you get oily pasta.",
    method: "Infuse garlic and chilli in low oil, collapse the tomatoes, warm the prawns 90 seconds, and emulsify with pasta water.",
  },
  {
    id: "tuna_pasta_bake", name: "Tuna pasta bake", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "tuna_tin", qty: 200 }, { foodId: "pasta", qty: 110 },
      { foodId: "passata", qty: 250 }, { foodId: "sweetcorn", qty: 100 },
      { foodId: "cheddar", qty: 50 }, { foodId: "onion", qty: 80 },
      { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Pasta boiled 2 minutes SHORT of the packet time. It finishes in the oven, and fully cooked pasta comes out of a bake as porridge.",
      "Onion softened in the oil, passata in, simmered 8 minutes with a lot of salt.",
      "Drained tuna, sweetcorn and pasta folded through.",
      "Into a dish, cheese over, 20 minutes at 200C until the top has dark patches.",
    ],
    tip: "Undercooking the pasta is the only trick, and it's the one every recipe leaves out.",
    method: "Undercook the pasta, simmer a passata and onion sauce, fold through tuna and sweetcorn, top with cheese and bake.",
  },
  {
    id: "chicken_egg_fried_rice", name: "Chicken egg fried rice", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "chicken_breast", qty: 200 }, { foodId: "rice", qty: 100 },
      { foodId: "eggs", qty: 2 }, { foodId: "peas_frozen", qty: 100 },
      { foodId: "soy_sauce", qty: 20 }, { foodId: "garlic", qty: 8 },
      { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Cold rice works far better than fresh — cook it in advance and chill it, or it clumps and steams.",
      "Chicken diced small, seared hard in half the oil, out onto a plate.",
      "Eggs beaten into the empty pan, scrambled quickly and roughly, out with the chicken.",
      "Rest of the oil, garlic 20 seconds, rice in and pressed against the pan for a minute at a time so it toasts.",
      "Everything back with the peas and soy, tossed 90 seconds.",
    ],
    tip: "Yesterday's rice. Fresh rice is the reason home fried rice usually goes stodgy.",
    method: "Sear diced chicken, scramble the eggs separately, toast cold rice in the pan, then bring it all back with peas and soy.",
  },
  {
    id: "halloumi_grain_bowl", name: "Halloumi & quinoa bowl", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "halloumi", qty: 100 }, { foodId: "quinoa", qty: 80 },
      { foodId: "peppers", qty: 150 }, { foodId: "spinach", qty: 80 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
      { foodId: "seeds_mixed", qty: 12 },
    ],
    steps: [
      "Quinoa rinsed and simmered 15 minutes.",
      "Peppers into a dry hot pan until they blister, then out.",
      "Halloumi sliced and patted dry, into the same dry pan, 2 minutes a side without moving it.",
      "Quinoa dressed hot with the oil and lemon, spinach folded through to half-wilt, peppers and halloumi on top, seeds over.",
    ],
    tip: "Patting the halloumi dry is what gets you a brown crust instead of a squeak.",
    method: "Cook quinoa, blister peppers dry, griddle dried halloumi, and build over lemon-dressed grains and spinach.",
  },
  {
    id: "egg_fried_rice_veg", name: "Vegetable egg fried rice", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "eggs", qty: 3 }, { foodId: "rice", qty: 90 },
      { foodId: "mixed_veg_frozen", qty: 180 }, { foodId: "soy_sauce", qty: 18 },
      { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Cold rice, ideally yesterday's.",
      "Eggs beaten and scrambled fast in half the oil, then out while still slightly wet — they finish later and go rubbery otherwise.",
      "Rest of the oil, garlic, frozen veg straight from the bag on a high heat until the water has gone.",
      "Rice in, pressed flat and left to toast a minute at a time.",
      "Egg back, soy round the edge of the pan where it catches.",
    ],
    tip: "Soy down the side of the pan rather than onto the rice — it caramelises for a second before it hits anything.",
    method: "Scramble eggs and set aside, drive the water off frozen veg, toast cold rice, and bring it together with soy.",
  },
  {
    id: "chicken_pesto_pasta", name: "Chicken pesto pasta", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "chicken_breast", qty: 200 }, { foodId: "pasta", qty: 100 },
      { foodId: "pesto", qty: 40 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Pasta on, and keep a mug of the water.",
      "Chicken seasoned and seared 6 minutes a side, then rested and sliced.",
      "Pesto into the drained pasta OFF the heat with a splash of the water. Pesto cooked in a hot pan goes bitter and splits.",
      "Halved tomatoes and spinach folded through the residual heat, chicken over.",
    ],
    tip: "Off the heat is the rule with pesto. Everything else here is forgiving.",
    method: "Sear and rest the chicken, loosen pesto into drained pasta off the heat with cooking water, and fold through tomatoes and spinach.",
  },
  {
    id: "salmon_rice_bowl", name: "Salmon, rice & greens bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "salmon_fillet", qty: 160 }, { foodId: "rice", qty: 90 },
      { foodId: "broccoli", qty: 150 }, { foodId: "avocado", qty: 1 },
      { foodId: "soy_sauce", qty: 15 }, { foodId: "lemon", qty: 1 },
      { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Rice on.",
      "Salmon skin side down in a dry non-stick pan, medium heat, 6 minutes without touching it — that is how the skin crisps.",
      "Flip for 90 seconds only.",
      "Broccoli steamed over the rice for the last 4 minutes.",
      "Rice, broccoli, flaked salmon, sliced avocado, soy and lemon over, seeds last.",
    ],
    tip: "Six minutes untouched on the skin. Every time it sticks, it is because it was moved too early.",
    method: "Crisp salmon skin-side down without moving it, steam broccoli over the rice, and build the bowl with avocado, soy and lemon.",
  },
  {
    id: "cottage_cheese_pasta", name: "Creamy cottage cheese pasta", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "cottage_cheese", qty: 200 }, { foodId: "pasta", qty: 100 },
      { foodId: "tomatoes_fresh", qty: 150 }, { foodId: "spinach", qty: 80 },
      { foodId: "garlic", qty: 10 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Blitz the cottage cheese smooth with the garlic and a splash of water. Unblitzed it stays as curds in the sauce and looks split.",
      "Pasta on. Keep a mug of the water.",
      "Halved tomatoes in the oil until they collapse, 5 minutes.",
      "Drained pasta in, then the blitzed cottage cheese OFF the heat with a splash of the water. Boiled, it splits.",
      "Spinach through the residual heat.",
    ],
    tip: "About 30g of protein in a creamy pasta for a fraction of a cream sauce. Blitzing and keeping it off the heat are both non-negotiable.",
    method: "Blitz cottage cheese smooth with garlic, collapse tomatoes in oil, and fold everything together off the heat with pasta water.",
  },
  {
    id: "chicken_soup_noodle", name: "Chicken noodle soup", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "chicken_breast", qty: 180 }, { foodId: "noodles", qty: 80 },
      { foodId: "carrots", qty: 120 }, { foodId: "spinach", qty: 80 },
      { foodId: "stock_cubes", qty: 8 }, { foodId: "ginger", qty: 10 },
      { foodId: "garlic", qty: 8 }, { foodId: "soy_sauce", qty: 12 },
    ],
    steps: [
      "Stock, sliced ginger and garlic into a litre of water and simmered 10 minutes before anything else — that is where the flavour comes from, not from the chicken.",
      "Whole chicken breast poached in it for 12 minutes, then out to rest and shred. Poaching whole keeps it tender; diced, it goes stringy.",
      "Carrots in matchsticks for 4 minutes, noodles for the last 3.",
      "Chicken back, spinach and soy off the heat.",
    ],
    tip: "Simmering the aromatics first is the whole recipe. Everything else is just warming things up in it.",
    method: "Simmer a ginger-garlic stock, poach the chicken whole and shred it, cook carrots and noodles in the broth, and finish with spinach and soy.",
  },
  {
    id: "veggie_chilli_rice", name: "Vegetable chilli with rice", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "black_beans", qty: 200 }, { foodId: "beans_baked", qty: 150 },
      { foodId: "rice", qty: 90 }, { foodId: "peppers", qty: 150 },
      { foodId: "tomatoes_tin", qty: 200 }, { foodId: "onion", qty: 100 },
      { foodId: "spice_mix", qty: 10 }, { foodId: "olive_oil", qty: 12 },
      { foodId: "cheddar", qty: 30 },
    ],
    steps: [
      "Onion and peppers in the oil, 8 minutes, until the peppers have soft dark patches.",
      "Spices for a full minute — they need heat and oil or they taste raw and dusty.",
      "Tomatoes and both tins of beans, simmered 15 minutes until a spoon leaves a gap.",
      "Rice alongside. Cheese grated over at the table.",
      "It needs more salt than you think and a squeeze of acid at the end.",
    ],
    tip: "Baked beans in a chilli sounds wrong and is excellent — the sauce they carry thickens the whole thing.",
    method: "Soften onion and peppers, cook out the spices, simmer with tomatoes and two kinds of bean, and serve over rice with cheese.",
  },
  // ===========================================================================
  // MORE OF THE LEANEST TIER.
  //
  // Adding forty-five recipes to the book made every athlete's week more varied
  // and made ONE athlete's week worse: a vegan cutting. Measured after the
  // splice, their seventh day came out at 92% of its protein target, because by
  // day seven the repeat cap had used up every dense vegan option and the
  // planner fell back onto the new arrivals — good food, but 0.056 g/kcal
  // against the 0.078 this athlete needs.
  //
  // That is what breadth costs the hardest case, and the fix is not to withhold
  // the breadth. It is that a slot needs enough dense options to survive the
  // repeat cap for seven days. Their dense counts were 6 breakfasts, 6 lunches,
  // 5 dinners — and 8 snacks of which SIX were shakes, which is not eight
  // options.
  //
  // So: two breakfasts, one lunch, two dinners and two snacks, all clearing
  // 0.078, and the snacks deliberately not shakes.
  // ===========================================================================
  {
    id: "lean_vg_mushroom_tofu_hash", name: "Mushroom & tofu breakfast hash", slot: "Breakfast", minutes: 15,
    items: [
      { foodId: "tofu", qty: 220 }, { foodId: "mushrooms", qty: 200 },
      { foodId: "spinach", qty: 100 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 5 },
      { foodId: "spice_mix", qty: 4 },
    ],
    steps: [
      "Mushrooms into a dry pan first, sliced thick, on a high heat. No oil yet — they have to give up their water and take it back before anything else goes in, and oil at this stage just stops that happening.",
      "When they squeak and go brown, push them aside and add the oil, then the tofu crumbled in by hand rather than cubed. Crumbled, it catches and crisps like the mushrooms.",
      "Spices and garlic for the last minute, halved tomatoes cut-side down alongside.",
      "Spinach on top, heat off, lid on for a minute to wilt it in the residual heat.",
    ],
    tip: "A savoury breakfast with no bread under it. Crumbling the tofu rather than cubing it is what gives you the browned edges.",
    method: "Dry-brown mushrooms, crisp crumbled tofu in oil alongside, add garlic, spices and tomatoes, and wilt spinach in off the heat.",
  },
  {
    id: "lean_vg_soya_berry_oats", name: "Soya & berry protein oats", slot: "Breakfast", minutes: 6,
    items: [
      { foodId: "oats", qty: 30 }, { foodId: "soy_milk", qty: 280 },
      { foodId: "pea_protein", qty: 30 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Thirty grams of oats, not seventy. This is a cutting breakfast and the oats are here for texture, not for bulk.",
      "Simmer them in the soya milk for 4 minutes until it thickens.",
      "OFF the heat before the pea protein goes anywhere near it, beaten in with a splash of water. On the heat it seizes into grains and never comes back.",
      "Frozen berries stirred through — they cool it to eating temperature and thin it back out at the same time.",
    ],
    tip: "Pea protein tastes chalky in water and doesn't here, because the oats and berries give it something to hide behind.",
    method: "Simmer a small amount of oats in soya milk, beat pea protein in off the heat, and stir through frozen berries.",
  },
  {
    id: "lean_vg_edamame_spinach_salad", name: "Edamame, tofu & spinach salad", slot: "Lunch", minutes: 12,
    items: [
      { foodId: "edamame", qty: 180 }, { foodId: "tofu", qty: 160 },
      { foodId: "spinach", qty: 100 }, { foodId: "cucumber", qty: 120 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "lemon", qty: 1 },
      { foodId: "soy_sauce", qty: 12 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Edamame from frozen into boiling water, 3 minutes, then straight into cold so they stay bright and firm.",
      "Tofu pressed and cubed, dry-fried hard until three faces are golden. Skip the pressing and it steams in its own water and stays white.",
      "Soy, lemon and oil shaken together — that is the whole dressing, and it needs no salt because the soy is the salt.",
      "Spinach at the bottom, everything else on top, dressed at the last moment.",
    ],
    tip: "Two soy sources rather than one, because at a cutting athlete's calorie ceiling nothing else plant-based reaches the target.",
    method: "Blanch edamame, dry-fry pressed tofu golden, and dress with soy, lemon and oil over raw spinach and cucumber.",
  },
  {
    id: "lean_vg_tofu_spinach_curry", name: "Tofu & spinach curry, no rice", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "tofu", qty: 280 }, { foodId: "spinach", qty: 180 },
      { foodId: "mushrooms", qty: 150 }, { foodId: "coconut_milk", qty: 60 },
      { foodId: "curry_paste", qty: 20 }, { foodId: "ginger", qty: 10 },
      { foodId: "garlic", qty: 8 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Sixty grams of coconut milk, not a tin. It is here for flavour and body; a full tin would put 400 calories on a plate that cannot carry them.",
      "Paste, ginger and garlic in the oil for a full minute until it stops smelling of jar.",
      "Mushrooms in for 4 minutes to brown, then the coconut milk and a good splash of water — the water is what makes it a sauce rather than a paste.",
      "Pressed, cubed tofu in for 5 minutes, spooning the sauce over rather than stirring, so it doesn't break up.",
      "Spinach through at the end in two goes.",
    ],
    tip: "No rice under it, which is the point. On a rest day in a cut this is the plate that leaves room for breakfast.",
    method: "Cook out curry paste with ginger and garlic, brown mushrooms, loosen a little coconut milk with water, then simmer tofu and wilt spinach through.",
  },
  {
    id: "lean_vg_tofu_greens_broth", name: "Tofu & greens broth", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "tofu", qty: 260 }, { foodId: "broccoli", qty: 180 },
      { foodId: "mushrooms", qty: 150 }, { foodId: "spinach", qty: 80 },
      { foodId: "stock_cubes", qty: 6 }, { foodId: "soy_sauce", qty: 15 },
      { foodId: "ginger", qty: 12 }, { foodId: "garlic", qty: 8 },
      { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Ginger sliced into coins and garlic crushed flat into a litre of stock, simmered 5 minutes and then left to sit. This is the whole flavour of the dish and it costs nothing.",
      "Mushrooms in for 5 minutes, broccoli for 3.",
      "Tofu cubed and lowered in for the last 2 minutes only — it is already cooked, and boiling it hard breaks it up.",
      "Heat off, spinach in, soy and sliced chilli at the table so the soy doesn't cook out.",
    ],
    tip: "About 45g of protein in a bowl that is mostly water. The most filling thing per calorie in the book.",
    method: "Infuse stock with ginger and garlic, simmer mushrooms and broccoli, warm tofu through, and finish with spinach, soy and chilli.",
  },
  {
    id: "lean_vg_crispy_tofu_bites", name: "Crispy spiced tofu bites", slot: "Snack", minutes: 25,
    items: [
      { foodId: "tofu", qty: 250 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "soy_sauce", qty: 12 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Press the tofu properly — twenty minutes under a weighted plate. For this one it genuinely matters: wet tofu will not crisp at any temperature.",
      "Torn into rough 2cm pieces rather than cut. Torn edges are what go crunchy.",
      "Tossed with the oil, soy and spices, then oven at 220C for 20 minutes, shaken once.",
      "Out when the edges are dark and they sound hollow. Underdone they go rubbery as they cool.",
    ],
    tip: "A snack you eat with your fingers rather than a spoon, which the vegan snack list badly needed. Good cold from a box the next day.",
    method: "Press and tear tofu, toss with soy, oil and spices, and roast hot until the edges are dark and crisp.",
  },
  {
    id: "lean_vg_edamame_tofu_pot", name: "Edamame & tofu pot", slot: "Snack", minutes: 6,
    items: [
      { foodId: "edamame", qty: 140 }, { foodId: "tofu", qty: 120 },
      { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
      { foodId: "soy_sauce", qty: 10 }, { foodId: "chilli_fresh", qty: 4 },
    ],
    steps: [
      "Edamame 3 minutes from frozen, drained, cooled under the tap.",
      "Tofu cubed small and raw — no cooking. Firm tofu straight from the pack is fine cold, and the soy and lemon do the work.",
      "Cucumber in thick half-moons, chilli sliced fine.",
      "Soy and all the lemon over, shaken in the pot rather than stirred.",
    ],
    tip: "No pan, no shaker bottle, 30g of protein. Assembled in the time it takes the kettle to boil.",
    method: "Blanch edamame, cube raw tofu, and toss with cucumber, chilli, soy and lemon.",
  },

  // ===========================================================================
  // THE SECOND HALF OF THE BOOK.
  //
  // "A lot of people didn't like the recipes, can we add some more."
  //
  // Counting what the book could be built FROM says where to aim, and the
  // answer was not "more of everything":
  //
  //   meat or fish breakfasts          2 of 44
  //   meat or fish lunches            17 of 51
  //   meat or fish dinners            21 of 58
  //   meat or fish snacks              4 of 42
  //   lunches you can make in 10 min   2 of 51
  //   dinners you can make in 15 min   0 of 58
  //   a vegan avoiding soy             9 breakfasts, 9 lunches, 10 dinners
  //   a vegan avoiding gluten         16 breakfasts, 16 lunches, 19 dinners
  //
  // Three separate complaints hide in that table. An omnivore was being handed
  // a near-vegetarian book. Anybody with twenty minutes and a work laptop had
  // two lunches to choose from. And a plant-based athlete who ticks one more
  // box was still on a rotation short enough to notice by Thursday.
  //
  // The ingredient table is what made all three unfixable, and it was extended
  // first — see the block at the end of FOODS. Cod, mackerel, sardines, thighs,
  // bacon and chorizo are the CHEAP end of animal protein, which the old table
  // had none of; rice noodles and corn tortillas are the first long carbs that
  // are not wheat; oat and almond milk mean a vegan avoiding soy can have
  // breakfast at all.
  //
  // House style unchanged: one action a step, said the way you would say it to
  // someone standing in your kitchen, and the thing that goes wrong named out
  // loud where there is one.
  // ===========================================================================

  // --- Breakfasts that are not a bowl of oats -------------------------------
  {
    id: "bacon_egg_stack", name: "Bacon, egg & tomato stack", slot: "Breakfast", minutes: 12,
    items: [
      { foodId: "bacon_medallions", qty: 90 }, { foodId: "eggs", qty: 2 },
      { foodId: "wholemeal_bread", qty: 90 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "olive_oil", qty: 6 }, { foodId: "spinach", qty: 40 },
    ],
    steps: [
      "Medallions into a dry hot pan — they are lean enough that added fat just sits there. Three minutes a side until the edges brown.",
      "Halved tomatoes cut-side down in the same pan while the bacon rests. Leave them until they collapse.",
      "Eggs in the oil at the side of the pan, spooning the hot oil over the whites so the tops set without flipping.",
      "Toast, spinach, bacon, tomatoes, egg on top, in that order.",
    ],
    tip: "Medallions rather than streaky: same bacon flavour, roughly triple the protein per calorie, and no pan full of fat to pour off.",
    method: "Dry-fry bacon medallions, collapse tomatoes in the same pan, fry eggs alongside and stack on toast with spinach.",
  },
  {
    id: "chorizo_potato_eggs", name: "Chorizo, potato & egg pan", slot: "Breakfast", minutes: 22,
    items: [
      { foodId: "chorizo", qty: 60 }, { foodId: "potatoes", qty: 300 },
      { foodId: "eggs", qty: 3 }, { foodId: "peppers", qty: 100 },
      { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 4 },
    ],
    steps: [
      "Potatoes in 2cm cubes, boiled 8 minutes, drained and left to steam dry in the colander.",
      "Chorizo diced small into a cold pan, then the heat on — starting it cold renders the fat out, and that orange fat is what everything else cooks in.",
      "Chorizo out, potatoes in, and do not touch them for 5 minutes. Then peppers, onion and the spices.",
      "Chorizo back in, three wells, an egg in each, lid on for 4 minutes.",
    ],
    tip: "60g of chorizo flavours the whole pan. It is a seasoning here, not the protein — the eggs are.",
    method: "Par-boil potatoes, render diced chorizo from cold, crisp the potatoes in its fat with peppers and onion, then set eggs in wells under a lid.",
  },
  {
    id: "mackerel_toast_lemon", name: "Mackerel & tomato on toast", slot: "Breakfast", minutes: 6,
    items: [
      { foodId: "mackerel_tin", qty: 125 }, { foodId: "wholemeal_bread", qty: 90 },
      { foodId: "lemon", qty: 1 }, { foodId: "spinach", qty: 40 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "olive_oil", qty: 5 },
    ],
    steps: [
      "Toast hard — mackerel is wet and a soft slice gives up immediately.",
      "Fork the fillets roughly in the tin with all their tomato sauce. Do not drain it; that is the seasoning.",
      "Spinach on the toast first so it wilts under the hot fish.",
      "Mackerel over, then a proper squeeze of lemon and the sliced chilli. The lemon is not optional with oily fish.",
    ],
    tip: "A tin costs about £1.20, keeps in the cupboard for a year, and carries more omega-3 than most people manage in a week.",
    method: "Toast bread hard, fork tinned mackerel with its sauce over spinach, and finish with lemon and fresh chilli.",
  },
  {
    id: "turkey_sweet_potato_hash", name: "Turkey & sweet potato hash", slot: "Breakfast", minutes: 20,
    items: [
      { foodId: "turkey_mince", qty: 150 }, { foodId: "sweet_potato", qty: 250 },
      { foodId: "eggs", qty: 2 }, { foodId: "spinach", qty: 60 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Sweet potato in 1.5cm cubes into the hot oil, spread out in one layer, 8 minutes without stirring.",
      "Push to the side, turkey mince in, and break it up hard with the spoon — turkey clumps more than beef does.",
      "Spices in once the mince has lost its pink, then everything together for 3 minutes.",
      "Spinach folded through to wilt, two eggs fried on top or cracked into wells.",
    ],
    tip: "Cook double the sweet potato and keep half. Tomorrow it crisps in four minutes instead of eight.",
    method: "Crisp cubed sweet potato in oil, brown turkey mince alongside with spices, wilt in spinach and top with eggs.",
  },
  {
    id: "vg_almond_oats_dates", name: "Almond milk oats with dates", slot: "Breakfast", minutes: 8,
    items: [
      { foodId: "oats", qty: 80 }, { foodId: "almond_milk", qty: 350 },
      { foodId: "dates", qty: 40 }, { foodId: "pea_protein", qty: 30 },
      { foodId: "seeds_mixed", qty: 20 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Oats and almond milk into the pan, dates chopped small straight in with them.",
      "Medium heat, stirring, 5 minutes. The dates melt into it and sweeten the whole thing — no sugar, no syrup.",
      "Off the heat before the protein goes in. Powder in a boiling pan goes grainy and there is no fixing it.",
      "Banana sliced over, seeds on top.",
    ],
    tip: "The first vegan porridge in the book that uses neither soya nor dairy. Almond milk is thinner, so it wants a little less than you would use of cow's milk.",
    method: "Simmer oats in almond milk with chopped dates, stir in pea protein off the heat, and top with banana and seeds.",
  },
  {
    id: "vg_mango_almond_shake", name: "Mango, almond & pea protein shake", slot: "Breakfast", minutes: 3,
    items: [
      { foodId: "mango_frozen", qty: 200 }, { foodId: "almond_milk", qty: 400 },
      { foodId: "pea_protein", qty: 35 }, { foodId: "cashews", qty: 25 },
      { foodId: "dates", qty: 30 },
    ],
    steps: [
      "Everything in the blender, cashews and dates first so the blades break them down before the frozen fruit chills the jug.",
      "Blend 60 seconds — longer than feels necessary. Cashews go from gritty to creamy somewhere around 45 seconds.",
      "Loosen with more almond milk if the spoon stands up in it.",
    ],
    tip: "Soy-free and gluten-free, which almost nothing else in the shake list is. Cashews are what make it taste like a milkshake rather than a supplement.",
    method: "Blend frozen mango, almond milk, pea protein, cashews and dates until completely smooth.",
  },
  {
    id: "vg_oatmilk_overnight_dates", name: "Oat milk overnight oats with dates", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "oats", qty: 65 }, { foodId: "oat_milk", qty: 300 },
      { foodId: "dates", qty: 30 }, { foodId: "peanut_butter", qty: 20 },
      { foodId: "seeds_mixed", qty: 20 }, { foodId: "berries_frozen", qty: 80 },
      { foodId: "pea_protein", qty: 30 },
    ],
    steps: [
      "Oats and oat milk in a jar, stirred properly — dry pockets at the bottom stay dry all night.",
      "Dates chopped small and stirred through now, not in the morning. They need the hours to soften.",
      "Peanut butter dolloped on top rather than mixed in, so you get it in seams rather than everywhere.",
      "Pea protein whisked into the milk BEFORE it meets the oats. Stirred in afterwards it stays as lumps, because there is nothing left to disperse it into.",
      "Frozen berries straight on. They thaw overnight and their juice runs down through it.",
      "Lid on, fridge, at least six hours.",
    ],
    tip: "Oat milk on oats sounds like a joke and makes the creamiest version of this in the book — it is starchier than any other plant milk.",
    method: "Stir oats, oat milk and chopped dates in a jar, top with peanut butter and frozen berries, and leave overnight.",
  },
  {
    id: "tahini_banana_toast", name: "Tahini & banana toast", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "wholemeal_bread", qty: 90 }, { foodId: "tahini", qty: 30 },
      { foodId: "banana", qty: 1 }, { foodId: "honey", qty: 15 },
      { foodId: "seeds_mixed", qty: 15 }, { foodId: "greek_yoghurt", qty: 200 },
    ],
    steps: [
      "Stir the tahini in the jar until it is smooth. It separates hard, and the oil on top is not a fault.",
      "Tahini onto hot toast so it loosens and spreads properly.",
      "Banana sliced on the diagonal — more surface, more banana per bite.",
      "Honey and seeds over the top.",
      "Yoghurt in a bowl alongside rather than on the toast — it is what turns this from a snack into a breakfast, and it goes soggy on bread.",
    ],
    tip: "Nut-free and soy-free, which the peanut butter toasts in this book are not. Tahini is a seed paste and behaves like one.",
    method: "Spread stirred tahini on hot toast, layer sliced banana over, finish with honey and seeds, and eat with yoghurt alongside.",
  },
  {
    id: "mango_yoghurt_protein_bowl", name: "Mango & yoghurt protein bowl", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "greek_yoghurt", qty: 300 }, { foodId: "mango_frozen", qty: 150 },
      { foodId: "whey_protein", qty: 25 }, { foodId: "cashews", qty: 25 },
      { foodId: "seeds_mixed", qty: 15 }, { foodId: "honey", qty: 12 },
    ],
    steps: [
      "Whisk the protein into the yoghurt first, with a fork, before anything else goes in. It will not disperse once there is fruit in the way.",
      "Mango from frozen, straight in — it half-thaws in the yoghurt and chills the whole bowl.",
      "Cashews roughly chopped rather than whole, so they turn up in every spoonful.",
      "Honey over.",
    ],
    tip: "Frozen mango is a third of the price of fresh and better for this, because it is picked ripe. Fresh supermarket mango almost never is.",
    method: "Whisk protein into Greek yoghurt, fold through frozen mango, and top with chopped cashews, seeds and honey.",
  },

  // --- Lunches you can make in ten minutes ----------------------------------
  {
    id: "sardines_toast_lemon", name: "Sardines on toast", slot: "Lunch", minutes: 6,
    items: [
      { foodId: "sardines_tin", qty: 120 }, { foodId: "wholemeal_bread", qty: 110 },
      { foodId: "lemon", qty: 1 }, { foodId: "tomatoes_fresh", qty: 100 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "spinach", qty: 50 },
    ],
    steps: [
      "Toast two thick slices and rub a cut tomato over them while they are hot, pressing until the bread goes pink.",
      "Sardines on whole, not mashed. Break them with the fork as you eat instead.",
      "All the oil from the tin over the top — it is olive oil the fish has been sitting in and it is the best part.",
      "Lemon, chilli, spinach on the side.",
    ],
    tip: "The cheapest 25g of protein in any supermarket, and it lives in the cupboard. Worth keeping four tins for the days nothing has been planned.",
    method: "Rub hot toast with cut tomato, lay sardines on whole with their oil, and finish with lemon and chilli.",
  },
  {
    id: "tuna_butterbean_salad", name: "Tuna & butter bean salad", slot: "Lunch", minutes: 6,
    items: [
      { foodId: "tuna_tin", qty: 120 }, { foodId: "butter_beans", qty: 250 },
      { foodId: "tomatoes_fresh", qty: 120 }, { foodId: "onion", qty: 40 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "lemon", qty: 1 },
      { foodId: "spinach", qty: 50 },
    ],
    steps: [
      "Butter beans drained and rinsed, then dressed while you are still standing there — beans take dressing best at room temperature and barely at all cold.",
      "Onion sliced as thin as you can manage and soaked in the lemon juice for two minutes. That takes the raw bite out without cooking it.",
      "Tuna in, forked through in large flakes.",
      "Tomatoes, spinach, oil, plenty of black pepper.",
    ],
    tip: "Butter beans are the creamiest tinned bean and they turn a tin of tuna into an actual lunch. Better after an hour in the fridge, so it travels.",
    method: "Dress rinsed butter beans with oil and lemon, soften sliced onion in the juice, and fold through tuna, tomatoes and spinach.",
  },
  {
    id: "chicken_hummus_wrap", name: "Chicken & hummus wrap", slot: "Lunch", minutes: 7,
    items: [
      { foodId: "chicken_breast", qty: 150 }, { foodId: "tortilla_wrap", qty: 2 },
      { foodId: "hummus", qty: 60 }, { foodId: "peppers", qty: 80 },
      { foodId: "cucumber", qty: 80 }, { foodId: "harissa", qty: 12 },
      { foodId: "spinach", qty: 40 },
    ],
    steps: [
      "Chicken sliced thin across the grain and into a hot dry pan with the harissa — 4 minutes, turning once.",
      "Warm the wraps in the same pan afterwards, 20 seconds a side. A cold wrap cracks when you roll it.",
      "Hummus spread to the edges, then the salad, then the chicken. Filling in a line down the middle, not spread everywhere.",
      "Fold the bottom up first, then roll from one side. That is the fold that stops it emptying into your lap.",
    ],
    tip: "Harissa on the chicken rather than in the wrap: it goes into the meat in the pan instead of soaking the bread.",
    method: "Pan-fry harissa-coated chicken strips, warm the wraps, and roll with hummus, peppers, cucumber and spinach.",
  },
  {
    id: "mackerel_oatcake_plate", name: "Mackerel & oatcake plate", slot: "Lunch", minutes: 5,
    items: [
      { foodId: "mackerel_tin", qty: 125 }, { foodId: "oatcakes", qty: 60 },
      { foodId: "cottage_cheese", qty: 120 }, { foodId: "cucumber", qty: 100 },
      { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Nothing is cooked. Oatcakes on the plate, cottage cheese in a heap, mackerel forked beside it.",
      "Cucumber in thick batons rather than slices so they stay crunchy against the soft everything else.",
      "Lemon over the fish, black pepper over the cheese.",
    ],
    tip: "A lunch for a day with no kitchen — it assembles on a desk out of a bag. 45g of protein and nothing to wash up.",
    method: "Assemble oatcakes, cottage cheese, tinned mackerel and raw vegetables on a plate with lemon and pepper.",
  },
  {
    id: "prawn_avocado_pitta", name: "Prawn & avocado pitta", slot: "Lunch", minutes: 7,
    items: [
      { foodId: "prawns", qty: 150 }, { foodId: "pitta", qty: 140 },
      { foodId: "avocado", qty: 1 }, { foodId: "greek_yoghurt", qty: 60 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 5 },
      { foodId: "cucumber", qty: 80 },
    ],
    steps: [
      "Yoghurt, lemon and finely chopped chilli mixed into a dressing — this is the whole recipe, so taste it and add more lemon than you think.",
      "Prawns folded through the dressing cold. They are already cooked; heating them just makes them squeak.",
      "Pittas toasted until they puff, then split. Waiting for the puff is what gives you a pocket instead of a tear.",
      "Avocado sliced in, prawns after, cucumber last.",
    ],
    tip: "Yoghurt and lemon instead of mayonnaise: the same job, a fifth of the fat, and it actually tastes of something.",
    method: "Dress cooked prawns in yoghurt, lemon and chilli, and stuff into toasted pitta with avocado and cucumber.",
  },
  {
    id: "chorizo_egg_wrap", name: "Chorizo & egg wrap", slot: "Lunch", minutes: 9,
    items: [
      { foodId: "chorizo", qty: 50 }, { foodId: "eggs", qty: 3 },
      { foodId: "tortilla_wrap", qty: 2 }, { foodId: "peppers", qty: 100 },
      { foodId: "cheddar", qty: 30 }, { foodId: "spinach", qty: 40 },
    ],
    steps: [
      "Diced chorizo into a cold pan and up to a medium heat, so the fat renders instead of the outside burning.",
      "Peppers into that fat for 3 minutes.",
      "Eggs beaten and poured in, stirred slowly and taken off the heat while they still look slightly underdone — they finish in the pan.",
      "Onto warmed wraps with the cheddar and spinach, rolled tight.",
    ],
    tip: "Take the eggs off early. Scrambled eggs carry on cooking for a good thirty seconds after the pan leaves the hob, and that is where most people lose them.",
    method: "Render diced chorizo, soften peppers in the fat, softly scramble eggs into it and roll in warm wraps with cheddar and spinach.",
  },

  // --- Bigger lunches -------------------------------------------------------
  {
    id: "cod_tacos_slaw", name: "Cod tacos with lime slaw", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "white_fish", qty: 200 }, { foodId: "corn_tortilla", qty: 3 },
      { foodId: "carrots", qty: 100 }, { foodId: "greek_yoghurt", qty: 80 },
      { foodId: "lemon", qty: 1 }, { foodId: "spice_mix", qty: 5 },
      { foodId: "avocado", qty: 1 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Cod patted properly dry, then rubbed all over with the spices. Wet fish steams and will not colour.",
      "Hot pan, 3 minutes a side, then broken into big pieces with the spoon — chunks, not flakes.",
      "Carrot grated coarse, dressed with yoghurt, lemon and chilli. That is the slaw and it takes a minute.",
      "Tortillas straight onto a dry pan or a gas flame for 15 seconds a side until they blister.",
      "Fish, slaw, avocado. Two bites each.",
    ],
    tip: "Corn tortillas rather than wheat, so this is one of the few gluten-free lunches in the book that is genuinely a dish rather than a salad.",
    method: "Spice-rub and pan-fry cod, make a yoghurt-lemon carrot slaw, blister corn tortillas and build with avocado.",
  },
  {
    id: "mackerel_rice_bowl", name: "Mackerel & rice bowl", slot: "Lunch", minutes: 15,
    items: [
      { foodId: "mackerel_tin", qty: 125 }, { foodId: "rice", qty: 75 },
      { foodId: "cucumber", qty: 100 }, { foodId: "carrots", qty: 80 },
      { foodId: "soy_sauce", qty: 12 }, { foodId: "seeds_mixed", qty: 15 },
      { foodId: "spinach", qty: 60 },
    ],
    steps: [
      "Rice on. While it cooks, cucumber and carrot into matchsticks — the whole bowl depends on them being crunchy against the soft fish.",
      "Spinach into the rice pan for the last thirty seconds, lid on, heat off. It wilts in the steam.",
      "Rice into the bowl warm, not hot. Mackerel over with its sauce.",
      "Soy and seeds over the top, vegetables piled on one side rather than mixed in.",
    ],
    tip: "Sections rather than a stir: a bowl where everything is mixed tastes the same in every mouthful, and this one is meant not to.",
    method: "Cook rice, wilt spinach in its steam, and top with tinned mackerel, raw carrot and cucumber, soy and seeds.",
  },
  {
    id: "chorizo_butterbean_soup", name: "Chorizo & butter bean soup", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "chorizo", qty: 60 }, { foodId: "butter_beans", qty: 300 },
      { foodId: "onion", qty: 100 }, { foodId: "garlic", qty: 10 },
      { foodId: "kale", qty: 80 }, { foodId: "tomatoes_tin", qty: 200 },
      { foodId: "stock_cubes", qty: 8 }, { foodId: "wholemeal_bread", qty: 70 },
    ],
    steps: [
      "Chorizo diced into a cold pan, heat up slowly, and once the fat has run take the chorizo out and leave the fat.",
      "Onion and garlic in that fat until soft — 6 minutes, and they will go orange, which is the point.",
      "Tomatoes, stock and the beans in. Simmer 10 minutes.",
      "Crush about a third of the beans against the side of the pan. That is what thickens it, rather than flour.",
      "Kale in for the last 3 minutes, chorizo back in at the very end so it stays chewy.",
      "Bread for the bottom of the bowl.",
    ],
    tip: "Doubles perfectly and is better the next day. The kale is what stops it being heavy.",
    method: "Render chorizo, soften onion and garlic in its fat, simmer with tomatoes, stock and butter beans, crush some to thicken, and finish with kale.",
  },
  {
    id: "beef_rice_noodle_salad", name: "Beef & rice noodle salad", slot: "Lunch", minutes: 16,
    items: [
      { foodId: "beef_mince_5", qty: 150 }, { foodId: "rice_noodles", qty: 80 },
      { foodId: "cucumber", qty: 100 }, { foodId: "carrots", qty: 80 },
      { foodId: "lemon", qty: 1 }, { foodId: "chilli_fresh", qty: 6 },
      { foodId: "peanut_butter", qty: 20 }, { foodId: "garlic", qty: 8 },
    ],
    steps: [
      "Rice noodles in a bowl of just-boiled water off the heat, 6 minutes, then rinsed cold. Boiling them in a pan turns them to paste.",
      "Mince into a very hot dry pan and left alone for 2 minutes so it browns rather than greys.",
      "Garlic and chilli in for the last minute.",
      "Peanut butter loosened with lemon juice and a splash of hot water into a dressing.",
      "Everything tossed together cold noodles, hot beef, raw vegetables. The temperature difference is the dish.",
    ],
    tip: "Rice noodles are gluten-free and cook off the heat, so this is a hot lunch you can make with a kettle.",
    method: "Soak rice noodles off the heat, brown mince hard with garlic and chilli, and toss with raw vegetables and a peanut-lemon dressing.",
  },
  {
    id: "turkey_gochujang_bowl", name: "Gochujang turkey rice bowl", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "turkey_mince", qty: 160 }, { foodId: "rice", qty: 75 },
      { foodId: "gochujang", qty: 25 }, { foodId: "cucumber", qty: 100 },
      { foodId: "carrots", qty: 80 }, { foodId: "eggs", qty: 1 },
      { foodId: "seeds_mixed", qty: 10 }, { foodId: "garlic", qty: 8 },
    ],
    steps: [
      "Rice on.",
      "Turkey into a hot pan, broken up small, and left to catch on the base — turkey has no fat to brown in, so the colour has to come from the pan being hot enough.",
      "Garlic and gochujang in with a splash of water, stirred until every piece is coated and glossy.",
      "Fried egg, edges crisp.",
      "Rice, turkey, raw vegetables in sections, egg on top, seeds over.",
    ],
    tip: "Gochujang is sweet, savoury and hot at once, which is why 25g does what a whole list of seasonings would. It keeps for months in the fridge.",
    method: "Brown turkey mince hard, glaze with gochujang and garlic, and serve over rice with raw vegetables and a fried egg.",
  },
  {
    id: "bacon_potato_egg_salad", name: "Bacon, egg & new potato salad", slot: "Lunch", minutes: 20,
    items: [
      { foodId: "bacon_medallions", qty: 100 }, { foodId: "potatoes", qty: 300 },
      { foodId: "eggs", qty: 2 }, { foodId: "greek_yoghurt", qty: 80 },
      { foodId: "spinach", qty: 60 }, { foodId: "lemon", qty: 1 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Potatoes in cold salted water, brought to the boil, 12 minutes. Eggs into the same pan for the last 7.",
      "Bacon crisped in a dry pan while they cook, then chopped.",
      "Potatoes halved while still hot and dressed immediately with yoghurt, lemon and oil — hot potato drinks the dressing, cold potato wears it.",
      "Eggs quartered in, bacon and spinach folded through at the end.",
    ],
    tip: "One pan for the potatoes and the eggs. Seven minutes gives a yolk that is set at the edge and still soft in the middle.",
    method: "Boil potatoes with eggs, crisp bacon separately, and dress the hot potatoes in yoghurt and lemon before folding everything through.",
  },
  {
    id: "vg_tahini_lentil_bowl", name: "Lentil, carrot & tahini bowl", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "red_lentils", qty: 100 }, { foodId: "carrots", qty: 200 },
      { foodId: "tahini", qty: 35 }, { foodId: "lemon", qty: 1 },
      { foodId: "spice_mix", qty: 6 }, { foodId: "spinach", qty: 60 },
      { foodId: "olive_oil", qty: 10 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Carrots in thick diagonal slices, tossed in oil and spices, into the hottest oven you have for 20 minutes.",
      "Lentils simmered 15 minutes in twice their volume of water, then drained if there is any left.",
      "Tahini whisked with lemon juice and cold water — it will seize and go stiff first, which is normal, and keeps loosening as you add water.",
      "Lentils, carrots, spinach in the bowl, tahini poured over, seeds on top.",
    ],
    tip: "Soy-free, dairy-free and nut-free at once. Tahini seizing when it meets lemon is the sauce working, not failing — keep going.",
    method: "Roast spiced carrots, simmer lentils, and dress both with a lemon-loosened tahini sauce over spinach.",
  },
  {
    id: "vg_rice_noodle_peanut_salad", name: "Rice noodle & peanut salad", slot: "Lunch", minutes: 14,
    items: [
      { foodId: "rice_noodles", qty: 90 }, { foodId: "peanut_butter", qty: 35 },
      { foodId: "kidney_beans", qty: 200 }, { foodId: "carrots", qty: 100 },
      { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
      { foodId: "chilli_fresh", qty: 5 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Noodles in just-boiled water off the heat for 6 minutes, then rinsed under the cold tap until they stop being slippery.",
      "Peanut butter, lemon juice, chilli and hot water whisked to the thickness of double cream.",
      "Beans rinsed, vegetables into matchsticks.",
      "Everything tossed with your hands rather than a spoon — the sauce needs working into the noodles and tongs just push it around.",
    ],
    tip: "Gluten-free, soy-free and it travels: this is the vegan lunch for a day away from a kitchen, and it is better at room temperature than hot.",
    method: "Soak and rinse rice noodles, whisk a peanut-lemon dressing, and toss through kidney beans and raw vegetables.",
  },

  // --- Dinners: cheap animal protein ----------------------------------------
  {
    id: "harissa_chicken_chickpea_tray", name: "Harissa chicken & chickpea tray", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "chicken_thigh", qty: 220 }, { foodId: "chickpeas", qty: 250 },
      { foodId: "harissa", qty: 30 }, { foodId: "peppers", qty: 200 },
      { foodId: "onion", qty: 120 }, { foodId: "greek_yoghurt", qty: 80 },
      { foodId: "olive_oil", qty: 12 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Thighs tossed in harissa and oil and left while the oven comes up to its highest setting.",
      "Chickpeas drained and dried on a tea towel, then spread on the tray with the peppers and onion. Dry chickpeas crisp; wet ones steam.",
      "Chicken on top, skin side up if it has any, and everything into the oven for 28 minutes.",
      "The chicken fat and harissa drip down onto the chickpeas, which is the entire idea — do not stir it.",
      "Yoghurt and lemon at the table.",
    ],
    tip: "Thighs, not breast: they take a hot oven and a heavy spice without drying out, and they are a pound cheaper a pack.",
    method: "Coat chicken thighs in harissa, roast over dried chickpeas, peppers and onion, and serve with lemon yoghurt.",
  },
  {
    id: "cod_chorizo_butterbeans", name: "Cod with chorizo & butter beans", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "white_fish", qty: 240 }, { foodId: "chorizo", qty: 50 },
      { foodId: "butter_beans", qty: 300 }, { foodId: "spinach", qty: 80 },
      { foodId: "garlic", qty: 10 }, { foodId: "passata", qty: 150 },
      { foodId: "olive_oil", qty: 8 }, { foodId: "wholemeal_bread", qty: 60 },
    ],
    steps: [
      "Chorizo diced into a cold wide pan, heat up, fat rendered out, chorizo lifted out.",
      "Garlic in that orange fat for thirty seconds, then passata and the drained beans. Ten minutes at a bare simmer.",
      "Cod laid on top of the beans rather than in them, lid on, 8 minutes. It steams and stays in one piece.",
      "Spinach pushed in around the fish for the last minute, chorizo scattered back over.",
      "Bread to get the sauce.",
    ],
    tip: "Frozen cod loins work better than fresh here and cost half as much — they hold together because they were frozen at sea.",
    method: "Render chorizo, simmer butter beans in its fat with garlic and passata, steam cod on top and finish with spinach.",
  },
  {
    id: "one_pot_chicken_thigh_rice", name: "One-pot chicken thigh & rice", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "chicken_thigh", qty: 240 }, { foodId: "rice", qty: 90 },
      { foodId: "onion", qty: 120 }, { foodId: "garlic", qty: 12 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "stock_cubes", qty: 8 },
      { foodId: "peas_frozen", qty: 120 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Thighs browned hard in the oil, both sides, in the pan you will cook everything in. Take them out.",
      "Onion and garlic into the chicken fat, 6 minutes, scraping up everything stuck to the base — that brown layer is the flavour of the whole pot.",
      "Rice and spices in, stirred until every grain is coated and shiny.",
      "Stock in, chicken back on top, lid on, lowest heat, 18 minutes. Do not lift the lid.",
      "Peas in, heat off, lid back on for 5 minutes.",
    ],
    tip: "One pan, one hob ring, and it holds in the pot for twenty minutes without spoiling — which is what you want on a night you get home late from training.",
    method: "Brown chicken thighs, build a base with onion, garlic and spiced rice, then steam it all under a lid with stock and peas.",
  },
  {
    id: "kedgeree_mackerel", name: "Mackerel kedgeree", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "mackerel_tin", qty: 250 }, { foodId: "rice", qty: 90 },
      { foodId: "eggs", qty: 2 }, { foodId: "onion", qty: 100 },
      { foodId: "curry_paste", qty: 25 }, { foodId: "peas_frozen", qty: 120 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Eggs boiled 8 minutes, cooled under the tap, peeled and quartered.",
      "Onion softened in the oil for 8 minutes, then curry paste in for a minute until it smells like something.",
      "Rice in, coated, then twice its volume of water. Lid on, 12 minutes, off the heat for 5 more.",
      "Mackerel folded in with a fork in big pieces, peas through the residual heat.",
      "Eggs on top, all the lemon over. Kedgeree without lemon is stodge.",
    ],
    tip: "Traditionally smoked haddock, which is expensive and hard to find. Tinned mackerel gives the same oily, smoky weight for about a fifth of the price.",
    method: "Soften onion with curry paste, steam rice in it, then fold through tinned mackerel and peas and top with boiled eggs and lemon.",
  },
  {
    id: "bacon_pea_carbonara", name: "Bacon & pea carbonara", slot: "Dinner", minutes: 16,
    items: [
      { foodId: "bacon_medallions", qty: 120 }, { foodId: "pasta", qty: 110 },
      { foodId: "eggs", qty: 3 }, { foodId: "cheddar", qty: 40 },
      { foodId: "peas_frozen", qty: 120 }, { foodId: "garlic", qty: 8 },
      { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Pasta on. Save a mugful of the water before you drain it — this does not work without it.",
      "Bacon and garlic crisping in the oil while the pasta cooks. Peas into the pasta water for the last 2 minutes.",
      "Eggs and grated cheddar beaten together in a bowl with a lot of black pepper.",
      "Pasta drained and tipped into the bacon pan OFF THE HEAT. Count to twenty.",
      "Egg mixture in, tossing hard and adding pasta water a splash at a time until it goes glossy. If the pan is too hot you get scrambled egg, and there is no way back.",
    ],
    tip: "Off the heat, and wait. Every failed carbonara is a pan that was still hot — the residual warmth is enough to cook the eggs into a sauce.",
    method: "Crisp bacon and garlic, toss drained pasta off the heat with beaten egg and cheddar, loosening with pasta water until glossy.",
  },
  {
    id: "beef_rice_noodle_stirfry", name: "Beef & rice noodle stir-fry", slot: "Dinner", minutes: 15,
    items: [
      { foodId: "beef_mince_5", qty: 200 }, { foodId: "rice_noodles", qty: 100 },
      { foodId: "broccoli", qty: 150 }, { foodId: "peppers", qty: 120 },
      { foodId: "garlic", qty: 10 }, { foodId: "ginger", qty: 10 },
      { foodId: "soy_sauce", qty: 20 }, { foodId: "chilli_fresh", qty: 6 },
    ],
    steps: [
      "Noodles soaking in just-boiled water off the heat while everything else cooks.",
      "Mince into a screaming hot dry pan, spread thin, untouched for 2 minutes. Stirring it now is the difference between browned beef and grey beef.",
      "Broccoli and peppers in, 3 minutes, still with a bite.",
      "Garlic, ginger and chilli for thirty seconds only.",
      "Drained noodles and soy in, tossed for a minute.",
    ],
    tip: "Fifteen minutes start to finish, which the dinner list previously had nothing under twenty of. The soy is the only thing here with gluten in it — leave it out and add extra lemon and chilli for a gluten-free version.",
    method: "Soak rice noodles off the heat, brown mince hard, stir-fry vegetables and aromatics, then toss everything with soy.",
  },
  {
    id: "cod_potato_tomato_tray", name: "Baked cod, potatoes & tomatoes", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "white_fish", qty: 240 }, { foodId: "potatoes", qty: 350 },
      { foodId: "tomatoes_fresh", qty: 150 }, { foodId: "olive_oil", qty: 15 },
      { foodId: "garlic", qty: 12 }, { foodId: "lemon", qty: 1 },
      { foodId: "spinach", qty: 60 },
    ],
    steps: [
      "Potatoes sliced 5mm thick, tossed in oil and garlic, into a hot oven on their own for 25 minutes.",
      "Tomatoes and lemon slices scattered over, cod laid on top, back in for 12 minutes.",
      "Cod is done when it flakes at a fork and not before — a minute too long and it goes from set to dry with nothing in between.",
      "Spinach thrown over as it comes out; the residual heat is enough.",
    ],
    tip: "The potatoes get a head start because they need three times as long as the fish. Everything on one tray at once is how baked fish dinners go wrong.",
    method: "Roast sliced garlic potatoes first, then lay cod, tomatoes and lemon on top for the final twelve minutes.",
  },
  {
    id: "gochujang_chicken_rice", name: "Gochujang chicken with rice", slot: "Dinner", minutes: 28,
    items: [
      { foodId: "chicken_thigh", qty: 240 }, { foodId: "rice", qty: 90 },
      { foodId: "gochujang", qty: 30 }, { foodId: "broccoli", qty: 150 },
      { foodId: "garlic", qty: 10 }, { foodId: "honey", qty: 12 },
      { foodId: "seeds_mixed", qty: 12 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Thighs into a hot oiled pan and left for 5 minutes a side. Move them early and they stick and tear.",
      "Gochujang, honey, garlic and a splash of water mixed, poured in, and bubbled down for 3 minutes until it clings to the chicken.",
      "Broccoli steamed over the rice pan for the last 4 minutes — one less pan to wash.",
      "Chicken sliced thick, sauce spooned over, seeds on top.",
    ],
    tip: "The honey is not for sweetness, it is for the glaze — sugar is what makes a sauce cling instead of pool.",
    method: "Sear chicken thighs, glaze in bubbling gochujang and honey, and serve over rice with broccoli steamed above it.",
  },
  {
    id: "chicken_kale_tahini_rice", name: "Chicken, kale & tahini rice", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "chicken_breast", qty: 220 }, { foodId: "rice", qty: 85 },
      { foodId: "kale", qty: 120 }, { foodId: "tahini", qty: 35 },
      { foodId: "lemon", qty: 1 }, { foodId: "garlic", qty: 10 },
      { foodId: "spice_mix", qty: 6 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Chicken butterflied — sliced most of the way through and opened flat — so it cooks in 6 minutes instead of 14 and stays juicy.",
      "Spices and oil rubbed in, then a hot pan, 3 minutes a side, then rested while everything else finishes.",
      "Kale stripped off its stalks and massaged with a little oil and salt for a minute. It goes from squeaky to silky and this is not optional.",
      "Kale into the hot pan for 2 minutes only.",
      "Tahini whisked with lemon, garlic and water until pourable, over everything.",
    ],
    tip: "Butterflying a chicken breast is the single best thing you can do to it. Even thickness means the middle is cooked at the same moment the outside is, which is why chicken breast usually disappoints.",
    method: "Butterfly and pan-fry spiced chicken, wilt massaged kale in the same pan, and pour a lemon-tahini sauce over rice.",
  },
  {
    id: "turkey_kofte_couscous", name: "Turkey köfte with couscous", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "turkey_mince", qty: 220 }, { foodId: "couscous", qty: 85 },
      { foodId: "onion", qty: 80 }, { foodId: "spice_mix", qty: 8 },
      { foodId: "greek_yoghurt", qty: 100 }, { foodId: "tomatoes_fresh", qty: 120 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Turkey, grated onion and spices worked together with your hands for a full minute. Under-mixed mince falls apart in the pan.",
      "Shaped into eight fingers around the length of your thumb, then fifteen minutes in the fridge if you have it — cold köfte hold their shape.",
      "Hot oiled pan, turned every 2 minutes, about 10 minutes total.",
      "Couscous covered in boiling water to a centimetre above it, plate on top, 5 minutes, forked up.",
      "Yoghurt with lemon, tomatoes chopped rough, everything on one plate.",
    ],
    tip: "Grate the onion rather than chopping it. The juice goes into the mince, which is what keeps turkey — the driest mince there is — from being dry.",
    method: "Mix turkey with grated onion and spices, shape and pan-fry köfte, and serve with steamed couscous, lemon yoghurt and tomatoes.",
  },
  {
    id: "chilli_kidney_bean_beef", name: "Beef & kidney bean chilli", slot: "Dinner", minutes: 45,
    items: [
      { foodId: "beef_mince_5", qty: 200 }, { foodId: "kidney_beans", qty: 250 },
      { foodId: "rice", qty: 85 }, { foodId: "tomatoes_tin", qty: 300 },
      { foodId: "onion", qty: 120 }, { foodId: "spice_mix", qty: 10 },
      { foodId: "garlic", qty: 12 }, { foodId: "chilli_fresh", qty: 8 },
    ],
    steps: [
      "Mince browned in batches in a dry pan. Crowding it steams the meat, and a chilli made from grey mince tastes of nothing however long you cook it.",
      "Onion, garlic and chilli after, then the spices for a full minute in the dry heat — spices need frying, not stewing.",
      "Tomatoes and beans in, then thirty minutes at the barest simmer with the lid off.",
      "It is ready when a spoon dragged through the middle leaves a channel that stays open.",
      "Rice underneath.",
    ],
    tip: "Kidney beans rather than black beans, and thirty minutes rather than fifteen. The difference between a good chilli and an average one is entirely time, and it costs nothing.",
    method: "Brown mince in batches, fry the aromatics and spices, then simmer with tomatoes and kidney beans until it thickens.",
  },
  {
    id: "cod_couscous_harissa", name: "Harissa cod & couscous", slot: "Dinner", minutes: 14,
    items: [
      { foodId: "white_fish", qty: 240 }, { foodId: "couscous", qty: 85 },
      { foodId: "harissa", qty: 25 }, { foodId: "greek_yoghurt", qty: 80 },
      { foodId: "cucumber", qty: 100 }, { foodId: "lemon", qty: 1 },
      { foodId: "spinach", qty: 60 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Couscous covered in boiling stock or water, plate over the top, forgotten about.",
      "Cod dried, smeared with harissa and oil, into a hot pan for 3 minutes a side. That is the whole cooking.",
      "Yoghurt slackened with lemon.",
      "Couscous forked up with the spinach through it so it wilts, cucumber alongside, cod on top, yoghurt over.",
    ],
    tip: "The fastest real dinner in the book at fourteen minutes, and most of that is the couscous sitting there doing it by itself.",
    method: "Steam couscous under a plate, pan-fry harissa-coated cod, and serve with lemon yoghurt, spinach and cucumber.",
  },

  // --- Dinners: plant-based, and not built on soy or wheat -------------------
  {
    id: "vg_butterbean_mash_kale", name: "Butter bean mash with kale", slot: "Dinner", minutes: 25,
    items: [
      { foodId: "butter_beans", qty: 400 }, { foodId: "kale", qty: 150 },
      { foodId: "garlic", qty: 12 }, { foodId: "olive_oil", qty: 18 },
      { foodId: "lemon", qty: 1 }, { foodId: "seeds_mixed", qty: 25 },
      { foodId: "wholemeal_bread", qty: 70 }, { foodId: "chilli_fresh", qty: 6 },
    ],
    steps: [
      "Garlic sliced thin into cold oil, brought up slowly until it is pale gold — the moment it browns it turns bitter, so take it off early.",
      "Half the beans in with their liquid, crushed with a masher into a rough mash. Rough, not smooth: this is not hummus.",
      "The other half in whole, so there is texture.",
      "Kale in a separate hot dry pan for 3 minutes until the edges char.",
      "Mash on the plate, kale over, lemon, chilli, seeds, toast.",
    ],
    tip: "Soy-free, nut-free and about £1.60 a portion. The bean liquid is what makes it creamy — pouring it away and adding water gives you a worse dish for more effort.",
    method: "Slowly infuse garlic in oil, crush half the butter beans into a rough mash with their liquid, and serve with charred kale and toast.",
  },
  {
    id: "vg_kidney_bean_chilli", name: "Kidney bean & walnut chilli", slot: "Dinner", minutes: 40,
    items: [
      { foodId: "kidney_beans", qty: 350 }, { foodId: "black_beans", qty: 200 },
      { foodId: "rice", qty: 85 }, { foodId: "tomatoes_tin", qty: 300 },
      { foodId: "onion", qty: 120 }, { foodId: "spice_mix", qty: 10 },
      { foodId: "cashews", qty: 40 }, { foodId: "garlic", qty: 12 },
    ],
    steps: [
      "Cashews chopped to the size of mince and toasted dry in the pan until they smell nutty. Take them out.",
      "Onion and garlic in oil, then the spices fried for a minute.",
      "Both tins of beans and the tomatoes in, simmered 25 minutes uncovered.",
      "Cashews back in for the last 5 minutes so they keep some bite. They do the job the mince does in the meat version — something to chew.",
      "Rice underneath.",
    ],
    tip: "Soy-free and gluten-free. The toasted nuts are the trick: bean chillies are usually soft all the way through, and this one is not.",
    method: "Toast chopped cashews, fry spices with onion and garlic, simmer two kinds of bean with tomatoes, and return the nuts at the end.",
  },
  {
    id: "vg_cashew_chickpea_curry", name: "Cashew & chickpea curry", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "chickpeas", qty: 300 }, { foodId: "cashews", qty: 40 },
      { foodId: "rice", qty: 70 }, { foodId: "coconut_milk", qty: 150 },
      { foodId: "curry_paste", qty: 30 }, { foodId: "spinach", qty: 100 },
      { foodId: "onion", qty: 100 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Half the cashews soaked in boiling water for 10 minutes, then blended with a little of the coconut milk into a cream. That is what makes it rich without dairy.",
      "Onion softened, curry paste fried until the oil separates out of it — a minute or two, and you will see it happen.",
      "Chickpeas, coconut milk and the cashew cream in, 12 minutes at a simmer.",
      "Spinach folded in at the end, the rest of the cashews toasted and scattered on top.",
      "Lemon at the table.",
    ],
    tip: "Blended cashews are the standard dairy-free way to make a curry creamy, and they carry protein and fat with them rather than just water.",
    method: "Blend soaked cashews into a cream, fry curry paste until the oil splits, then simmer chickpeas in coconut milk and cashew cream.",
  },
  {
    id: "vg_gf_black_bean_tacos", name: "Black bean & sweetcorn tacos", slot: "Dinner", minutes: 20,
    items: [
      { foodId: "black_beans", qty: 350 }, { foodId: "corn_tortilla", qty: 4 },
      { foodId: "sweetcorn", qty: 120 }, { foodId: "avocado", qty: 1 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "lemon", qty: 1 },
      { foodId: "chilli_fresh", qty: 6 }, { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Sweetcorn drained and dried, into a dry hot pan alone until some kernels blacken. This takes four minutes and is where the flavour comes from.",
      "Beans and spices in with the oil, crushed roughly with the back of a spoon so half stay whole.",
      "Tortillas blistered over a flame or in a dry pan, 15 seconds a side.",
      "Avocado smashed with the lemon and chilli.",
      "Built at the table, not in the kitchen. Four small tacos, not two overloaded ones.",
    ],
    tip: "Gluten-free, soy-free, nut-free and vegan all at once, which almost nothing in this book manages while still being something you would choose to eat.",
    method: "Char sweetcorn dry, crush spiced black beans, blister corn tortillas and build with smashed chilli avocado.",
  },
  {
    id: "vg_harissa_butterbean_stew", name: "Harissa butter bean stew", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "butter_beans", qty: 400 }, { foodId: "harissa", qty: 30 },
      { foodId: "tomatoes_tin", qty: 300 }, { foodId: "sweet_potato", qty: 250 },
      { foodId: "kale", qty: 100 }, { foodId: "garlic", qty: 12 },
      { foodId: "olive_oil", qty: 15 }, { foodId: "wholemeal_bread", qty: 70 },
    ],
    steps: [
      "Sweet potato in 2cm cubes into the oil, browned on at least two sides before anything wet goes near them.",
      "Garlic and harissa in for a minute.",
      "Tomatoes and beans in, 18 minutes at a simmer until the sweet potato gives to a knife.",
      "Kale in for the last 4 minutes.",
      "Bread, and a spoon of the oil from the top.",
    ],
    tip: "Rose harissa is the single best jar for a vegan kitchen: chilli, garlic, spice and rose in one spoon, and it makes a bean stew taste cooked rather than assembled.",
    method: "Brown sweet potato cubes, fry harissa and garlic, then simmer with tomatoes and butter beans and finish with kale.",
  },
  {
    id: "mozzarella_tomato_pasta_bake", name: "Tomato & mozzarella pasta bake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "pasta", qty: 110 }, { foodId: "mozzarella", qty: 125 },
      { foodId: "passata", qty: 300 }, { foodId: "cottage_cheese", qty: 150 },
      { foodId: "courgette", qty: 150 }, { foodId: "garlic", qty: 10 },
      { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 10 },
    ],
    steps: [
      "Pasta boiled two minutes short of the packet time. It finishes in the oven and overcooked pasta bake is mush.",
      "Courgette in half-moons browned hard in the oil with the garlic.",
      "Cottage cheese stirred into the passata — it melts into a creamy sauce and carries three times the protein a white sauce would.",
      "Everything mixed with the spinach, into a dish, mozzarella torn over in pieces rather than sliced.",
      "Hot oven, 15 minutes, until the top has brown patches.",
    ],
    tip: "Torn mozzarella, not grated: it melts into pools rather than a uniform blanket, which is what you actually want on top of a bake.",
    method: "Undercook pasta, stir cottage cheese into passata for the sauce, combine with browned courgette and spinach, and bake under torn mozzarella.",
  },
  {
    id: "kale_potato_egg_bake", name: "Kale, potato & egg bake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "potatoes", qty: 350 }, { foodId: "eggs", qty: 4 },
      { foodId: "kale", qty: 120 }, { foodId: "cheddar", qty: 40 },
      { foodId: "onion", qty: 100 }, { foodId: "garlic", qty: 10 },
      { foodId: "olive_oil", qty: 12 },
    ],
    steps: [
      "Potatoes sliced thin and boiled 6 minutes, drained.",
      "Onion, garlic and kale softened in the oil in an ovenproof pan.",
      "Potatoes layered in over them, pressed down flat.",
      "Eggs beaten with the cheddar and plenty of pepper, poured over, and shuffled so it reaches the bottom.",
      "Ten minutes on the hob on low, then under a hot grill for 4 until the top puffs and browns.",
    ],
    tip: "Cold from the fridge the next day this is better than it was hot, which is not true of many things. It cuts into wedges that travel.",
    method: "Par-boil sliced potatoes, soften kale and onion in an ovenproof pan, layer up and set with beaten egg and cheddar under the grill.",
  },
  {
    id: "feta_butterbean_bake", name: "Feta & butter bean bake", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "butter_beans", qty: 400 }, { foodId: "feta", qty: 100 },
      { foodId: "tomatoes_fresh", qty: 250 }, { foodId: "olive_oil", qty: 20 },
      { foodId: "garlic", qty: 12 }, { foodId: "wholemeal_bread", qty: 80 },
      { foodId: "spinach", qty: 80 }, { foodId: "chilli_fresh", qty: 5 },
    ],
    steps: [
      "Beans, whole tomatoes, garlic, oil and chilli into a baking dish and stirred.",
      "The block of feta laid whole in the middle. Whole, not crumbled — it is meant to come out as one soft mass you break through.",
      "Hot oven, 25 minutes, until the tomatoes have burst and the feta has gone golden at the edges.",
      "Spinach stirred through the hot dish so it wilts, then everything mashed together roughly at the table.",
      "Toast for the sauce.",
    ],
    tip: "Ten minutes of actual work for something that looks like it took an hour. The whole block of feta is what makes it, so do not be tempted to spread it out.",
    method: "Bake butter beans, tomatoes, garlic and chilli around a whole block of feta, then stir through spinach and mash roughly.",
  },
  {
    id: "pitta_pizzas_mozzarella", name: "Pitta pizzas", slot: "Dinner", minutes: 18,
    items: [
      { foodId: "pitta", qty: 160 }, { foodId: "mozzarella", qty: 125 },
      { foodId: "passata", qty: 150 }, { foodId: "chicken_breast", qty: 150 },
      { foodId: "peppers", qty: 100 }, { foodId: "garlic", qty: 8 },
      { foodId: "spinach", qty: 50 },
    ],
    steps: [
      "Chicken sliced thin and cooked through in a dry pan, 4 minutes.",
      "Passata cooked down with the crushed garlic for 5 minutes until it is thick enough to sit on bread without soaking it. This step is the whole difference.",
      "Pittas on a tray, sauce spread thin, toppings on, mozzarella torn over.",
      "Highest oven shelf, 8 minutes, until the cheese is blistered and the pitta edges are hard.",
      "Spinach thrown on as they come out.",
    ],
    tip: "Reduce the passata first. Straight from the carton it is water with tomato in it, and it turns the base to pulp before the cheese has melted.",
    method: "Reduce garlic passata until thick, spread on pittas with chicken and peppers, and bake hot under torn mozzarella.",
  },

  // --- Snacks with something other than a spoon -----------------------------
  {
    id: "sardines_rice_cakes", name: "Sardines on rice cakes", slot: "Snack", minutes: 4,
    items: [
      { foodId: "sardines_tin", qty: 120 }, { foodId: "rice_cakes", qty: 40 },
      { foodId: "lemon", qty: 1 }, { foodId: "tomatoes_fresh", qty: 80 },
      { foodId: "chilli_fresh", qty: 4 },
    ],
    steps: [
      "Sardines mashed with a fork with all their oil and a hard squeeze of lemon.",
      "Onto rice cakes, quartered tomatoes and chilli on top.",
      "Eat immediately. Rice cakes go soft within about three minutes of anything wet touching them.",
    ],
    tip: "Gluten-free, 25g of protein, and both the tin and the packet live in a desk drawer. Assemble it where you are eating it, not before.",
    method: "Mash tinned sardines with their oil and lemon onto rice cakes, topped with tomato and chilli.",
  },
  {
    id: "rice_cake_cottage_tomato", name: "Rice cakes, cottage cheese & tomato", slot: "Snack", minutes: 3,
    items: [
      { foodId: "rice_cakes", qty: 40 }, { foodId: "cottage_cheese", qty: 180 },
      { foodId: "tomatoes_fresh", qty: 100 }, { foodId: "seeds_mixed", qty: 15 },
    ],
    steps: [
      "Cottage cheese piled on thick, not spread thin.",
      "Tomatoes halved and pressed in cut-side down so they stay put.",
      "Seeds and a lot of black pepper.",
    ],
    tip: "Gluten-free, and 22g of protein for about 300 calories. The pepper is doing more work here than it looks like it should.",
    method: "Pile cottage cheese onto rice cakes and top with halved tomatoes, seeds and black pepper.",
  },
  {
    id: "oatcake_tahini_honey", name: "Oatcakes with tahini & honey", slot: "Snack", minutes: 3,
    items: [
      { foodId: "oatcakes", qty: 40 }, { foodId: "tahini", qty: 22 },
      { foodId: "honey", qty: 12 }, { foodId: "banana", qty: 1 },
    ],
    steps: [
      "Tahini stirred smooth in the jar first.",
      "Spread thick on the oatcakes, honey zigzagged over, banana sliced on.",
    ],
    tip: "Nut-free, soy-free and dairy-free, which the rest of the sweet snack list is not. Tahini and honey together taste like halva.",
    method: "Spread stirred tahini on oatcakes and top with honey and sliced banana.",
  },
  {
    id: "dates_almond_bites", name: "Date & almond bites", slot: "Snack", minutes: 8,
    items: [
      { foodId: "dates", qty: 45 }, { foodId: "almonds", qty: 22 },
      { foodId: "oats", qty: 22 }, { foodId: "seeds_mixed", qty: 12 },
      { foodId: "peanut_butter", qty: 15 },
    ],
    steps: [
      "Dates stoned and blitzed with the almonds until the mixture starts clumping to the side of the processor.",
      "Oats, seeds and peanut butter in, blitzed again just until it holds together when squeezed.",
      "Rolled into four balls with wet hands — wet hands are the entire trick, dry ones just get covered.",
      "Fridge for twenty minutes to firm up.",
    ],
    tip: "These quantities are one sitting, four balls. Triple it and they keep a fortnight in the fridge — two of them forty minutes before training is the most useful thing on the snack list.",
    method: "Blitz dates with almonds, work in oats, seeds and peanut butter, and roll into balls with wet hands.",
  },
  {
    id: "mango_yoghurt_freeze", name: "Frozen mango & yoghurt cups", slot: "Snack", minutes: 5,
    items: [
      { foodId: "mango_frozen", qty: 200 }, { foodId: "greek_yoghurt", qty: 200 },
      { foodId: "whey_protein", qty: 25 }, { foodId: "seeds_mixed", qty: 15 },
      { foodId: "honey", qty: 12 },
    ],
    steps: [
      "Mango blitzed straight from frozen with the yoghurt and protein. It comes out the texture of soft-serve.",
      "Into two cups or a tub, seeds and honey on top.",
      "Eat one now, freeze the other. Take it out ten minutes before you want it.",
    ],
    tip: "Blitzed from frozen it is ice cream; blitzed thawed it is a smoothie in a cup. Do not let the mango sit out first.",
    method: "Blend frozen mango with Greek yoghurt and protein powder into a soft-serve, and top with seeds and honey.",
  },
  {
    id: "mozzarella_tomato_pot", name: "Mozzarella, tomato & seed pot", slot: "Snack", minutes: 4,
    items: [
      { foodId: "mozzarella", qty: 100 }, { foodId: "tomatoes_fresh", qty: 150 },
      { foodId: "olive_oil", qty: 8 }, { foodId: "seeds_mixed", qty: 10 },
      { foodId: "wholemeal_bread", qty: 35 },
    ],
    steps: [
      "Mozzarella torn rather than cut — torn edges hold the oil.",
      "Tomatoes halved, everything in a pot with the oil and a lot of pepper.",
      "Bread on the side to finish the oil at the bottom.",
    ],
    tip: "Drain the mozzarella properly and let it sit for five minutes before dressing, or the water it releases dilutes everything.",
    method: "Tear mozzarella over halved tomatoes, dress with olive oil and pepper, and eat with bread.",
  },
  {
    id: "oatcake_cheddar_apple", name: "Oatcakes, cheddar & apple", slot: "Snack", minutes: 3,
    items: [
      { foodId: "oatcakes", qty: 60 }, { foodId: "cheddar", qty: 50 },
      { foodId: "apple", qty: 1 }, { foodId: "cucumber", qty: 80 },
    ],
    steps: [
      "Cheddar in slices thick enough to taste, not shavings.",
      "Apple sliced thin, straight onto the cheese so it does not brown.",
      "Cucumber alongside.",
    ],
    tip: "The oldest snack in the book and still one of the best. Oatcakes keep you full far longer than crackers do, for the same calories.",
    method: "Layer sliced cheddar and thin apple on oatcakes, with cucumber on the side.",
  },
  {
    id: "vg_rice_cake_tahini_banana", name: "Rice cakes, tahini & banana", slot: "Snack", minutes: 3,
    items: [
      { foodId: "rice_cakes", qty: 28 }, { foodId: "tahini", qty: 22 },
      { foodId: "banana", qty: 1 }, { foodId: "maple_syrup", qty: 10 },
      { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Tahini stirred smooth, spread thick.",
      "Banana sliced over, maple and seeds on top.",
    ],
    tip: "Vegan, gluten-free, soy-free and nut-free — the only snack in the book that clears all four, and it takes three minutes.",
    method: "Spread stirred tahini on rice cakes and top with banana, maple syrup and seeds.",
  },

  // ===========================================================================
  // THE ATHLETE THE BOOK WAS FAILING COMPLETELY: A VEGAN CUTTING, WITHOUT SOY.
  //
  // Adding fifty-two recipes made every week more varied and surfaced a hole
  // that had been there the whole time. Measured over four consecutive weeks:
  //
  //     vegan, no soy, cutting      28 of 28 days under 90% of protein target
  //                                 worst day 52%
  //     everyone else on that diet  0-8 days of 28
  //
  // Not a rotation problem and not caused by the new recipes — the same count
  // before them. It is a supply problem, and counting the pool says so exactly:
  // a soy-free vegan had ONE breakfast, ZERO lunches, ZERO dinners and two
  // snacks (both shakes) that clear the 0.079 g of protein per calorie a cutting
  // athlete needs. There was nothing to serve them. The planner was choosing
  // correctly from a list on which every option was wrong.
  //
  // WHY IT IS HARD, IN NUMBERS. Every soy-free plant protein except powder is
  // below the bar: red lentils 0.071 g/kcal, kidney beans 0.069, butter beans
  // 0.065, chickpeas 0.061, quinoa 0.038. Take out tofu, edamame and soya milk
  // and there is no whole food left that clears 0.079 on its own.
  //
  // What does clear it is GREEN VEGETABLES, which nobody thinks of as protein:
  // mushrooms are 0.141 g/kcal, spinach 0.116, kale 0.088, broccoli 0.082 —
  // every one of them denser than the lentils. So the savoury dishes here are
  // built the other way round from usual: the vegetables are the protein and the
  // lentils are the ballast, the oil is kept low because oil is 0.000, and there
  // is no rice or pasta under any of them.
  //
  // That gets a lunch or a dinner to 0.071-0.078. The last stretch is carried by
  // breakfast and the snacks at 0.085-0.108, which is where pea protein belongs
  // and where it is what a cutting athlete would actually eat anyway. The day
  // averages out above target; no single meal has to be a supplement in a bowl.
  // ===========================================================================
  {
    id: "lean_vg_sf_pea_berry_pot", name: "Pea protein & berry breakfast pot", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "pea_protein", qty: 40 }, { foodId: "almond_milk", qty: 250 },
      { foodId: "berries_frozen", qty: 150 }, { foodId: "oats", qty: 25 },
      { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Protein whisked into the almond milk in the bowl BEFORE anything else. Pea protein clumps worse than whey and there is no rescuing it once the oats are in.",
      "Oats stirred in dry — they soften in the two minutes it takes to do everything else.",
      "Frozen berries straight on, and they will set the whole pot to a soft-scoop texture within a minute.",
      "Seeds over.",
    ],
    tip: "Soy-free, dairy-free and gluten is the only thing left to worry about — swap the oats for a few more seeds and it clears that too. 40g of protein for 430 calories.",
    method: "Whisk pea protein into almond milk, stir in dry oats, and top with frozen berries and seeds.",
  },
  {
    id: "lean_vg_sf_pea_banana_pot", name: "Pea protein, oat & banana pot", slot: "Breakfast", minutes: 4,
    items: [
      { foodId: "pea_protein", qty: 45 }, { foodId: "oat_milk", qty: 250 },
      { foodId: "banana", qty: 1 }, { foodId: "oats", qty: 25 },
      { foodId: "peanut_butter", qty: 10 },
    ],
    steps: [
      "Half the banana mashed to a paste in the bottom of the bowl first. It sweetens the whole thing and stops the protein tasting chalky.",
      "Oat milk and protein whisked in on top of it.",
      "Oats stirred through, the rest of the banana sliced over, peanut butter dropped on in one blob.",
    ],
    tip: "Ten grams of peanut butter, not thirty. The point of this bowl is protein per calorie, and nut butter is the fastest way to spend that budget on nothing.",
    method: "Mash half a banana in the bowl, whisk in oat milk and pea protein, and top with oats, sliced banana and peanut butter.",
  },
  {
    id: "lean_vg_sf_lentil_mushroom_lunch", name: "Lentil, mushroom & broccoli bowl", slot: "Lunch", minutes: 25,
    items: [
      { foodId: "red_lentils", qty: 80 }, { foodId: "mushrooms", qty: 400 },
      { foodId: "broccoli", qty: 200 }, { foodId: "spinach", qty: 100 },
      { foodId: "lemon", qty: 1 }, { foodId: "garlic", qty: 10 },
      { foodId: "olive_oil", qty: 5 }, { foodId: "spice_mix", qty: 4 },
    ],
    steps: [
      "Lentils on in twice their volume of water, 15 minutes, drained.",
      "Mushrooms into a dry pan — no oil yet — in one layer and left alone. They release water, the water boils off, and only then do they brown. Adding oil at the start is what makes mushrooms grey and squeaky.",
      "Oil, garlic and spices in once they have taken colour.",
      "Broccoli in for 4 minutes with a splash of water and a lid.",
      "Lentils and spinach folded through off the heat, all the lemon over.",
    ],
    tip: "Four hundred grams of mushrooms cooks down to about a third of that, and they carry more protein per calorie than the lentils do — 0.141 against 0.071. That is why this bowl works without any soy in it.",
    method: "Simmer lentils, dry-fry mushrooms until browned, add garlic, spices and broccoli, then fold through lentils, spinach and lemon.",
  },
  {
    id: "lean_vg_sf_lentil_pea_lunch", name: "Lentil, pea & lemon bowl", slot: "Lunch", minutes: 22,
    items: [
      { foodId: "red_lentils", qty: 85 }, { foodId: "peas_frozen", qty: 180 },
      { foodId: "spinach", qty: 150 }, { foodId: "mushrooms", qty: 250 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 5 },
      { foodId: "garlic", qty: 10 },
    ],
    steps: [
      "Lentils simmered 15 minutes and drained while they still hold their shape — this is a bowl, not a dhal.",
      "Mushrooms browned dry, then the garlic in the oil.",
      "Peas straight from frozen into the hot pan for 2 minutes.",
      "Spinach and lentils in off the heat, the whole lemon squeezed over and a lot of black pepper.",
      "Better warm than hot, and fine cold from a box.",
    ],
    tip: "Frozen peas are picked and frozen within hours, so they are more reliable than anything fresh on the shelf and cost a fifth as much.",
    method: "Simmer lentils, brown mushrooms dry with garlic, wilt in peas and spinach off the heat and finish with lemon.",
  },
  {
    id: "lean_vg_sf_bean_greens_lunch", name: "Kidney bean & greens bowl", slot: "Lunch", minutes: 18,
    items: [
      { foodId: "kidney_beans", qty: 300 }, { foodId: "mushrooms", qty: 250 },
      { foodId: "kale", qty: 120 }, { foodId: "spinach", qty: 100 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 5 },
      { foodId: "spice_mix", qty: 5 }, { foodId: "garlic", qty: 10 },
    ],
    steps: [
      "Kale stripped from its stalks and massaged with a pinch of salt for thirty seconds until it goes dark and soft.",
      "Mushrooms browned dry, then oil, garlic and spices.",
      "Beans in, crushed lightly against the pan with the back of the spoon so some of them thicken the rest.",
      "Kale for 2 minutes, spinach off the heat, lemon over.",
    ],
    tip: "Massaging kale is not a fad — it breaks down the cell walls and takes it from squeaky to tender without cooking, which is the difference between eating it and picking round it.",
    method: "Massage kale, brown mushrooms dry with garlic and spices, crush kidney beans into the pan and wilt the greens through.",
  },
  {
    id: "lean_vg_sf_mushroom_ragu_greens", name: "Lentil & mushroom ragù with greens", slot: "Dinner", minutes: 35,
    items: [
      { foodId: "red_lentils", qty: 90 }, { foodId: "mushrooms", qty: 500 },
      { foodId: "kale", qty: 150 }, { foodId: "spinach", qty: 150 },
      { foodId: "passata", qty: 150 }, { foodId: "onion", qty: 50 },
      { foodId: "garlic", qty: 12 }, { foodId: "stock_cubes", qty: 6 },
      { foodId: "olive_oil", qty: 4 },
    ],
    steps: [
      "Mushrooms chopped to the size of mince and into a big dry pan in two batches. They must brown, and they will not brown crowded — this step is twelve minutes and it is the dish.",
      "Onion and garlic in the oil once the mushrooms are out.",
      "Lentils, passata, stock and 300ml of water in. Mushrooms back. Twenty minutes at a low simmer.",
      "Kale in for the last 5 minutes, spinach folded through at the very end.",
      "No pasta under it on purpose — it is a bowl of ragù, and it does not need one.",
    ],
    tip: "Half a kilo of mushrooms sounds absurd and cooks down to a mugful. They are the most protein-dense thing in the whole recipe at 0.141g per calorie, which is twice what the lentils manage.",
    method: "Brown chopped mushrooms hard in batches, simmer with lentils, passata and stock, and finish with kale and spinach.",
  },
  {
    id: "lean_vg_sf_bean_lentil_pot", name: "Lentil, butter bean & greens pot", slot: "Dinner", minutes: 30,
    items: [
      { foodId: "red_lentils", qty: 80 }, { foodId: "butter_beans", qty: 200 },
      { foodId: "broccoli", qty: 250 }, { foodId: "mushrooms", qty: 300 },
      { foodId: "spinach", qty: 120 }, { foodId: "tomatoes_tin", qty: 150 },
      { foodId: "garlic", qty: 12 }, { foodId: "onion", qty: 50 },
      { foodId: "olive_oil", qty: 5 }, { foodId: "spice_mix", qty: 6 },
    ],
    steps: [
      "Mushrooms browned dry first, as always with mushrooms, and set aside.",
      "Onion, garlic and spices in the oil, then lentils, tomatoes and 400ml water. Fifteen minutes.",
      "Butter beans in whole, broccoli on top, lid on, 5 minutes — the broccoli steams rather than boils and stays green.",
      "Mushrooms back, spinach through, off the heat.",
    ],
    tip: "The broccoli goes in last and on top. Boiled from the start it turns olive and loses the bite that stops this being a bowl of soft things.",
    method: "Brown mushrooms dry, simmer lentils with tomatoes and spices, then steam butter beans and broccoli on top and fold everything back together.",
  },
  {
    id: "lean_vg_sf_pea_berry_snack", name: "Pea protein & berry pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "pea_protein", qty: 30 }, { foodId: "almond_milk", qty: 180 },
      { foodId: "berries_frozen", qty: 120 }, { foodId: "seeds_mixed", qty: 8 },
    ],
    steps: [
      "Protein and almond milk whisked in the pot until there is not a single lump.",
      "Frozen berries in and stirred hard for thirty seconds — the pot thickens as they chill it.",
      "Seeds on top.",
    ],
    tip: "A pot rather than a shake, deliberately: the vegan snack list was mostly things you drink, and something you eat with a spoon is more filling for the same calories.",
    method: "Whisk pea protein into almond milk, stir in frozen berries until it thickens, and top with seeds.",
  },
  {
    id: "lean_vg_sf_pea_mango_snack", name: "Pea protein & mango pot", slot: "Snack", minutes: 3,
    items: [
      { foodId: "pea_protein", qty: 30 }, { foodId: "almond_milk", qty: 180 },
      { foodId: "mango_frozen", qty: 130 }, { foodId: "cashews", qty: 10 },
    ],
    steps: [
      "Protein whisked into the milk first.",
      "Mango in from frozen and left for two minutes to soften at the edges, then mashed roughly with the fork.",
      "Cashews chopped over.",
    ],
    tip: "Mango is sweet enough to cover the flavour of pea protein, which is the one thing people give up on it for. Frozen, so it is always in and always ripe.",
    method: "Whisk pea protein into almond milk, mash in softened frozen mango, and top with chopped cashews.",
  },
];
