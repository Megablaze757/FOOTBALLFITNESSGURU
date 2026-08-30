import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  collectionSlugs,
  collectionSummary,
  findCollection,
  type RecipeFacts,
} from "@/lib/collections";
import { MEALS } from "@/lib/meals-data";
import { contentPages, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, itemList, breadcrumbs } from "@/lib/schema";

// Only the collections that cleared MIN_MEMBERS get a file. A thin one has no
// URL at all — being unlinked is not the same as not existing.
export function generateStaticParams() {
  return collectionSlugs().map((slug) => ({ slug }));
}

// Built once per page, not once per row: contentPages walks all 335 recipes,
// and the longest collection has 190 of them on it.
const RECIPE_SLUGS = new Map(contentPages(MEALS).map((p) => [p.id, p.slug]));
const recipeSlug = (id: string) => RECIPE_SLUGS.get(id) ?? "";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const found = findCollection(params.slug);
  if (!found) return { title: "Not found" };
  const url = `${SITE}/collections/${params.slug}/`;
  // The count is the description's most useful word, so it goes first.
  const description = `${found.members.length} ${found.collection.blurb[0].toLowerCase()}${found.collection.blurb.slice(1)}`;
  return {
    title: found.collection.title,
    description,
    alternates: { canonical: url },
    openGraph: { title: found.collection.title, description, url, type: "website" },
  };
}

function Row({ facts }: { facts: RecipeFacts }) {
  const slug = recipeSlug(facts.meal.id);
  return (
    <li>
      <Link
        href={`/recipes/${slug}/`}
        className="flex items-baseline justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/20"
      >
        <span className="text-sm font-semibold text-slate-100">{facts.meal.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {Math.round(facts.protein)}g · {Math.round(facts.kcal)} kcal
          {facts.cost > 0 ? ` · £${facts.cost.toFixed(2)}` : ""}
          {facts.minutes > 0 ? ` · ${facts.minutes} min` : ""}
        </span>
      </Link>
    </li>
  );
}

export default function CollectionPage({ params }: { params: { slug: string } }) {
  const found = findCollection(params.slug);
  if (!found) notFound();

  const { collection, members } = found;
  const url = `${SITE}/collections/${params.slug}/`;

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            itemList({
              name: collection.title,
              description: collection.blurb,
              url,
              items: members.map((f) => ({
                name: f.meal.name,
                url: `${SITE}/recipes/${recipeSlug(f.meal.id)}/`,
              })),
            }),
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Collections", url: `${SITE}/collections/` },
              { name: collection.title, url },
            ]),
          ])),
        }}
      />

      <nav className="text-xs text-slate-500">
        <Link href="/collections/" className="hover:text-slate-300">Collections</Link>
      </nav>

      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{collection.title}</h1>
      <p className="mt-3 max-w-2xl text-slate-400">{collection.blurb}</p>

      {/*
        The intro, computed rather than written. It is true by construction, it
        is specific, and it changes on its own when a price or a recipe does.
      */}
      <p className="mt-2 max-w-2xl text-sm text-slate-500">{collectionSummary(members)}</p>

      <ul className="mt-8 grid gap-2">
        {members.map((facts) => <Row key={facts.meal.id} facts={facts} />)}
      </ul>

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
