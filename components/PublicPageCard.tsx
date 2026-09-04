"use client";

import { useState } from "react";
import Link from "next/link";
import { athleteShareLink } from "@/lib/share-card";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "I CAN'T FIND WHERE THE SOCIAL PROFILES ARE."
 *
 * They were nowhere findable. /a/ is linked from the MARKETING footer — the
 * public site — so from inside the signed-in app there was no route to it at
 * all. And the switch that creates one sits in Profile among a dozen other
 * checkboxes, which is where a setting belongs and not where a feature gets
 * discovered.
 *
 * So it goes on Rewards, beside the rank. That is the screen somebody opens to
 * look at their rank, and a public page is that rank with an address — the one
 * place where "you could put this somewhere people see it" answers itself.
 *
 * WHEN IT IS ON, the address is the whole point: shown in full, copyable in one
 * tap, and openable. A page whose URL you have to reconstruct is a page nobody
 * shares.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function PublicPageCard({
  username,
  isPublic,
}: {
  username: string | null | undefined;
  isPublic: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link = athleteShareLink(username, true);

  // No username, no page — and the profile page is where you get one, so the
  // card still appears and says so rather than vanishing.
  if (!username) {
    return (
      <Card>
        <p className="text-sm text-slate-300">
          Pick a username and you can have a public page: your rank, sport and position at an
          address you can post.
        </p>
        <Link href="/profile" className="btn-primary mt-3 inline-block">Choose a username</Link>
      </Card>
    );
  }

  if (!isPublic) {
    return (
      <Card>
        <p className="text-sm text-slate-300">
          You don&apos;t have a public page yet. Turn one on and{" "}
          <b className="text-slate-100">{link}</b> shows your rank, sport and position — and nothing
          else. It is the address your share cards link to.
        </p>
        <Link href="/profile" className="btn-primary mt-3 inline-block">Turn on my page</Link>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm text-slate-400">Your public page</p>
      <p className="mt-1 break-all text-lg font-extrabold text-slate-100">{link}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            navigator.clipboard.writeText(`https://${link}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="tap-target rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        {/* A new tab: this is a signed-in screen and the page is a public one,
            so sending them away from the app to look at it is the wrong trade. */}
        <a
          href={`/a/${username}/`}
          target="_blank"
          rel="noreferrer"
          className="tap-target rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
        >
          View it
        </a>
        <Link
          href="/a/"
          className="tap-target rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300"
        >
          Everyone else
        </Link>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        New pages go live at the next update, not straight away.
      </p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card p-5">{children}</div>;
}
