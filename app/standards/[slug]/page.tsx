import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { notFound } from "next/navigation";
import { standardPages, findStandardPage, standardTable, tierColumns, standardSummary } from "@/lib/standards-page";
import { slugify, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

export function generateStaticParams() {
  return standardPages().map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = findStandardPage(params.slug);
  if (!page) return { title: "Not found" };
  const title = `${page.lift.label} standards by bodyweight`;
  const description = `${standardSummary(page.lift, "male")} The full table for men and women, `
    + `from untrained to world class.`;
  const url = `${SITE}/standards/${page.slug}/`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: ogImage(`standards-${page.slug}`, title) },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const page = findStandardPage(params.slug);
  if (!page) notFound();
  const { lift, slug } = page;
  const tiers = tierColumns();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Strength standards", url: `${SITE}/standards/` },
            { name: lift.label, url: `${SITE}/standards/${slug}/` },
          ])])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/standards/" className="hover:text-accent-400">← All strength standards</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{lift.label} standards</h1>
      <p className="mt-3 max-w-2xl text-slate-300">{standardSummary(lift, "male")}</p>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        Standards are multiples of bodyweight, rounded to the nearest 2.5kg — the smallest increment a
        barbell offers. They describe what lifters at a bodyweight tend to lift; they are not a target
        anybody has to hit.
      </p>

      {(["male", "female"] as const).map((sex) => (
        <section key={sex} className="mt-10">
          <h2 className="text-xl font-extrabold tracking-tight capitalize">{sex}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Bodyweight</th>
                  {tiers.map((t) => <th key={t.name} className="py-2 pr-3 font-semibold">{t.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {standardTable(lift, sex).map((row) => (
                  <tr key={row.bodyweight} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 font-semibold text-slate-200">{row.bodyweight}kg</td>
                    {row.targets.map((kg, i) => (
                      <td key={i} className="py-2 pr-3 text-slate-400">{kg}kg</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="mt-12">
        <h2 className="text-xl font-extrabold tracking-tight">Read next</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <li>
            <Link href={`/exercises/${slugify(lift.label)}/`} className="block rounded-2xl border border-white/10 px-4 py-3 font-semibold text-slate-100 transition hover:border-pitch-400/40">
              How to {lift.label.toLowerCase()}
            </Link>
          </li>
          {standardPages().filter((p) => p.slug !== slug).slice(0, 5).map((p) => (
            <li key={p.slug}>
              <Link href={`/standards/${p.slug}/`} className="block rounded-2xl border border-white/10 px-4 py-3 font-semibold text-slate-100 transition hover:border-pitch-400/40">
                {p.lift.label} standards
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
