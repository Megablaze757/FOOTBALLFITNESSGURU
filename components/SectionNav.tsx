"use client";

import Link from "next/link";
import { SECTION_LINKS, NavIcon } from "@/components/nav-items";

/**
 * The rest of a section, on the section.
 *
 * THIS IS WHAT REPLACED THE "MORE" SHEET. Four destinations — the exercise
 * library, video analysis, the guides and the training history — had no link
 * anywhere in the app except that sheet, which is a drawer you open when you
 * already suspect there is something in it. Nobody who hadn't been told ever
 * opened it.
 *
 * A row of chips under the heading of the tab they belong to is the whole fix:
 * you arrive at Training and can see, without tapping anything, that exercises
 * and video analysis are part of training. Two taps to anything, and the second
 * tap is on a word rather than an ellipsis.
 *
 * Horizontally scrollable rather than wrapped — a second row would push the
 * page's actual content below the fold on a phone, and these are signposts, not
 * the point of the page.
 */
export function SectionNav({ section }: { section: string }) {
  const links = SECTION_LINKS[section];
  if (!links?.length) return null;
  return (
    <nav aria-label="More in this section" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="tap-target flex shrink-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-semibold text-slate-300 transition hover:border-pitch-400/30 hover:text-pitch-400"
        >
          <NavIcon name={l.icon} active={false} size={16} />
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
