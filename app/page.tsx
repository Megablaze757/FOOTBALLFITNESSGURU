"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { captureRef } from "@/lib/referral";
import { Logo } from "@/components/Logo";
import { PlanGrid } from "@/components/PlanGrid";

// Every line here describes something the app does today. The previous copy promised
// "biomechanist-grade programming" and that "injuries fall" — puffery and an
// outcome claim respectively, and the second is the kind a regulator treats as
// a health claim. Specific and true converts better than grand and vague
// anyway: nobody believes "revolutionary", everybody believes "type 'I don't
// train legs' and it won't program legs".
const FEATURES = [
  { icon: "🩺", title: "Readiness that changes the plan", body: "Sleep, fatigue and a tap on the body map. You get a score in under a minute — and today's session actually changes because of it." },
  { icon: "🤖", title: "A coach that reads your notes", body: "Type “I don't train legs” or “no barbell” and it's obeyed — not once, not lightened, anywhere in the four-week block." },
  { icon: "🎯", title: "Built for your position", body: "A centre back and a winger need different bodies. Programs include the ball work for yours: heading, crossing, first touch." },
  { icon: "🎥", title: "Form analysis on your phone", body: "Film a lift or a sprint and pose tracking flags knee collapse and left–right asymmetry. The clip never leaves your device to be analysed." },
  { icon: "🍽️", title: "Food that fits your week", body: "Say you eat out on Tuesdays and Tuesday is left alone. The shopping list thinks in packs, so one bag of rice covers three meals." },
  { icon: "👥", title: "Coach & squad", body: "Coaches build a program once and assign it across the roster, with every athlete's readiness on one screen." },
];

const STEPS = [
  { n: "01", title: "Check in", body: "60 seconds each morning: sleep, soreness, a tap on the pain map. You get a readiness score straight away." },
  { n: "02", title: "Get your plan", body: "A four-week block around your sport, your position and the days you can actually train — Base, Build, Peak, Deload." },
  { n: "03", title: "Log & analyse", body: "Tick off sessions, log drills and meals, film a lift. Everything feeds the next block." },
  { n: "04", title: "See the work compound", body: "Benchmarks, training volume and streaks trending in one place, so you can tell what's working from what's just busy." },
];

export default function Landing() {
  const { user, loading } = useSession();
  const router = useRouter();
  // Someone who just deleted their account lands back here. Without a word of
  // confirmation they can't tell whether it worked.
  const [deleted, setDeleted] = useState(false);

  useEffect(() => { captureRef(); }, []); // remember ?ref=CODE for signup attribution

  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).get("deleted") === "1");
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [user, loading, router]);

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      {deleted && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
          Your account and all of its data have been deleted. Any subscription was cancelled.
          Thanks for training with us.
        </div>
      )}

      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Logo size={36} />
          <span className="text-lg font-extrabold tracking-tight">PocketAthlete</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/plans" className="hidden rounded-2xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:inline-block">Pricing</Link>
          <Link href="/login" className="hidden rounded-2xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:inline-block">Sign in</Link>
          <Link href="/login" className="rounded-2xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.1]">Start free</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="grid items-center gap-12 pt-10 lg:grid-cols-2 lg:pt-16">
        <div className="animate-fade-up text-center lg:text-left">
          <div className="chip mb-6 text-pitch-400">⚡ Your edge, quantified</div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Train like you have a{" "}
            <span className="gold-text">full-time performance team.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-slate-400 lg:mx-0">
            Check in each morning and get a plan that already knows you slept badly,
            played 90 minutes yesterday and don&apos;t have a squat rack. Built around
            your sport and your position — not a template with your name on it.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/login" className="btn-primary sm:w-auto sm:px-8">Start free — no card needed</Link>
            <Link href="#pricing" className="btn-ghost sm:w-auto sm:px-8">See what's inside</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 lg:justify-start">
            <span>✓ On-device video analysis</span>
            <span>✓ Cancel anytime</span>
            <span>✓ Football · rugby · lifting & more</span>
          </div>
        </div>

        {/* Product mockup */}
        <div className="animate-scale-in">
          <HeroMock />
        </div>
      </section>

      {/* Sports strip */}
      <section className="mt-20 border-y border-white/5 py-6">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          One system replacing your coach · physio · nutritionist · analyst
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <span>⚽ Football</span>
          <span>🏉 Rugby</span>
          <span>🏋️ Weightlifting</span>
          <span>💪 Gym & fitness</span>
          <span>🏀 Basketball</span>
          <span>🏃 Running</span>
        </div>
      </section>

      {/* Features */}
      <section className="mt-20">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Everything the pros get. None of the entourage.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">Six systems that talk to each other — so every recommendation is built on your whole picture, not one number.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card card-hover animate-fade-up p-6" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-2xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-bold text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">From guesswork to game plan</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6">
              <div className="text-3xl font-black text-pitch-400/30">{s.n}</div>
              <h3 className="mt-2 font-bold text-slate-100">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mt-24 scroll-mt-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Simple pricing for athletes and teams.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">A private performance coach runs £100+ an hour. PocketAthlete is the whole staff, every day, from £15 a month.</p>
        </div>
        {/* Rendered from lib/subscription.ts, not written out again here. The
            hand-written version had drifted: it still listed nutrition as free
            and sold Gold on a library that everyone gets. A price list in two
            places is a price list that disagrees with itself. */}
        <div className="mx-auto mt-12 max-w-5xl">
          <PlanGrid mode="public" />
          <p className="mt-6 text-center text-sm">
            <Link href="/plans" className="font-semibold text-pitch-400 hover:underline">
              Full comparison and FAQ →
            </Link>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-24">
        <div className="card relative overflow-hidden p-10 text-center sm:p-16">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_300px_at_50%_-20%,rgba(227,181,63,0.18),transparent)]" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Your next season starts this morning.</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-400">Check in, get your plan, and let the system compound. Free to start.</p>
          <Link href="/login" className="btn-primary mx-auto mt-8 max-w-xs">Create your free account</Link>
        </div>
      </section>

      <footer className="mt-20 flex flex-col items-center gap-2 text-center">
        <div className="text-xl font-extrabold">
          <span className="text-pitch-400">PocketAthlete</span>
        </div>
        <p className="text-xs text-slate-500">Train smarter. Recover faster. Peak when it counts.</p>
        <Link href="/waitlist" className="mt-2 text-xs font-semibold text-pitch-400 hover:underline">
          Not ready to sign up? Join the waitlist →
        </Link>
        <div className="mt-4 flex gap-4 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-pitch-400">Privacy</Link>
          <Link href="/terms" className="hover:text-pitch-400">Terms</Link>
        </div>
        <p className="mt-3 max-w-md text-[11px] leading-relaxed text-slate-600">
          Training guidance, not medical advice. Speak to a qualified professional before
          starting a programme, and stop if something hurts.
        </p>
      </footer>
    </main>
  );
}

// A stylised in-product preview for the hero — pure CSS/SVG, no assets.
function HeroMock() {
  return (
    <div className="card relative mx-auto max-w-md p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Good morning, Jordan</div>
          <div className="text-lg font-extrabold">Today&apos;s readiness</div>
        </div>
        <span className="chip text-readiness-green">● Ready</span>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <Ring value={82} />
        <div className="flex-1 space-y-2">
          <MiniStat label="Load (ACWR)" value="1.12" tone="text-readiness-green" />
          <MiniStat label="Sleep" value="7.8 h" tone="text-slate-100" />
          <MiniStat label="Streak" value="🔥 14 days" tone="text-slate-100" />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.05] p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-pitch-400">AI coach</div>
        <p className="mt-1 text-sm text-slate-200">Left-knee valgus is up 12° and matches your logged soreness — swapping today&apos;s plyos for single-leg stability work.</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {["Single-leg RDL", "Band walks", "Copenhagen"].map((d) => (
          <div key={d} className="rounded-xl bg-white/[0.04] p-2 text-center text-[10px] text-slate-300">{d}</div>
        ))}
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e3b53f" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-2xl font-extrabold">{value}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${tone}`}>{value}</span>
    </div>
  );
}
