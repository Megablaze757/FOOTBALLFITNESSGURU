import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

// The page is a client component (it reads a token from the query string), and
// a client component can't export metadata — so it lives in the layout.
//
// `noindex` because every URL here is one person's opt-out link. There is
// nothing to rank and nothing that should be crawled.
export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Stop receiving Pocket Athlete emails.",
  alternates: { canonical: `${SITE}/unsubscribe/` },
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
