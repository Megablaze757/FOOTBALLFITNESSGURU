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
  // "Under a minute" was true of the old form. The quick check-in is three taps.
  { icon: "🩺", title: "Readiness that changes the plan", body: "Three taps — sleep, how the body feels, anything sore. Today's session actually changes because of it, and a load spike caps the verdict even when you feel fine." },
  { icon: "🤖", title: "A coach that reads your notes", body: "Type “I don't train legs” or “no barbell” and it's obeyed — not once, not lightened, anywhere in the four-week block." },
  { icon: "🎯", title: "Built for your position", body: "A centre back and a winger need different bodies. Programs include the ball work for yours: heading, crossing, first touch." },
  { icon: "🎥", title: "Form analysis on your phone", body: "Film a lift or a sprint and pose tracking flags knee collapse and left–right asymmetry. The clip never leaves your device to be analysed." },
  { icon: "🍽️", title: "Food that fits your week", body: "Say you eat out on Tuesdays and Tuesday is left alone. The shopping list thinks in packs, so one bag of rice covers three meals." },
  { icon: "👥", title: "Coach & squad", body: "Coaches build a program once and assign it across the roster, with every athlete's readiness on one screen." },
];

// ORDER MATTERS, AND IT WAS WRONG.
//
// Step 01 used to be "Check in — 60 seconds each morning", so the first thing a
// stranger learned about the product was the daily obligation, before they knew
// what they'd get for it. That is precisely the impression users fed back as
// "the app is a lot of commitment to use". The plan is the product; the check-in
// tunes it. The app itself now opens a new athlete on "build your program", and
// this reads in the same order.
const STEPS = [
  { n: "01", title: "Get your plan", body: "A four-week block around your sport, your position and the days you can actually train — Base, Build, Peak, Deload." },
  { n: "02", title: "Train it", body: "Every session laid out with sets, reps, rest and how to do each movement. Tick them off as you go." },
  { n: "03", title: "Check in when you can", body: "Three taps — how you slept, how the body feels, whether anything hurts. It retunes today's session. Skip it and everything still works." },
  { n: "04", title: "See what's actually working", body: "Benchmarks, training load and per-lift progress in one place, so you can tell real progress from just being busy." },
];

/**
 * The problem, named before the product.
 *
 * The page went straight from a headline to a feature grid, so it answered "what
 * is this?" and never "why would I bother?". Nobody buys a solution to a problem
 * they haven't been reminded they have — and these are the four an athlete
 * actually recognises, in their own words, not ours.
 */
const PROBLEM = [
  {
    bad: "You're following a plan that's never heard of you.",
    good: "A PDF or a YouTube block was written for nobody in particular. Yours is built from your sport, your position, your kit and the days you can train.",
  },
  {
    bad: "You trained hard on four hours' sleep, again.",
    good: "Tell it in three taps and today's session eases off by itself — a set comes off, the effort targets drop. You don't have to decide when you're the worst person to ask.",
  },
  {
    bad: "You don't actually know if it's working.",
    good: "Same tests, months apart, charted. Real progress looks different from a busy week, and you can finally tell which one you had.",
  },
  {
    bad: "The niggle you've been ignoring is about to cost you six weeks.",
    good: "It watches your load for the spike that precedes most injuries, and caps your readiness even when you feel fine — because that's exactly when it catches people.",
  },
];

/**
 * Honest comparison. No competitor named, nothing invented.
 *
 * Every row is something this app does and the alternatives demonstrably don't,
 * or a place a real coach is genuinely better. Claiming to beat a human coach on
 * everything would be the fastest way to lose someone who's had one.
 */
const COMPARE: { row: string; app: string; generic: string; coach: string }[] = [
  { row: "Built around your sport and position", app: "yes", generic: "no", coach: "yes" },
  { row: "Changes when you've slept badly", app: "yes", generic: "no", coach: "if you tell them" },
  { row: "Every movement explained, not just named", app: "yes", generic: "sometimes", coach: "yes" },
  { row: "Spots a load spike before it injures you", app: "yes", generic: "no", coach: "yes" },
  { row: "Video form analysis", app: "yes", generic: "no", coach: "yes" },
  { row: "Available at 6am on a Tuesday", app: "yes", generic: "yes", coach: "no" },
  { row: "Can watch you move and correct you in person", app: "no", generic: "no", coach: "yes" },
  { row: "Monthly cost", app: "£20", generic: "£10–15", coach: "£400+" },
];

/**
 * Who it's for, and who it isn't.
 *
 * Turning people away converts better than claiming to suit everyone: it makes
 * the yes credible. It also saves the refund and the one-star review from someone
 * who wanted a bodybuilding app.
 */
const FIT = {
  yes: [
    "You play a sport and train around it — football, rugby, basketball, running, lifting or general gym.",
    "You've got two to six days a week, not unlimited time.",
    "You want to know why you're doing something, not just what.",
    "You're coming back from a niggle and don't want to make it worse.",
  ],
  no: [
    "You want a bodybuilding split and nothing else — there are cheaper apps for that.",
    "You already have a strength coach writing your week. This would be a second opinion you didn't ask for.",
    "You want someone to shout at you. It won't.",
  ],
};

/** The objections people actually have, answered plainly. */
const FAQ = [
  {
    q: "Is this just ChatGPT in a wrapper?",
    a: "No. The programme is built by a rules engine on the device — periodised blocks, movement patterns, rest and progression — so it works offline and can't hallucinate a session. AI is used for the parts where words matter: reading your notes, writing a rehab plan, answering questions.",
  },
  {
    q: "I've abandoned three fitness apps already.",
    a: "Fair. The daily check-in is three taps and the app says outright that skipping it costs you nothing — the plan, the library and the analysis all work without it. There are no streaks to break and nothing nags you.",
  },
  {
    q: "What do I get without paying?",
    a: "The check-in and readiness score, the full exercise library with how-to for every movement, every skill drill, the position guides and the leaderboards. Free forever, no card.",
  },
  {
    q: "Do my videos get uploaded somewhere?",
    a: "Pose tracking runs in your browser, on your phone. The clip is analysed on the device and never sent anywhere to be processed.",
  },
  {
    q: "Can I cancel?",
    a: "In two taps from your profile, and you keep access until the end of the period you've paid for. No email, no phone call, no retention offer.",
  },
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
          {/* "⚡ Your edge, quantified" was here. It's the kind of line that
              sounds like something and means nothing — and a stranger's first
              impression shouldn't be spent on it. Replaced with the one fact
              that removes the risk of reading on. */}
          <div className="chip mb-6 text-pitch-400">Free forever tier · no card to start</div>
          {/* The old headline — "Train like you have a full-time performance
              team" — sold a metaphor. This names the thing that's actually wrong
              with how most people train, which is the thing they recognise. */}
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Stop training to a plan that&apos;s{" "}
            <span className="gold-text">never heard of you.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-slate-400 lg:mx-0">
            Four weeks of sessions built from your sport, your position, your kit and the days you
            can actually train — every movement explained. Slept badly? Three taps and today eases
            off by itself.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link href="/login" className="btn-primary sm:w-auto sm:px-8">Build my first plan — free</Link>
            <Link href="#how" className="btn-ghost sm:w-auto sm:px-8">See how it works</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 lg:justify-start">
            <span>✓ On-device video analysis</span>
            <span>✓ Cancel anytime</span>
            {/* Naming all six beats "& more" now that each has its own tests,
                drills, vocabulary and tool order rather than football's with a
                different badge. */}
            <span>✓ Football · rugby · basketball · running · lifting · gym</span>
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

      {/* THE PROBLEM, BEFORE THE PRODUCT.
          The page used to go headline → feature grid, answering "what is this?"
          and never "why would I bother?". These are the four complaints an
          athlete recognises immediately, each paired with what the app does
          about it — so it reads as an answer rather than a boast. */}
      <section className="mt-20">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Four things that go wrong without this
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            None of them are your fault. All of them are fixable.
          </p>
        </div>
        <div className="mt-12 space-y-3">
          {PROBLEM.map((p, i) => (
            <div key={p.bad} className="card animate-fade-up p-5 sm:p-6" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                <p className="flex-1 text-base font-bold text-slate-100 sm:text-lg">
                  <span className="mr-2 text-readiness-red">✕</span>{p.bad}
                </p>
                <p className="flex-1 text-sm leading-relaxed text-slate-400">
                  <span className="mr-2 font-bold text-pitch-400">✓</span>{p.good}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mt-24">
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
      <section id="how" className="mt-24 scroll-mt-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">From guesswork to game plan</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            About two minutes from signing up to a plan you can train today.
          </p>
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

      {/* HONEST COMPARISON.
          No competitor named and nothing invented. Two rows deliberately go
          against us — a coach can watch you move, and this can't — because a
          table where one column wins everything is a table nobody believes. */}
      <section className="mt-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Next to the alternatives</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Including the two things a coach in the room does better than any app.
          </p>
        </div>
        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 pr-4 text-left font-medium text-slate-400"> </th>
                <th className="px-3 py-3 text-center font-extrabold text-pitch-400">PocketAthlete</th>
                <th className="px-3 py-3 text-center font-medium text-slate-400">A generic fitness app</th>
                <th className="px-3 py-3 text-center font-medium text-slate-400">A private coach</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((c) => (
                <tr key={c.row} className="border-b border-white/[0.06]">
                  <td className="py-3 pr-4 text-left text-slate-200">{c.row}</td>
                  <Cell v={c.app} highlight />
                  <Cell v={c.generic} />
                  <Cell v={c.coach} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* WHO IT'S FOR, AND WHO IT ISN'T.
          Turning people away is what makes the yes credible — and it saves the
          one-star review from someone who wanted a bodybuilding app. */}
      <section className="mt-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Is this for you?</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="text-lg font-bold text-pitch-400">Yes, if…</h3>
            <ul className="mt-4 space-y-3">
              {FIT.yes.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                  <span className="shrink-0 font-bold text-pitch-400">✓</span>{t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h3 className="text-lg font-bold text-slate-300">Probably not, if…</h3>
            <ul className="mt-4 space-y-3">
              {FIT.no.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-slate-400">
                  <span className="shrink-0 text-slate-500">✕</span>{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mt-24 scroll-mt-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Simple pricing for athletes and teams.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">A private performance coach runs £100+ an hour. PocketAthlete is the whole staff, every day, from £20 a month.</p>
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

      {/* THE OBJECTIONS, ANSWERED.
          These are the five things someone actually thinks before paying £20 a
          month, including "is this just ChatGPT" and "I've abandoned three of
          these already". Leaving them unanswered doesn't make them go away — it
          just means they get answered by the back button. */}
      <section className="mt-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">The bit you were about to ask</h2>
        </div>
        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card p-5">
              <summary className="tap-target cursor-pointer list-none text-base font-bold text-slate-100">
                {f.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-24">
        <div className="card relative overflow-hidden p-10 text-center sm:p-16">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_300px_at_50%_-20%,rgba(227,181,63,0.18),transparent)]" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Your next block starts today.</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-400">
            Two minutes to a plan you can train this afternoon. No card, and the free tier stays
            free — so the only way to find out is to try it.
          </p>
          {/* Same words as the hero button. A second CTA phrased differently
              reads as a second, unfamiliar decision. */}
          <Link href="/login" className="btn-primary mx-auto mt-8 max-w-xs">Build my first plan — free</Link>
          <p className="mt-4 text-xs text-slate-500">
            Cancel in two taps from your profile · your videos never leave your phone
          </p>
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
          {/* Not "Load (ACWR)". This is the LOGGED-OUT landing page — the one
              audience guaranteed not to know what an acute:chronic workload
              ratio is, being shown it as the headline proof the app works.
              The dashboard has said "Sweet spot" for a while; this now agrees
              with it. */}
          <MiniStat label="Training load" value="Sweet spot" tone="text-readiness-green" />
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

/**
 * One cell of the comparison table.
 *
 * "yes" and "no" become a mark rather than a word — a column of the word "yes"
 * is harder to scan than a column of ticks. Anything else is rendered as written,
 * because "if you tell them" and "£400+" are the honest answers and flattening
 * them to a tick or a cross would be the dishonest kind of table.
 */
function Cell({ v, highlight }: { v: string; highlight?: boolean }) {
  const base = highlight ? "bg-pitch-400/[0.05]" : "";
  if (v === "yes") {
    return (
      <td className={`px-3 py-3 text-center ${base}`}>
        <span className={highlight ? "font-bold text-pitch-400" : "text-slate-300"} aria-label="yes">✓</span>
      </td>
    );
  }
  if (v === "no") {
    return (
      <td className={`px-3 py-3 text-center ${base}`}>
        <span className="text-slate-600" aria-label="no">✕</span>
      </td>
    );
  }
  return (
    <td className={`px-3 py-3 text-center text-xs ${base} ${highlight ? "font-bold text-pitch-400" : "text-slate-400"}`}>
      {v}
    </td>
  );
}
