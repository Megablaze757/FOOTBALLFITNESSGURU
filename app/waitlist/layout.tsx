import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import { SITE } from "@/lib/seo";

// The page itself is a client component, and a client component can't export
// metadata — so it lives in a layout wrapping it.
export const metadata: Metadata = {
  title: "Join the waitlist",
  description:
    "Get first access to PocketAthlete, founding-member pricing locked in, and a say in what " +
    "gets built. An AI performance coach for athletes who train seriously.",
  alternates: { canonical: `${SITE}/waitlist/` },
  openGraph: { images: ogImage("default", "PocketAthlete"),
    title: "Join the PocketAthlete waitlist",
    description: "First access, founding-member pricing, and a say in the roadmap.",
    url: `${SITE}/waitlist/`,
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
