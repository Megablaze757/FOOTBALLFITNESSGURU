import type { Metadata } from "next";
import Link from "next/link";
import { standardPages, standardSummary } from "@/lib/standards-page";
import { STRENGTH_TIERS } from "@/lib/strength-standards";
import { SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

const PAGES = standardPages();

export const metadata: Metadata = {
  title: "Strength standards by bodyweight",
  description:
    `Strength standards for ${PAGES.length} barbell lifts as multiples of bodyweight, from untrained `
    + "to world class — the same numbers the app uses to rank your own lifts.",
  alternates: { canonical: `${SITE}/standards/` },
};

export default function StandardsIndex() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Strength standards", url: `${SITE}/standards/` },
          ])])),
        }}
      />
      <h1 className="text-4xl font-extrabold tracking-tight">Strength standards</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        What a lift is worth at your bodyweight, across {STRENGTH_TIERS.length} tiers. The same numbers
        the app ranks your own training with — not a separate opinion written for a web page.
      </p>
      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {PAGES.map(({ lift, slug }) => (
          <li key={slug}>
            <Link href={`/standards/${slug}/`} className="block rounded-2xl border border-white/10 px-4 py-3 transition hover:border-pitch-400/40">
              <span className="font-semibold text-slate-100">{lift.label} standards</span>
              <span className="mt-0.5 block text-xs text-slate-500">{standardSummary(lift, "male")}</span>
            </Link>
          </li>
        ))}
      </ul>
      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
