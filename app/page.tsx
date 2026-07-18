"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { captureRef } from "@/lib/referral";

const FEATURES = [
  { icon: "🩺", title: "Readiness engine", body: "A daily Green / Yellow / Red score built from sleep, fatigue, soreness and a full-body pain map — so you know when to push and when to back off." },
  { icon: "🤖", title: "AI coach", body: "Biomechanist-grade programming that names your weak link and prescribes the exact drills to fix it — pain-aware and periodised to your season." },
  { icon: "🎥", title: "Video biomechanics", body: "Upload a clip and on-device pose tracking flags knee valgus, asymmetry and ground-contact — then links it to the pain in your journal." },
  { icon: "🍽️", title: "Fuelling targets", body: "Calorie, macro and hydration targets that adapt to your training load and body-composition goals, updated every day." },
  { icon: "📈", title: "Progress, proven", body: "Training volume, drill PRs, benchmarks and body comp — every metric trending in one place so you can see the work compounding." },
  { icon: "👥", title: "Coach & squad", body: "Share a read-only view with your coach or manage a full roster of athletes with live readiness across the whole squad." },
];

const STEPS = [
  { n: "01", title: "Check in", body: "60 seconds each morning: sleep, soreness, a tap on the pain map. Apex computes your readiness." },
  { n: "02", title: "Get your plan", body: "The AI coach builds a periodised program around your goals, your season and today's readiness." },
  { n: "03", title: "Log & analyse", body: "Tick off sessions, log drills and nutrition, upload video. Everything feeds the next recommendation." },
  { n: "04", title: "Peak on the day", body: "Watch benchmarks climb and injuries fall as the system learns what works for your body." },
];

export default function Landing() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => { captureRef(); }, []); // remember ?ref=CODE for signup attribution

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [user, loading, router]);

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-lg font-black text-ink-900 shadow-glow">A</span>
          <span className="text-lg font-extrabold tracking-tight">Apex</span>
        </div>
        <div className="flex items-center gap-2">
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
            Readiness, AI coaching, video biomechanics, nutrition and progress —
            the entire high-performance staff of a pro club, in one app.
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
          <p className="mx-auto mt-3 max-w-xl text-slate-400">A private performance coach runs $100+ an hour. Apex is the whole staff, every day, from $15 a month.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          <div className="card p-7">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Free</h3>
            <div className="mt-3 text-4xl font-extrabold">$0</div>
            <p className="mt-2 text-sm text-slate-400">Build the habit.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <Perk>Daily readiness score</Perk>
              <Perk>Training &amp; nutrition journal</Perk>
              <Perk>Progress history</Perk>
            </ul>
            <Link href="/login" className="btn-ghost mt-8">Get started</Link>
          </div>

          <div className="card-premium relative overflow-hidden p-7">
            <div className="absolute right-5 top-5 chip text-pitch-400">Most popular</div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-pitch-400">Gold</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$20</span>
              <span className="text-slate-400">/month</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">The full performance team, for you.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <Perk gold>AI coach — custom programs</Perk>
              <Perk gold>Video biomechanics &amp; root-cause</Perk>
              <Perk gold>Adaptive nutrition targets</Perk>
              <Perk gold>Full multi-sport exercise library</Perk>
            </ul>
            <Link href="/login" className="btn-primary mt-8">Start free trial</Link>
          </div>

          <div className="card p-7">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Team</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$150</span>
              <span className="text-slate-400">/month</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">For clubs &amp; coaches.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <Perk>Gold for up to 25 athletes</Perk>
              <Perk>Live squad readiness dashboard</Perk>
              <Perk>Per-athlete programs &amp; flags</Perk>
              <Perk>Team reports (PDF)</Perk>
            </ul>
            <a href="mailto:sales@apex.app?subject=Apex%20Team%20plan" className="btn-ghost mt-8">Contact us</a>
          </div>
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
          <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">Apex</span>
        </div>
        <p className="text-xs text-slate-500">Train smarter. Recover faster. Peak on match day.</p>
      </footer>
    </main>
  );
}

function Perk({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={gold ? "text-pitch-400" : "text-slate-500"}>✓</span>
      <span>{children}</span>
    </li>
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
