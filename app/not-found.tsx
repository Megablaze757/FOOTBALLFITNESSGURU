import type { Metadata } from "next";
import { NotFoundView } from "@/components/NotFoundView";

/**
 * A server component purely so it can export `metadata`.
 *
 * The page itself needs client hooks (the legacy-URL redirect reads
 * `window.location`), and a client component cannot export metadata — so this
 * page was inheriting the root title and telling every browser tab, history
 * entry and crawler that a missing page was "PocketAthlete — AI Athlete Coach".
 * The body lives in components/NotFoundView.tsx.
 */
export const metadata: Metadata = {
  // Just the leaf. The root layout supplies a title template, so
  // repeating the brand here rendered "Page not found — PocketAthlete |
  // PocketAthlete".
  title: "Page not found",
  description: "That page doesn't exist. Here's the way back.",
  // A 404 has nothing worth indexing, and letting search engines keep it costs
  // real crawl budget on a site whose actual pages we want found.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundView />;
}
