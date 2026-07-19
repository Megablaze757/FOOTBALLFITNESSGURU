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
}

export const FOODS: Food[] = [
  // --- Meat & fish ---------------------------------------------------------
  { id: "chicken_breast", name: "Chicken breast fillets", aisle: "Meat & fish", kcal: 106, protein: 24, carbs: 0, fats: 1.1, unit: "g", packSize: 650, packPrice: 5.50, packLabel: "650g pack" },
  { id: "beef_mince_5", name: "Beef mince (5% fat)", aisle: "Meat & fish", kcal: 136, protein: 21, carbs: 0, fats: 5, unit: "g", packSize: 500, packPrice: 4.75, packLabel: "500g pack" },
  { id: "salmon_fillet", name: "Salmon fillets", aisle: "Meat & fish", kcal: 208, protein: 20, carbs: 0, fats: 13, unit: "g", packSize: 240, packPrice: 4.50, packLabel: "2 fillets, 240g" },
  { id: "tuna_tin", name: "Tuna chunks in spring water", aisle: "Cupboard", kcal: 108, protein: 25, carbs: 0, fats: 0.6, unit: "g", packSize: 400, packPrice: 3.50, packLabel: "4 x 100g tins" },
  { id: "turkey_mince", name: "Turkey breast mince", aisle: "Meat & fish", kcal: 105, protein: 24, carbs: 0, fats: 1, unit: "g", packSize: 500, packPrice: 4.25, packLabel: "500g pack" },

  // --- Dairy & eggs --------------------------------------------------------
  { id: "eggs", name: "Free range eggs", aisle: "Dairy & eggs", kcal: 74, protein: 6.4, carbs: 0.4, fats: 5.1, unit: "each", packSize: 12, packPrice: 3.20, packLabel: "12 pack" },
  { id: "greek_yoghurt", name: "Greek style yoghurt (0% fat)", aisle: "Dairy & eggs", kcal: 57, protein: 10, carbs: 4, fats: 0.2, unit: "g", packSize: 1000, packPrice: 2.50, packLabel: "1kg tub" },
  { id: "milk", name: "Semi-skimmed milk", aisle: "Dairy & eggs", kcal: 50, protein: 3.6, carbs: 4.8, fats: 1.8, unit: "ml", packSize: 2272, packPrice: 1.65, packLabel: "4 pint bottle" },
  { id: "cheddar", name: "Mature cheddar", aisle: "Dairy & eggs", kcal: 416, protein: 25, carbs: 0.1, fats: 35, unit: "g", packSize: 400, packPrice: 3.75, packLabel: "400g block" },

  // --- Carbs / cupboard ----------------------------------------------------
  { id: "oats", name: "Porridge oats", aisle: "Cupboard", kcal: 379, protein: 11, carbs: 60, fats: 8, unit: "g", packSize: 1000, packPrice: 1.60, packLabel: "1kg bag" },
  { id: "rice", name: "Basmati rice", aisle: "Cupboard", kcal: 349, protein: 8, carbs: 78, fats: 1, unit: "g", packSize: 1000, packPrice: 2.20, packLabel: "1kg bag" },
  { id: "pasta", name: "Wholewheat pasta", aisle: "Cupboard", kcal: 348, protein: 13, carbs: 63, fats: 2.5, unit: "g", packSize: 500, packPrice: 1.10, packLabel: "500g bag" },
  { id: "potatoes", name: "White potatoes", aisle: "Fruit & veg", kcal: 79, protein: 2, carbs: 17, fats: 0.2, unit: "g", packSize: 2500, packPrice: 2.15, packLabel: "2.5kg bag" },
  { id: "sweet_potato", name: "Sweet potatoes", aisle: "Fruit & veg", kcal: 86, protein: 1.6, carbs: 20, fats: 0.1, unit: "g", packSize: 1000, packPrice: 1.50, packLabel: "1kg" },
  { id: "wholemeal_bread", name: "Wholemeal bread", aisle: "Bakery", kcal: 235, protein: 9.5, carbs: 41, fats: 2, unit: "g", packSize: 800, packPrice: 1.40, packLabel: "800g loaf" },
  { id: "tortilla_wrap", name: "Wholemeal wraps", aisle: "Bakery", kcal: 290, protein: 9, carbs: 47, fats: 6.5, unit: "each", packSize: 8, packPrice: 1.50, packLabel: "8 pack" },

  // --- Fruit & veg ---------------------------------------------------------
  { id: "banana", name: "Bananas", aisle: "Fruit & veg", kcal: 95, protein: 1.2, carbs: 23, fats: 0.3, unit: "each", packSize: 6, packPrice: 1.05, packLabel: "6 pack" },
  { id: "berries_frozen", name: "Frozen mixed berries", aisle: "Frozen", kcal: 45, protein: 1, carbs: 8, fats: 0.3, unit: "g", packSize: 500, packPrice: 2.50, packLabel: "500g bag" },
  { id: "broccoli", name: "Broccoli", aisle: "Fruit & veg", kcal: 34, protein: 2.8, carbs: 4, fats: 0.4, unit: "g", packSize: 350, packPrice: 0.75, packLabel: "350g head" },
  { id: "mixed_veg_frozen", name: "Frozen mixed vegetables", aisle: "Frozen", kcal: 42, protein: 2.6, carbs: 6, fats: 0.5, unit: "g", packSize: 1000, packPrice: 1.50, packLabel: "1kg bag" },
  { id: "spinach", name: "Baby spinach", aisle: "Fruit & veg", kcal: 25, protein: 2.9, carbs: 1.6, fats: 0.4, unit: "g", packSize: 240, packPrice: 1.40, packLabel: "240g bag" },
  { id: "apple", name: "Apples", aisle: "Fruit & veg", kcal: 78, protein: 0.4, carbs: 19, fats: 0.2, unit: "each", packSize: 6, packPrice: 1.75, packLabel: "6 pack" },
  { id: "onion", name: "Onions", aisle: "Fruit & veg", kcal: 40, protein: 1.1, carbs: 9, fats: 0.1, unit: "g", packSize: 1000, packPrice: 1.05, packLabel: "1kg bag" },
  { id: "tomatoes_tin", name: "Chopped tomatoes", aisle: "Cupboard", kcal: 22, protein: 1.2, carbs: 3.5, fats: 0.2, unit: "g", packSize: 1600, packPrice: 1.80, packLabel: "4 x 400g tins" },

  // --- Fats & extras -------------------------------------------------------
  { id: "olive_oil", name: "Olive oil", aisle: "Cupboard", kcal: 899, protein: 0, carbs: 0, fats: 100, unit: "ml", packSize: 500, packPrice: 3.50, packLabel: "500ml bottle" },
  { id: "peanut_butter", name: "Peanut butter", aisle: "Cupboard", kcal: 588, protein: 25, carbs: 12, fats: 50, unit: "g", packSize: 340, packPrice: 2.40, packLabel: "340g jar" },
  { id: "almonds", name: "Almonds", aisle: "Cupboard", kcal: 613, protein: 21, carbs: 7, fats: 53, unit: "g", packSize: 200, packPrice: 2.75, packLabel: "200g bag" },
  { id: "whey_protein", name: "Whey protein powder", aisle: "Cupboard", kcal: 380, protein: 78, carbs: 6, fats: 5, unit: "g", packSize: 1000, packPrice: 22.00, packLabel: "1kg tub" },
  { id: "beans_baked", name: "Baked beans", aisle: "Cupboard", kcal: 78, protein: 4.7, carbs: 13, fats: 0.2, unit: "g", packSize: 1600, packPrice: 2.60, packLabel: "4 x 400g tins" },
  { id: "chickpeas", name: "Chickpeas", aisle: "Cupboard", kcal: 115, protein: 7, carbs: 16, fats: 2.1, unit: "g", packSize: 800, packPrice: 1.40, packLabel: "2 x 400g tins" },
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Search deep links — no API needed, and they can't go stale the way a scraped
// price would. The athlete taps through and their own basket does the rest.
export const SUPERMARKETS: { id: string; name: string; search: (q: string) => string }[] = [
  { id: "tesco", name: "Tesco", search: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}` },
  { id: "sainsburys", name: "Sainsbury's", search: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` },
  { id: "asda", name: "Asda", search: (q) => `https://groceries.asda.com/search/${encodeURIComponent(q)}` },
  { id: "aldi", name: "Aldi", search: (q) => `https://groceries.aldi.co.uk/en-GB/Search?keywords=${encodeURIComponent(q)}` },
];

export const PRICES_REVIEWED = "July 2026";
