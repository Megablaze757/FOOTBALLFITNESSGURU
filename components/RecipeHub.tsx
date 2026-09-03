import Link from "next/link";
import {
  findRecipeHub, publishableRecipeHubs, recipeHubPath, recipeHubTitle, recipeHubBlurb,
  type RecipeHubKind,
} from "@/lib/recipe-hubs";
import { money } from "@/lib/protein-index";
import { slugify, SITE } from "@/lib/seo";
import { ogImage } from "@/lib/og";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

export function recipeHubParams(kind: RecipeHubKind) {
  return publishableRecipeHubs().filter((h) => h.hub.kind === kind).map(({ hub }) => ({ slug: hub.slug }));
}

export function recipeHubMetadata(kind: RecipeHubKind, slug: string) {
  const found = findRecipeHub(kind, slug);
  if (!found) return { title: "Not found" };
  const { hub, members } = found;
  const cheapest = [...members].sort((a, b) => a.cost - b.cost)[0] ?? null;
  const title = recipeHubTitle(hub);
  const description = recipeHubBlurb(hub, members.length, cheapest);
  const url = `${SITE}${recipeHubPath(hub)}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: ogImage("recipes", title) },
  };
}

/**
 * A recipe topic hub.
 *
 * Sorted by cost, cheapest first, rather than alphabetically. This site's whole
 * claim is that it knows what food costs, so the ordering is the argument — an
 * alphabetical list would be the same page any recipe site could build.
 */
export function RecipeHubPage({ kind, slug }: { kind: RecipeHubKind; slug: string }) {
  const found = findRecipeHub(kind, slug);
  if (!found) return null;
  const { hub, members } = found;
  const byCost = [...members].sort((a, b) => a.cost - b.cost);
  const others = publishableRecipeHubs().filter((h) => h.hub.slug !== hub.slug || h.hub.kind !== hub.kind);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Recipes", url: `${SITE}/recipes/` },
              { name: recipeHubTitle(hub), url: `${SITE}${recipeHubPath(hub)}` },
            ]),
            {
              "@type": "ItemList",
              name: recipeHubTitle(hub),
              numberOfItems: byCost.length,
              itemListElement: byCost.map((f, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: f.meal.name,
                url: `${SITE}/recipes/${slugify(f.meal.name)}/`,
              })),
            },
          ])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/recipes/" className="hover:text-accent-400">← All recipes</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{recipeHubTitle(hub)}</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        {recipeHubBlurb(hub, byCost.length, byCost[0] ?? null)}
      </p>
      <p className="mt-1 text-sm text-slate-500">Cheapest first.</p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {byCost.map((f) => (
          <li key={f.meal.id}>
            <Link
              href={`/recipes/${slugify(f.meal.name)}/`}
              className="block rounded-2xl border border-white/10 px-4 py-3 transition hover:border-pitch-400/40"
            >
              <span className="font-semibold text-slate-100">{f.meal.name}</span>
              <span className="block text-xs text-slate-500">
                {money(f.cost)} · {Math.round(f.protein)}g protein · {Math.round(f.kcal)} kcal
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold tracking-tight">Other ways in</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {others.map(({ hub: h, members: m }) => (
            <Link
              key={`${h.kind}-${h.slug}`}
              href={recipeHubPath(h)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:border-pitch-400/40"
            >
              {recipeHubTitle(h)} <span className="text-slate-600">{m.length}</span>
            </Link>
          ))}
        </div>
      </section>

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
