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
      { foodId: "sweet_potato", qty: 300 }, { foodId: "chickpeas", qty: 240 }, { foodId: "coconut_milk", qty: 200 },
      { foodId: "spinach", qty: 100 }, { foodId: "rice", qty: 90 }, { foodId: "curry_paste", qty: 30 },
      { foodId: "onion", qty: 80 }, { foodId: "ginger", qty: 8 },
    ],
    steps: [
      "Soften the onion, then the curry paste and grated ginger for a minute until fragrant.",
      "Cubed sweet potato in, coated, then the coconut milk and a splash of water.",
      "Lid on, 18 minutes, until a knife slides into the sweet potato with no resistance.",
      "Chickpeas in for the last 5 — long enough to warm, short enough to keep their shape.",
      "Spinach wilted through at the end, off the heat.",
    ],
    tip: "Mash a few of the sweet potato cubes against the side of the pan and the sauce thickens itself.",
    method: "Fry curry paste and ginger with onion, simmer sweet potato in coconut milk until tender, then add chickpeas and wilt spinach through.",
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
      { foodId: "olive_oil", qty: 12 }, { foodId: "honey", qty: 8 },
    ],
    steps: [
      "Oven to 200C. Press the tofu properly, slice into thick slabs, oil and salt both sides.",
      "Bake 25 minutes, turning once, until the edges are firm and golden.",
      "Meanwhile soften the onion and carrot, add the curry paste for a minute, then coconut milk and a mug of water.",
      "Simmer 12 minutes and blitz smooth. Honey to balance.",
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
      { foodId: "chickpeas", qty: 240 }, { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 15 },
    ],
    steps: [
      "Drain, rinse, then dry the chickpeas thoroughly in a tea towel. Rub the loose skins off as you go.",
      "Oven to 200C. Oil and salt only at this stage — spices burn over 25 minutes.",
      "Roast 25 minutes, shaking twice, until they rattle and are hard to the squeeze.",
      "Spices tossed through the moment they come out, while the oil still carries them.",
    ],
    tip: "They soften as they cool, so eat them warm. Never store them in a sealed tub.",
    method: "Dry the chickpeas well, roast at 200C with oil and salt for 25 minutes, then toss with spices straight from the oven.",
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
      { foodId: "banana", qty: 1 }, { foodId: "honey", qty: 8 },
    ],
    steps: [
      "Toast, then peanut butter on while it is hot so it melts in rather than sitting on top.",
      "Banana sliced thin and overlapped.",
      "Honey and a pinch of salt. The salt is not optional.",
    ],
    tip: "Pre-training, 45 minutes out, this is about as good as it gets.",
    method: "Spread peanut butter onto hot toast, layer sliced banana over, and finish with honey and salt.",
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
      { foodId: "seeds_mixed", qty: 20 }, { foodId: "honey", qty: 10 },
    ],
    steps: [
      "Stir the pea protein into the coconut yoghurt first, a spoon at a time, or it stays in lumps.",
      "Warm the berries 40 seconds until they bleed.",
      "Layer yoghurt, oats and berries, seeds and honey over the top.",
    ],
    tip: "Maple syrup instead of honey keeps it strictly vegan.",
    method: "Beat pea protein into coconut yoghurt, warm the berries, and layer with oats, seeds and honey.",
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
      { foodId: "chickpeas", qty: 240 }, { foodId: "pitta", qty: 100 }, { foodId: "hummus", qty: 70 },
      { foodId: "cucumber", qty: 100 }, { foodId: "tomatoes_fresh", qty: 100 },
      { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 10 }, { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Drain and dry the chickpeas, then crush about half of them with a fork — the crushed ones crisp, the whole ones stay soft, and you want both.",
      "Fry in the oil with the spices for 8 minutes until parts of them go crunchy.",
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
      { foodId: "soy_sauce", qty: 20 }, { foodId: "honey", qty: 12 }, { foodId: "garlic", qty: 8 },
      { foodId: "ginger", qty: 6 }, { foodId: "seeds_mixed", qty: 10 },
    ],
    steps: [
      "Press and cube the tofu, then dry-fry until golden on several sides.",
      "Mix soy, honey, grated garlic and ginger.",
      "Pour it into the hot pan and toss for 60 seconds — it reduces almost immediately and coats every cube.",
      "Steam the broccoli 4 minutes. Rice, tofu, seeds over.",
    ],
    tip: "The sauce catches fast because of the honey. Have the rice ready before it goes in.",
    method: "Dry-fry pressed tofu until golden, toss in a reduced soy-honey-ginger glaze, and serve on rice with broccoli.",
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
      { foodId: "berries_frozen", qty: 150 }, { foodId: "seeds_mixed", qty: 15 }, { foodId: "honey", qty: 8 },
    ],
    steps: [
      "Berries into a pot straight from the freezer.",
      "Honey and seeds over. They defrost in a couple of hours into their own syrup.",
    ],
    tip: "Packed frozen in the morning it is perfect by mid-afternoon and keeps the rest of the bag cold.",
    method: "Pack frozen berries with honey and seeds and let them thaw.",
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
      { foodId: "quinoa", qty: 80 }, { foodId: "coconut_yoghurt", qty: 180 }, { foodId: "berries_frozen", qty: 100 },
      { foodId: "almonds", qty: 30 }, { foodId: "seeds_mixed", qty: 20 }, { foodId: "honey", qty: 12 },
    ],
    steps: [
      "Rinse the quinoa until the water runs clear, then simmer in water for 15 minutes and let it cool a little.",
      "Warm the berries 40 seconds so they release their juice.",
      "Quinoa in the bowl, coconut yoghurt spooned over, berries and their syrup on top.",
      "Nuts and seeds last so they stay crunchy.",
    ],
    tip: "Cook the quinoa in advance. Cold, it works just as well and takes two minutes to build.",
    method: "Simmer rinsed quinoa, cool it, and layer with coconut yoghurt, warmed berries, nuts and seeds.",
  },
  {
    id: "vg_pb_oat_pot", name: "Peanut butter oat pot", slot: "Breakfast", minutes: 5,
    items: [
      { foodId: "oats", qty: 90 }, { foodId: "coconut_yoghurt", qty: 150 }, { foodId: "peanut_butter", qty: 35 },
      { foodId: "banana", qty: 1 }, { foodId: "seeds_mixed", qty: 20 },
    ],
    steps: [
      "Mash half the banana into the coconut yoghurt — it sweetens it without any sugar going in.",
      "Oats stirred through with a splash of water until it looks slightly too loose.",
      "Peanut butter ribboned in, the rest of the banana sliced on top, seeds over.",
      "Overnight in the fridge, or eat it straight away.",
    ],
    tip: "No soya, no dairy, no wheat if your oats are the gluten-free kind.",
    method: "Mash banana into coconut yoghurt, stir in oats, and finish with peanut butter, banana and seeds.",
  },
  {
    id: "vg_bean_avo_hash", name: "Black bean & avocado hash", slot: "Breakfast", minutes: 18,
    items: [
      { foodId: "black_beans", qty: 240 }, { foodId: "potatoes", qty: 250 }, { foodId: "avocado", qty: 1 },
      { foodId: "peppers", qty: 100 }, { foodId: "spice_mix", qty: 8 }, { foodId: "olive_oil", qty: 12 },
      { foodId: "lemon", qty: 1 },
    ],
    steps: [
      "Dice the potatoes small and fry in the oil for 12 minutes, turning rarely so they crust.",
      "Peppers in for 4 minutes, then the drained beans and spices for 2 more.",
      "Mash the avocado with lemon and salt.",
      "Hash into the bowl, avocado on top, more lemon over.",
    ],
    tip: "Mash a few beans against the pan and they bind the whole thing together.",
    method: "Crust diced potatoes, add peppers, beans and spices, and top with lemony mashed avocado.",
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
      { foodId: "hummus", qty: 100 }, { foodId: "black_beans", qty: 200 }, { foodId: "rice", qty: 90 },
      { foodId: "peppers", qty: 120 }, { foodId: "cucumber", qty: 100 }, { foodId: "spice_mix", qty: 6 },
      { foodId: "lemon", qty: 1 }, { foodId: "olive_oil", qty: 8 },
    ],
    steps: [
      "Rice on.",
      "Fry the peppers hard for 5 minutes so they char, then the beans and spices for 2 more.",
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
];
