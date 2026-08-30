import type { Metadata } from "next";
import Link from "next/link";
import { publishableCollections } from "@/lib/collections";
import { SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAGES THAT ANSWER A QUESTION NO SINGLE RECIPE CAN.
 *
 * /recipes publishes 335 answers to "how do I cook this". This publishes the
 * answer to "what should I cook", which is a different search and a better one
 * — and one this app can answer honestly because it has costed every
 * ingredient of every recipe.
 *
 * The list is short and hand-chosen. A loop over price brackets would produce
 * a hundred of these and every one of them would be worthless.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const metadata: Metadata = {
  title: "Recipe collections — cheap, quick, vegan, high-protein",
  description:
    "Hand-picked lists built from 335 costed recipes: cheap high-protein meals, "
    + "20-minute dinners, vegan and gluten-free options, and dishes worth cooking double.",
  alternates: { canonical: `${SITE}/collections/` },
};

export default function CollectionsIndex() {
  const published = publishableCollections();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Collections", url: `${SITE}/collections/` },
          ])])),
        }}
      />

      <h1 className="text-4xl font-extrabold tracking-tight">Collections</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Every recipe in this app has its cost worked out ingredient by ingredient, which means these
        lists can be sorted by things a recipe site normally cannot sort by — like how much protein a
        pound actually buys.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {published.map(({ collection, members }) => (
          <li key={collection.slug}>
            <Link
              href={`/collections/${collection.slug}/`}
              className="block h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-white/20"
            >
              <span className="block text-sm font-semibold text-slate-100">{collection.title}</span>
              <span className="mt-1 block text-xs text-slate-400">{collection.blurb}</span>
              <span className="mt-2 block text-xs tabular-nums text-slate-500">
                {members.length} recipes
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
