// =============================================================================
// The articles themselves.
//
// EVERY NUMBER IS INTERPOLATED. Not one figure below is typed. Re-cost a food
// or retune a standard and the article says the new number, because it was
// never holding the old one — the failure mode of a written blog is a page
// confidently quoting a price that changed last March, and this is the whole
// reason these live in code rather than in markdown.
//
// The trade-off is that writing one is a code change. That is the point: it is
// reviewed, it is type-checked, and lib/articles.test.ts refuses to publish one
// that is thin, mistitled, unlinked or makes a claim we are not allowed to
// make.
// =============================================================================

import type { Article } from "./article";
import { indexFacts, money, portionLabel, REFERENCE_PROTEIN, MAX_PORTION } from "./protein-index";
import { MEALS } from "./meals-data";
import { LIFT_STANDARDS, STRENGTH_TIERS } from "./strength-standards";
import { EXERCISES, isRunEntry } from "./exercises";
import { roundToPlate, standardTable } from "./standards-page";

const facts = indexFacts()!;
const bench = LIFT_STANDARDS.find((l) => l.key === "bench")!;
const squat = LIFT_STANDARDS.find((l) => l.key === "squat")!;
const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

const tier = (i: number) => STRENGTH_TIERS[i].name.toLowerCase();

/**
 * The bodyweights the prose uses as examples.
 *
 * Named, and interpolated into the sentences as well as into the sums, because
 * the article's own test caught the alternative: "at 80kg bodyweight" typed
 * into a paragraph beside a calculation using a hardcoded 80 is two copies of
 * one number, and the day someone changes the helper the prose starts lying.
 */
const REFERENCE_KG = 80;
const LIGHTER_KG = 65;
const HEAVIER_KG = 100;
/** UK shelf labelling is per 100g — a fact about supermarkets, not our data. */
const SHELF_UNIT_G = 100;

const atRef = (lift: typeof bench, i: number) => roundToPlate(REFERENCE_KG * lift.male[i - 1]);

export const ARTICLES: Article[] = [
  {
    slug: "cheapest-protein-uk",
    title: `The cheapest protein in a UK supermarket`,
    description:
      `We costed ${facts.count} high-protein foods per ${REFERENCE_PROTEIN}g of protein at UK `
      + `supermarket prices. The cheapest protein is ${facts.cheapest.name.toLowerCase()} at `
      + `${money(facts.cheapest.cost)}; the dearest costs ${facts.spread.toFixed(1)}× more.`,
    keyword: "cheapest protein",
    published: "2026-09-03",
    intro: [
      `Protein is the most expensive part of most people's shopping, and the price per gram varies `
      + `far more than the packaging suggests. So we costed it: ${facts.count} foods that qualify as `
      + `high-protein sources, each priced for the ${REFERENCE_PROTEIN}g of protein you would actually `
      + `build a meal around, at UK supermarket prices.`,
      `The cheapest protein on the list is ${facts.cheapest.name.toLowerCase()} at `
      + `${money(facts.cheapest.cost)} for ${portionLabel(facts.cheapest)}. The dearest is `
      + `${facts.dearest.name.toLowerCase()} at ${money(facts.dearest.cost)} — `
      + `${facts.spread.toFixed(1)} times the price for the same ${REFERENCE_PROTEIN}g.`,
    ],
    sections: [
      {
        heading: "What counts as a high-protein food here",
        body: [
          `A food qualifies only if you could eat a realistic portion of it and get somewhere near `
          + `${REFERENCE_PROTEIN}g. That rules out foods with a good protein percentage that nobody eats `
          + `in quantity: the portion is capped at ${MAX_PORTION}g, so a food that would need half a kilo `
          + `to hit the target does not make the list at all.`,
          `It also has to get a fifth of its calories from protein. Without that rule the list fills up `
          + `with foods that are technically protein sources and are mostly fat or starch, which is not `
          + `what anybody means when they ask where to get protein cheaply.`,
        ],
      },
      {
        heading: "Plants are cheaper, and the gap is not small",
        body: [
          facts.cheapestPlant && facts.cheapestAnimal && facts.plantSaving != null
            ? `The cheapest plant source is ${facts.cheapestPlant.name.toLowerCase()} at `
              + `${money(facts.cheapestPlant.cost)}. The cheapest animal source is `
              + `${facts.cheapestAnimal.name.toLowerCase()} at ${money(facts.cheapestAnimal.cost)}. `
              + `That is ${money(facts.plantSaving)} of difference for the same ${REFERENCE_PROTEIN}g, `
              + `every time you eat it.`
            : `The list covers both plant and animal sources, priced the same way.`,
          `This is not an argument for eating one or the other. It is the number that decides whether `
          + `hitting a protein target is affordable, and most people have never seen it laid out.`,
        ],
      },
      {
        heading: `Why the price per ${SHELF_UNIT_G}g on the packet misleads you`,
        body: [
          `Shelf pricing is per kilogram of food, not per gram of protein, so two products at the same `
          + `price per kilo can differ by several times once you account for how much protein is actually `
          + `in them. A cheap-looking food that is a fifth protein needs five times the weight of one that `
          + `is mostly protein, and the shelf label says nothing about that.`,
          `Costing per ${REFERENCE_PROTEIN}g is the comparison that survives contact with a real meal, `
          + `because ${REFERENCE_PROTEIN}g is roughly what one serving is meant to deliver.`,
        ],
      },
      {
        heading: "The dearest protein is not the best protein",
        body: [
          `${facts.dearest.name} sits at the top of the list at ${money(facts.dearest.cost)}, and nothing `
          + `about that price makes the protein in it work differently. Price tracks how the food is `
          + `farmed, processed and shipped, not what happens to the amino acids after you eat them.`,
          `The practical version: build the base of your week from the cheap end and spend the difference `
          + `on food you actually want to eat. A protein target you hit for ${money(facts.cheapest.cost)} `
          + `a serving is one you can keep hitting in March, which is the only property that matters over a `
          + `season.`,
        ],
      },
      {
        heading: "How to use the number without weighing everything",
        body: [
          `You do not need to cost every meal. Pick three or four sources from the cheap end of the list `
          + `and rotate them — that is most of the saving, and it takes one decision rather than a hundred.`,
          `The portions are the part people get wrong. A source only counts if the portion is realistic: `
          + `the index caps a serving at ${MAX_PORTION}g precisely because a food needing half a kilo to `
          + `reach ${REFERENCE_PROTEIN}g is a food you will stop eating within a fortnight, whatever the `
          + `arithmetic says.`,
          `And check the whole meal rather than the ingredient. A cheap protein cooked in something `
          + `expensive is not a cheap meal, which is why the recipes here are costed end to end rather `
          + `than by their headline ingredient.`,
        ],
      },
      {
        heading: "Where this data comes from",
        body: [
          `Every one of the ${MEALS.length} recipes in PocketAthlete is costed ingredient by ingredient `
          + `from the same price table, which is why we had the numbers to build this in the first place. `
          + `The index updates when the prices do — nothing here is a figure typed into an article.`,
          `That also means this page is checkable. The full index lists every one of the ${facts.count} `
          + `foods with its portion and its price, so you can see the working rather than take the ranking `
          + `on trust.`,
        ],
      },
    ],
    faq: [
      {
        q: "What is the cheapest protein source in the UK?",
        a: `${facts.cheapest.name} — ${money(facts.cheapest.cost)} for ${REFERENCE_PROTEIN}g of protein, `
          + `which is ${portionLabel(facts.cheapest)}.`,
      },
      {
        q: "How much protein is one serving?",
        a: `We cost everything per ${REFERENCE_PROTEIN}g, which is about what a single meal's protein `
          + `serving is meant to deliver for most people.`,
      },
      {
        q: "Is cheap protein worse protein?",
        a: `Cost per ${REFERENCE_PROTEIN}g is a price comparison and nothing more. It says nothing about `
          + `amino acid profile, how full a food leaves you, or whether you enjoy eating it — all of which `
          + `decide whether you actually keep eating it.`,
      },
    ],
    links: [
      { href: "/cheapest-protein/", text: `The full index of all ${facts.count} foods` },
      { href: "/recipes/", text: `${MEALS.length} costed recipes` },
      { href: "/collections/", text: "Recipe collections by cost and protein" },
    ],
  },

  {
    slug: "bench-press-standards",
    /**
     * NOT "Bench press standards by bodyweight" — that is verbatim what
     * /standards/bench-press/ is titled, and two of your own pages with the
     * same title are two pages splitting one query's signal between them.
     * Nothing looks wrong on either; they simply both rank a bit worse.
     *
     * They answer different questions, so they are titled as different
     * questions: the standards page IS the table, and this argues about what
     * the table means. The article links to it and it links back, which is the
     * shape that helps both instead of the shape that halves both.
     *
     * Still carries the keyword and still fits in 60 characters — articleProblems
     * enforces both, and the first attempt at this failed on each.
     */
    title: "Bench press standards: is your bench actually good?",
    description:
      `Bench press standards as multiples of bodyweight: an intermediate bench at ${REFERENCE_KG}kg is about `
      + `${atRef(bench, 2)}kg, advanced is ${atRef(bench, 3)}kg. The full table, and what the tiers mean.`,
    keyword: "bench press standards",
    published: "2026-09-03",
    intro: [
      `"Is my bench good?" has no answer without your bodyweight, which is why bench press standards are `
      + `written as multiples of it rather than as absolute numbers. A ${atRef(bench, 3)}kg bench is `
      + `${tier(3)} at ${REFERENCE_KG}kg bodyweight and something else entirely at ${LIGHTER_KG}kg or ${HEAVIER_KG}kg.`,
      `These are the same standards PocketAthlete uses to rank an athlete's own lifts, so the table below `
      + `is not a separate opinion written for an article — it is the numbers the app itself works from.`,
    ],
    sections: [
      {
        heading: "The tiers, and what each one actually means",
        body: [
          STRENGTH_TIERS.map((t) => `${t.name} — ${t.blurb.toLowerCase()}`).join(". ") + ".",
          `The labels are ordinary words on purpose. An athlete who reads "${STRENGTH_TIERS[3].name}" next `
          + `to their bench can look that word up and find other people using it the same way, which a `
          + `made-up rank name does not allow.`,
        ],
      },
      {
        heading: `What the numbers are at ${REFERENCE_KG}kg bodyweight`,
        body: [
          `A ${tier(1)} bench is about ${atRef(bench, 1)}kg, ${tier(2)} is ${atRef(bench, 2)}kg, and `
          + `${tier(3)} is ${atRef(bench, 3)}kg. Above that, ${tier(4)} is ${atRef(bench, 4)}kg and `
          + `${tier(5)} is ${atRef(bench, 5)}kg.`,
          `Scale those by bodyweight rather than adding a fixed number: the multiples are `
          + `${bench.male.join("×, ")}× bodyweight, so a ${LIGHTER_KG}kg lifter's ${tier(3)} bench is `
          + `${roundToPlate(LIGHTER_KG * bench.male[2])}kg and a ${HEAVIER_KG}kg lifter's is `
          + `${roundToPlate(HEAVIER_KG * bench.male[2])}kg.`,
          `Every kilogram in the table is rounded to the nearest 2.5, because that is the smallest `
          + `increment a barbell actually offers.`,
        ],
      },
      {
        heading: "How the bench compares to the squat and deadlift",
        body: [
          `The bench is the lift where bodyweight multiples run lowest. An ${tier(3)} squat is `
          + `${squat.male[2]}× bodyweight against the bench's ${bench.male[2]}×, which is why a lifter `
          + `whose squat and bench feel equally hard-won will still rank differently on each.`,
          `That is not a flaw in the standards. It is the reason ranking against a single "strength score" `
          + `is misleading, and why the app ranks each lift separately.`,
        ],
      },
      {
        heading: "Why estimating from a rep set is usually enough",
        body: [
          `You do not need a one-rep max to place yourself. A set of five taken close to failure estimates `
          + `a max closely enough for a tier, and the estimate carries none of the risk of a genuine `
          + `single — which is the wrong thing to attempt on a lift you are still learning.`,
          `Estimates get less reliable the further the set is from a single, so a set of twelve tells you `
          + `far less than a set of three. Somewhere between three and six reps is where the arithmetic and `
          + `the safety agree, and it is what the app uses when it ranks a lift from your training log `
          + `rather than from a tested max.`,
          `Where a tested max exists it wins, because a number you actually lifted beats a number derived `
          + `from one you did. The two used to live on separate screens here and disagree; they do not now.`,
        ],
      },
      {
        heading: "What moves a bench, and what does not",
        body: [
          `Tiers move on training age more than on anything else. The multiples above span `
          + `${bench.male[0]}× to ${bench.male[bench.male.length - 1]}× bodyweight, and crossing that range `
          + `is years of work rather than a programme change — which is worth knowing before you swap one `
          + `for another because a lift stalled for a fortnight.`,
          `Bodyweight is the other lever, and it cuts both ways: adding weight raises the bar you have to `
          + `clear as fast as it raises what you can lift. That is the arithmetic behind a lifter feeling `
          + `stronger and ranking the same.`,
        ],
      },
      {
        heading: "What a standard is not",
        body: [
          `A standard is a description of what other lifters at your bodyweight tend to lift. It is not a `
          + `target you have to reach, not a schedule, and it says nothing about whether you are training `
          + `well — someone ${tier(1)} on a lift they started last month is progressing faster than someone `
          + `${tier(3)} who has not added a kilogram in two years.`,
          `Its actual use is comparison over time. Test the same lift again in three months and the tier `
          + `tells you whether the training moved anything, which is a better question than how you felt.`,
        ],
      },
    ],
    faq: [
      {
        q: `What is a good bench press for an ${REFERENCE_KG}kg man?`,
        a: `About ${atRef(bench, 2)}kg is ${tier(2)} and ${atRef(bench, 3)}kg is ${tier(3)}. `
          + `Below ${atRef(bench, 1)}kg is ${tier(1)} territory.`,
      },
      {
        q: `Is a ${HEAVIER_KG}kg bench press good?`,
        a: `At ${REFERENCE_KG}kg bodyweight that is ${(HEAVIER_KG / REFERENCE_KG).toFixed(2)}× bodyweight, which is ${tier(2)}. `
          + `At ${LIGHTER_KG}kg the same bar is a far higher tier, and heavier it is a lower one — the bodyweight is the whole point.`,
      },
      {
        q: "Do these standards apply to women?",
        a: `The multiples differ. A women's ${tier(2)} bench is ${bench.female[2]}× bodyweight against `
          + `${bench.male[2]}× for men, and the app uses the right set once you have set your profile.`,
      },
    ],
    links: [
      { href: "/exercises/bench-press/", text: "How to bench press" },
      { href: "/exercises/muscle/chest/", text: `All ${MOVEMENTS.filter((e) => e.muscles.some((m) => m.toLowerCase() === "chest")).length} chest exercises` },
      { href: "/exercises/equipment/barbell/", text: "Barbell exercises" },
      { href: "/guides/", text: "Position guides" },
    ],
  },
];

export function findArticle(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
