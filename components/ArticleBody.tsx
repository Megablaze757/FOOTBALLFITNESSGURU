import Link from "next/link";
import type { Article } from "@/lib/article";
import { SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

/**
 * One article. The structure IS the optimisation: an H1 that matches the
 * title, H2s per section, an FAQ marked up as FAQPage, and links out to the
 * pages this exists to feed. lib/articles.test.ts fails the build if any of
 * that goes missing, so nothing here is a convention somebody has to remember.
 */
export function ArticlePage({ article }: { article: Article }) {
  const url = `${SITE}/articles/${article.slug}/`;
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            {
              "@type": "Article",
              headline: article.title,
              description: article.description,
              datePublished: article.published,
              dateModified: article.updated ?? article.published,
              mainEntityOfPage: url,
              author: { "@type": "Organization", name: "PocketAthlete", url: `${SITE}/` },
              publisher: { "@type": "Organization", name: "PocketAthlete", url: `${SITE}/` },
            },
            ...(article.faq?.length
              ? [{
                  "@type": "FAQPage",
                  mainEntity: article.faq.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }]
              : []),
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Articles", url: `${SITE}/articles/` },
              { name: article.title, url },
            ]),
          ])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/articles/" className="hover:text-accent-400">← All articles</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{article.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        <time dateTime={article.updated ?? article.published}>
          {new Date(article.updated ?? article.published).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric",
          })}
        </time>
      </p>

      {article.intro.map((p) => (
        <p key={p} className="mt-4 max-w-2xl text-lg text-slate-300">{p}</p>
      ))}

      {article.sections.map((s) => (
        <section key={s.heading} className="mt-10">
          <h2 className="text-2xl font-extrabold tracking-tight">{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p} className="mt-3 max-w-2xl text-slate-300">{p}</p>
          ))}
        </section>
      ))}

      {article.faq && article.faq.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-extrabold tracking-tight">Common questions</h2>
          <dl className="mt-4 space-y-5">
            {article.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-bold text-slate-100">{f.q}</dt>
                <dd className="mt-1 max-w-2xl text-slate-300">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-extrabold tracking-tight">Read next</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {article.links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-2xl border border-white/10 px-4 py-3 font-semibold text-slate-100 transition hover:border-pitch-400/40"
              >
                {l.text}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
