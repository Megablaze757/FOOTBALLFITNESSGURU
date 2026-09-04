import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import {
  HIGH_PROTEIN_ENERGY_SHARE,
  MAX_PORTION,
  REFERENCE_PROTEIN,
  indexFacts,
  money,
  portionLabel,
  proteinIndex,
} from "@/lib/protein-index";
import { SITE } from "@/lib/seo";
import { ProteinTrend } from "@/components/ProteinTrend";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, itemList, breadcrumbs } from "@/lib/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE PAGE HERE NOBODY ELSE CAN BUILD.
 *
 * A recipe site can write about cheap protein. It cannot compute this, because
 * it does not hold a shelf price against every ingredient. This app does, so
 * the answer is arithmetic — and arithmetic is what gets linked to.
 *
 * Every number on this page comes out of lib/protein-index.ts. Nothing is
 * written down twice, which is why it cannot go stale: correct a pack price in
 * the food database and this page is correct on the next build.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const metadata: Metadata = {
  title: "The cheapest protein in a UK supermarket, ranked by price",
  description:
    `What ${REFERENCE_PROTEIN}g of protein actually costs from every high-protein food in a UK `
    + "supermarket, worked out from real pack sizes and shelf prices. The cheapest is about ten "
    + "times cheaper than the dearest.",
  alternates: { canonical: `${SITE}/cheapest-protein/` },
  openGraph: { images: ogImage("cheapest-protein", "The protein index") },
};

export default function CheapestProteinPage() {
  const index = proteinIndex();
  const facts = indexFacts();
  if (!facts) return null;

  const url = `${SITE}/cheapest-protein/`;

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            itemList({
              name: `The cheapest ${REFERENCE_PROTEIN}g of protein in a UK supermarket`,
              description: metadata.description as string,
              url,
              items: index.map((e) => ({ name: e.name, url })),
            }),
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Cheapest protein", url },
            ]),
          ])),
        }}
      />

      <h1 className="text-4xl font-extrabold tracking-tight">
        The cheapest protein in a UK supermarket
      </h1>

      <p className="mt-3 max-w-2xl text-slate-400">
        Every ingredient in this app carries a real pack size and a real shelf price, so the cost of
        a fixed amount of protein is something you can simply work out. Here is what{" "}
        {REFERENCE_PROTEIN}g of protein — about one meal&rsquo;s worth — costs from each of the{" "}
        {facts.count} foods that qualify.
      </p>

      {/* The headline is the spread. Most people expect the gap to be small. */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Cheapest", value: money(facts.cheapest.cost), note: facts.cheapest.name },
          { label: "Dearest", value: money(facts.dearest.cost), note: facts.dearest.name },
          { label: "Difference", value: `${facts.spread.toFixed(1)}×`, note: "for the same protein" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-100">{card.value}</div>
            <div className="mt-1 text-xs text-slate-400">{card.note}</div>
          </div>
        ))}
      </div>

      {facts.cheapestPlant && facts.cheapestAnimal && facts.plantSaving !== null && (
        <p className="mt-6 max-w-2xl text-sm text-slate-400">
          The cheapest plant source is {facts.cheapestPlant.name.toLowerCase()} at{" "}
          {money(facts.cheapestPlant.cost)}. The cheapest animal source is{" "}
          {facts.cheapestAnimal.name.toLowerCase()} at {money(facts.cheapestAnimal.cost)} — a
          difference of {money(facts.plantSaving)} for the same {REFERENCE_PROTEIN}g.
        </p>
      )}

      {/*
        tabIndex and a name, because a scrolling box is a keyboard trap without
        them: on a phone this table is wider than the screen, and a keyboard-only
        reader could not reach the columns past the edge. Caught by the axe pass
        in e2e/smoke.spec.ts, mobile viewport only.
      */}
      <div
        className="mt-8 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`High-protein foods ranked by the cost of ${REFERENCE_PROTEIN}g of protein`}
      >
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3 font-medium">#</th>
              <th scope="col" className="py-2 pr-3 font-medium">Food</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">{REFERENCE_PROTEIN}g costs</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">You&rsquo;d eat</th>
              <th scope="col" className="py-2 text-right font-medium">Protein</th>
            </tr>
          </thead>
          <tbody>
            {index.map((entry, i) => (
              <tr key={entry.id} className="border-b border-white/[0.06]">
                <td className="py-2 pr-3 tabular-nums text-slate-600">{i + 1}</td>
                <td className="py-2 pr-3 font-medium text-slate-100">{entry.name}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-100">{money(entry.cost)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{portionLabel(entry)}</td>
                <td className="py-2 text-right tabular-nums text-slate-400">{entry.proteinPer100}g/100g</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        The method, in public. A price table with no stated method is a table
        somebody is right to distrust — and the two rules are the interesting
        part anyway.
      */}
      {/* THE HISTORY, WHICH IS WHAT TURNS THIS FROM A PAGE INTO A REFERENCE.
          A single figure is read once; a tracked one is checked again. See
          lib/protein-history.ts for why the series starts today rather than
          being reconstructed. */}
      <ProteinTrend />

      <section className="mt-12 max-w-2xl">
        <h2 className="text-xl font-extrabold tracking-tight">How this is worked out</h2>
        <p className="mt-3 text-sm text-slate-400">
          Prices are typical UK supermarket shelf prices for a standard pack, and the cost shown is
          the price of however much of that food contains {REFERENCE_PROTEIN}g of protein. Nothing is
          adjusted for what it tastes like or how long it takes to cook.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          A food is on the list if it clears two tests. It has to be{" "}
          <strong className="text-slate-200">high in protein</strong> — at least{" "}
          {Math.round(HIGH_PROTEIN_ENERGY_SHARE * 100)}% of its calories coming from protein, which
          is the legal definition for that phrase in Great Britain. And you have to be able to{" "}
          <strong className="text-slate-200">eat a portion of it</strong>: no more than {MAX_PORTION}g
          to reach {REFERENCE_PROTEIN}g of protein.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          The second test is doing more work than it looks. Soy sauce passes the first one and would
          take 375ml. Broccoli would take over a kilogram. Neither is a protein source in any sense
          that matters to somebody planning dinner.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Prices change and this list changes with them — it is generated from the same food database
          the app&rsquo;s meal planner shops from, so it is never edited by hand.{" "}
          <Link href="/recipes/" className="text-slate-300 underline underline-offset-4 hover:text-white">
            See the recipes built on it
          </Link>
          .
        </p>
      </section>

      <GuideCta what="a week of meals" />
    </MarketingShell>
  );
}
