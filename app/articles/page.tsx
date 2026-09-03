import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { ARTICLES } from "@/lib/articles";
import { SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Articles — training and nutrition, from our own data",
  description:
    "Articles built from the numbers this app already computes: what protein actually costs, "
    + "what a lift is worth at your bodyweight, and what the data says about training.",
  alternates: { canonical: `${SITE}/articles/` },
  openGraph: { images: ogImage("articles", "Articles") },
};

export default function ArticlesIndex() {
  const sorted = [...ARTICLES].sort((a, b) => b.published.localeCompare(a.published));
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Articles", url: `${SITE}/articles/` },
          ])])),
        }}
      />
      <h1 className="text-4xl font-extrabold tracking-tight">Articles</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Every figure in these is computed from the same data the app runs on, so none of it goes
        stale in a drawer.
      </p>
      <ul className="mt-8 space-y-3">
        {sorted.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/articles/${a.slug}/`}
              className="block rounded-2xl border border-white/10 p-5 transition hover:border-pitch-400/40"
            >
              <h2 className="text-xl font-bold text-slate-100">{a.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{a.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
