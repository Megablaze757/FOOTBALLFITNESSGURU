import type { MetadataRoute } from "next";
import { SITE, guideSports, guidePages } from "@/lib/seo";

// Generated at build time from lib/seo.ts, which is the same source the pages
// and the internal links use — so the sitemap can't list a URL that 404s.
//
// Only public pages. Everything behind auth is disallowed in robots.txt and
// listing it here would contradict that.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core = [
    { url: `${SITE}/`, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${SITE}/plans/`, changeFrequency: "weekly" as const, priority: 0.95 },
    { url: `${SITE}/waitlist/`, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${SITE}/drills/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/guides/`, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${SITE}/privacy/`, changeFrequency: "yearly" as const, priority: 0.2 },
    { url: `${SITE}/terms/`, changeFrequency: "yearly" as const, priority: 0.2 },
  ];

  const drills = guideSports().map((sport) => ({
    url: `${SITE}/drills/${sport}/`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const guides = guidePages().map(({ sport, slug }) => ({
    url: `${SITE}/guides/${sport}/${slug}/`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...core, ...drills, ...guides].map((e) => ({ ...e, lastModified: now }));
}
