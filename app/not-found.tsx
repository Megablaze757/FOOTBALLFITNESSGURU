"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Places worth offering someone who took a wrong turn.
const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/coach", label: "AI Coach", icon: "🧠" },
  { href: "/train", label: "Train", icon: "🎬" },
  { href: "/library", label: "Exercises", icon: "📚" },
  { href: "/essentials", label: "Playbook", icon: "🎯" },
  { href: "/nutrition", label: "Nutrition", icon: "🍝" },
];

// The site used to be served from https://<user>.github.io/FOOTBALLFITNESSGURU/.
// Bookmarks, old emails and shared links still carry that prefix, and on the
// custom domain every one of them 404s. Rather than dead-end those people, strip
// the prefix and send them where they were actually going.
const LEGACY_PREFIXES = ["/FOOTBALLFITNESSGURU", "/footballfitnessguru"];

export default function NotFound() {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const legacy = LEGACY_PREFIXES.find((p) => pathname.startsWith(p));
    if (!legacy) return;

    const fixed = pathname.slice(legacy.length) || "/home";
    setRedirecting(true);
    // Replace rather than push, so Back doesn't bounce them into the 404 again.
    window.location.replace(`${fixed}${search}${hash}`);
  }, []);

  if (redirecting) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="card w-full max-w-sm p-8 text-center">
          <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-300">Taking you to the right page…</p>
          <p className="mt-1 text-xs text-slate-500">That link used our old address.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl font-extrabold leading-none">
          <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">404</span>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
          The link may be out of date, or we may have moved things around. Nothing you&apos;ve logged is affected.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="card card-hover flex flex-col items-center gap-1.5 px-3 py-4 text-sm font-medium text-slate-200"
            >
              <span className="text-xl">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Link href="/home" className="btn-primary max-w-[14rem]">Back to home</Link>
          <button
            onClick={() => window.history.back()}
            className="text-sm text-slate-400 transition hover:text-pitch-400"
          >
            ← Go back
          </button>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Still stuck? Email{" "}
          <a href="mailto:hello@pocketathlete.com" className="text-pitch-400 hover:underline">
            hello@pocketathlete.com
          </a>
        </p>
      </div>
    </main>
  );
}
