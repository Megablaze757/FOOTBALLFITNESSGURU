"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { captureRef, getRef } from "@/lib/referral";

const PERKS = [
  { icon: "🎟️", label: "First access when we open the doors" },
  { icon: "🏷️", label: "Founding-member pricing, locked in" },
  { icon: "🧠", label: "Shape the roadmap — early testers steer what we build" },
];

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "already" | "error">("idle");
  const [msg, setMsg] = useState("");

  // Persist ?ref= so an affiliate still gets credit if the visitor navigates
  // before joining.
  useEffect(() => { captureRef(); }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setState("error"); setMsg("That doesn't look like an email — check it and try again.");
      return;
    }
    setState("saving"); setMsg("");
    const supabase = createClient();
    // The affiliate code may be in the URL now, or stored from an earlier click
    // on the landing page — either way it attributes this person to them.
    //
    // Sent as `referral_code`, not smuggled in `source`: joining the waitlist
    // through someone's link binds this email to them PERMANENTLY (see
    // migration 0057), and the column that decides who gets paid should be the
    // one that says so. `source` is kept in step for the older links already in
    // circulation, which still put the code there.
    const source = getRef();
    const { error } = await supabase
      .from("waitlist")
      .insert({ email: clean, source, referral_code: source });
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
          <span className="text-accent-400">◆</span> PocketAthlete
        </div>

        {!joined ? (
          <>
            <span className="eyebrow">Launching soon</span>
            <h1 className="mt-2 text-4xl font-extrabold leading-tight tracking-tight">
              Train like you have a full-time performance team.
            </h1>
            {/* Was a feature list — "readiness, AI coaching, video biomechanics
                and nutrition" tells someone what we built, not what they get.
                The landing page's own comment says specific beats grand. */}
            <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
              A four-week plan built around your sport and position, with every movement explained.
              Football, rugby, basketball, running, lifting or gym. Join the waitlist for first access.
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
          Already have access? <Link href="/login" className="text-slate-400 underline underline-offset-2 hover:text-accent-400">Sign in</Link>
        </p>
        {/* Required before collecting an email address, not decoration. */}
        <p className="mt-3 text-xs text-slate-600">
          We&apos;ll only email you about early access. See our{" "}
          <Link href="/privacy" className="text-slate-400 underline underline-offset-2 hover:text-accent-400">privacy policy</Link>.
        </p>
      </div>
    </main>
  );
}
