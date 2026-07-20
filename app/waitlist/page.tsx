"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const PERKS = [
  { icon: "🎟️", label: "First access when we open the doors" },
  { icon: "🏷️", label: "Founding-member pricing, locked in" },
  { icon: "🧠", label: "Shape the roadmap — early testers steer what we build" },
];

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "already" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setState("error"); setMsg("That doesn't look like an email — check it and try again.");
      return;
    }
    setState("saving"); setMsg("");
    const supabase = createClient();
    const source = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
    const { error } = await supabase.from("waitlist").insert({ email: clean, source });
    if (!error) { setState("done"); return; }
    // A unique-violation means they're already on the list — treat as success.
    if (/duplicate|unique/i.test(error.message)) { setState("already"); return; }
    setState("error"); setMsg("Something went wrong our end. Try again in a moment.");
  }

  const joined = state === "done" || state === "already";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(600px_240px_at_50%_0%,rgba(227,181,63,0.14),transparent)]" />

      <div className="w-full max-w-md text-center">
        <div className="mb-8 text-2xl font-extrabold tracking-tight">
          <span className="text-pitch-400">◆</span> PocketAthlete
        </div>

        {!joined ? (
          <>
            <span className="eyebrow">Launching soon</span>
            <h1 className="mt-2 text-4xl font-extrabold leading-tight tracking-tight">
              Train like you have a full-time performance team.
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              Readiness, AI coaching, video biomechanics and nutrition — the whole staff of a pro
              club, in one app. Join the waitlist for first access.
            </p>

            <form onSubmit={join} className="mt-7 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="field flex-1 text-center sm:text-left"
                aria-label="Email address"
              />
              <button type="submit" disabled={state === "saving"} className="btn-primary sm:w-auto sm:px-6">
                {state === "saving" ? "Adding…" : "Join the waitlist"}
              </button>
            </form>
            {state === "error" && <p className="mt-2 text-sm text-readiness-red">{msg}</p>}

            <ul className="mx-auto mt-8 max-w-xs space-y-2 text-left">
              {PERKS.map((p) => (
                <li key={p.label} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="text-lg">{p.icon}</span> {p.label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="animate-scale-in">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-pitch-400/15 text-3xl">✓</div>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
              {state === "already" ? "You're already in." : "You're on the list."}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              We&apos;ll email <span className="text-slate-200">{email.trim().toLowerCase()}</span> the moment
              early access opens. Want to jump the queue?
            </p>
            <button
              onClick={() => {
                const url = "https://pocketathlete.com/waitlist";
                const text = "Join me on the PocketAthlete waitlist — train like you have a full-time performance team.";
                if (navigator.share) navigator.share({ title: "PocketAthlete", text, url }).catch(() => {});
                else navigator.clipboard?.writeText(url).catch(() => {});
              }}
              className="btn-ghost mx-auto mt-6 max-w-[16rem]"
            >
              Share with a teammate ↗
            </button>
          </div>
        )}

        <p className="mt-10 text-xs text-slate-600">
          Already have access? <Link href="/login" className="text-slate-400 hover:text-pitch-400">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
