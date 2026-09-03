import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MEALS } from "@/lib/meals-data";
import { mealMacros } from "@/lib/meal-plan";
import { FOOD_BY_ID } from "@/lib/food-db";
import { recipeSteps, recipeNote } from "@/lib/recipe-steps";
import { contentPages, findBySlug, slugify, SITE } from "@/lib/seo";
import { relatedMeals } from "@/lib/related";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, recipeSchema, breadcrumbs } from "@/lib/schema";

// One real HTML file per recipe at export time — which is the only version a
// crawler ever sees, and the reason this works on a static host.
export function generateStaticParams() {
  return contentPages(MEALS).map(({ slug }) => ({ slug }));
}

/**
 * An ingredient as somebody would write it on a list.
 *
 * The stored quantity is grams, or a count for the seven foods sold by the item
 * — see the `unit: "each"` foods in food-db.ts, and the meal plan bug where
 * `banana: 100` was read as a hundred bananas and produced a 10,166 kcal
 * breakfast. Rendering "100g banana" here would be the same mistake in public.
 */
function ingredientLine(foodId: string, qty: number): string | null {
  const food = FOOD_BY_ID[foodId];
  if (!food) return null;
  if (food.unit === "each") {
    const n = Math.round(qty * 10) / 10;
    return `${n} ${food.name.toLowerCase()}${n === 1 ? "" : "s"}`;
  }
  return `${Math.round(qty)}g ${food.name.toLowerCase()}`;
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const meal = findBySlug(MEALS, params.slug);
  if (!meal) return { title: "Not found" };
  const macros = mealMacros(meal, 1);
  const url = `${SITE}/recipes/${params.slug}/`;
  const title = meal.name;
  // The numbers ARE the description. Somebody searching for a high-protein
  // dinner is searching for a figure, and putting it in front of them is worth
  // more than a sentence about how delicious it is.
  const description =
    `${Math.round(macros.kcal)} kcal and ${Math.round(macros.protein)}g of protein`
    + `${meal.minutes ? `, ${meal.minutes} minutes` : ""}. Method, ingredients and macros.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
  };
}

export default function RecipePage({ params }: { params: { slug: string } }) {
  const meal = findBySlug(MEALS, params.slug);
  if (!meal) notFound();

  const macros = mealMacros(meal, 1);
  const steps = recipeSteps(meal);
  // Somewhere to go next: these pages linked only to their own index.
  const related = relatedMeals(meal, MEALS);
  const note = recipeNote(meal);
  const url = `${SITE}/recipes/${params.slug}/`;
  const ingredients = meal.items
    .map((i) => ingredientLine(i.foodId, i.qty))
    .filter((l): l is string => !!l);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            recipeSchema({
              name: meal.name,
              url,
              description: `${Math.round(macros.kcal)} kcal, ${Math.round(macros.protein)}g protein.`,
              minutes: meal.minutes,
              ingredients,
              steps,
              kcal: macros.kcal, protein: macros.protein, carbs: macros.carbs, fats: macros.fats,
              category: meal.slot,
            }),
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Recipes", url: `${SITE}/recipes/` },
              { name: meal.name, url },
            ]),
          ])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/recipes/" className="hover:text-accent-400">← All recipes</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{meal.name}</h1>

      {/* THE NUMBERS FIRST, because they are why somebody is here. A recipe
          site that makes you scroll past a story to reach the protein is
          answering a question nobody asked. */}
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Calories", `${Math.round(macros.kcal)}`],
          ["Protein", `${Math.round(macros.protein)}g`],
          ["Carbs", `${Math.round(macros.carbs)}g`],
          ["Fat", `${Math.round(macros.fats)}g`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center">
            <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-sm text-slate-500">
        {meal.slot}{meal.minutes ? ` · about ${meal.minutes} minutes` : ""} · one serving
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold tracking-tight">What you need</h2>
        <ul className="mt-3 space-y-1.5">
          {ingredients.map((line) => (
            <li key={line} className="flex gap-2 text-slate-300">
              <span className="text-accent-400">·</span>{line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold tracking-tight">Method</h2>
        <ol className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-[11px] font-extrabold text-accent-400">
                {i + 1}
              </span>
              <span className="text-slate-300">{step}</span>
            </li>
          ))}
        </ol>
        {/* The aside at the end of a method is commentary, not a step —
            numbering it tells somebody to go and do it. See recipeNote. */}
        {note && <p className="mt-4 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-slate-400">{note}</p>}
      </section>

      {meal.tip && (
        <p className="mt-6 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.04] px-4 py-3 text-sm text-slate-300">
          <b className="text-accent-400">Worth knowing:</b> {meal.tip}
        </p>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-extrabold tracking-tight">Cook next</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recipes/${slugify(r.name)}/`}
                  className="block rounded-2xl border border-white/10 px-4 py-3 transition hover:border-pitch-400/40"
                >
                  <span className="font-semibold text-slate-100">{r.name}</span>
                  <span className="block text-xs text-slate-500 capitalize">{r.slot}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
