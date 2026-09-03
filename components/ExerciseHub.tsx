import Link from "next/link";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { slugify, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";
import { findHub, publishableHubs, hubPath, HUB_COPY, type HubKind } from "@/lib/hubs";

export const HUB_MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

export function hubParams(kind: HubKind) {
  return publishableHubs(HUB_MOVEMENTS)
    .filter((h) => h.hub.kind === kind)
    .map(({ hub }) => ({ slug: hub.slug }));
}

export function hubMetadata(kind: HubKind, slug: string) {
  const found = findHub(kind, slug, HUB_MOVEMENTS);
  if (!found) return { title: "Not found" };
  const { hub, members } = found;
  const title = HUB_COPY[kind].title(hub.name);
  const description = HUB_COPY[kind].blurb(hub.name, members.length);
  const url = `${SITE}${hubPath(hub)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

/**
 * A topic hub — the page "dumbbell chest exercises" was always looking for.
 *
 * The list is the page. There is no generated introduction above it, for the
 * reason lib/collections.ts gives: the only honest thing to say here is what
 * the data already says, and a paragraph of prose written to sit above a list
 * is the part a reader scrolls past and a crawler discounts.
 */
export function ExerciseHubPage({ kind, slug }: { kind: HubKind; slug: string }) {
  const found = findHub(kind, slug, HUB_MOVEMENTS);
  if (!found) return null;
  const { hub, members } = found;
  const others = publishableHubs(HUB_MOVEMENTS).filter((h) => h.hub.slug !== hub.slug || h.hub.kind !== hub.kind);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Exercises", url: `${SITE}/exercises/` },
              { name: HUB_COPY[kind].title(hub.name), url: `${SITE}${hubPath(hub)}` },
            ]),
            {
              "@type": "ItemList",
              name: HUB_COPY[kind].title(hub.name),
              numberOfItems: members.length,
              itemListElement: members.map((m, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: m.name,
                url: `${SITE}/exercises/${slugify(m.name)}/`,
              })),
            },
          ])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/exercises/" className="hover:text-accent-400">← All exercises</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{HUB_COPY[kind].title(hub.name)}</h1>
      <p className="mt-3 max-w-2xl text-slate-400">{HUB_COPY[kind].blurb(hub.name, members.length)}</p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/exercises/${slugify(m.name)}/`}
              className="block rounded-2xl border border-white/10 px-4 py-3 transition hover:border-pitch-400/40"
            >
              <span className="font-semibold text-slate-100">{m.name}</span>
              <span className="block text-xs text-slate-500">
                {[m.equipment, m.muscles.join(", ")].filter(Boolean).join(" · ")}
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
              href={hubPath(h)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:border-pitch-400/40"
            >
              {h.name} <span className="text-slate-600">{m.length}</span>
            </Link>
          ))}
        </div>
      </section>

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
