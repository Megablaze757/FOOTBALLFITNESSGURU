import type { Metadata } from "next";
import { publishableRecipeHubs, recipeHubPath, recipeHubTitle } from "@/lib/recipe-hubs";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { MEALS } from "@/lib/meals-data";
import { mealMacros } from "@/lib/meal-plan";
import { contentPages, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CONTENT THAT WAS LOCKED BEHIND A LOGIN.
 *
 * 335 recipes, each with a real method and — the part nobody else publishes —
 * what it actually costs. All of it sat behind /nutrition, which robots.txt
 * correctly tells crawlers not to bother with, because a crawler there gets a
 * login redirect. Correct, and it meant the single most distinctive thing this
 * app has has never been indexable.
 *
 * Nothing here is generated. The recipes were written, the prices were
 * researched, and the macros are computed from the same food database the
 * planner shops from. That is why these pages can rank: they are the thing
 * itself rather than an article about the thing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const metadata: Metadata = {
  title: "High-protein recipes with what they actually cost",
  description:
    `${MEALS.length} recipes with the macros worked out and the shopping cost of every ingredient — `
    + "built for athletes eating to a target rather than to a diet.",
  alternates: { canonical: `${SITE}/recipes/` },
  openGraph: { images: ogImage("recipes", "Recipes") },
};

export default function RecipesIndex() {
  const pages = contentPages(MEALS);
  const bySlot = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Recipes", url: `${SITE}/recipes/` },
          ])])),
        }}
      />

      <h1 className="text-4xl font-extrabold tracking-tight">Recipes</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        {MEALS.length} recipes with the macros worked out and the cost of every ingredient. No blog
        post in front of the method, and no ingredient list that assumes you already own six spices.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold tracking-tight">Browse by meal or main ingredient</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {publishableRecipeHubs().map(({ hub, members }) => (
            <Link
              key={`${hub.kind}-${hub.slug}`}
              href={recipeHubPath(hub)}
              className="rounded-full border border-white/10 px-3.5 py-2 text-sm text-slate-300 transition hover:border-pitch-400/40"
            >
              {recipeHubTitle(hub)} <span className="text-slate-600">{members.length}</span>
            </Link>
          ))}
        </div>
      </section>

      {bySlot.map((slot) => {
        const meals = MEALS.filter((m) => m.slot === slot);
        if (meals.length === 0) return null;
        return (
          <section key={slot} className="mt-10">
            <h2 className="text-xl font-extrabold tracking-tight">{slot}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {meals.map((meal) => {
                const slug = pages.find((p) => p.id === meal.id)!.slug;
                const macros = mealMacros(meal, 1);
                return (
                  <li key={meal.id}>
                    <Link
                      href={`/recipes/${slug}/`}
                      className="block rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/20"
                    >
                      <span className="block text-sm font-semibold text-slate-100">{meal.name}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                        {Math.round(macros.kcal)} kcal · {Math.round(macros.protein)}g protein
                        {meal.minutes ? ` · ${meal.minutes} min` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
