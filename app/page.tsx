"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

const FEATURES = [
  { icon: "🩺", title: "Readiness engine", body: "A daily Green/Yellow/Red score from sleep, fatigue, soreness and a body pain map." },
  { icon: "🤖", title: "AI coach", body: "Biomechanist-grade insights that name your weak link and tell you exactly what to do." },
  { icon: "🎥", title: "Video biomechanics", body: "Upload a clip — pose tracking flags knee valgus, asymmetry and ground contact." },
  { icon: "📈", title: "Progress over time", body: "Training volume, drill PRs, nutrition and benchmarks — all trending, all in one place." },
];

export default function Landing() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [user, loading, router]);

  return (
    <main className="mx-auto max-w-md px-6 pb-16 pt-20">
      {/* Hero */}
      <div className="animate-fade-up text-center">
        <div className="chip mx-auto mb-6 text-pitch-400">⚡ Your edge, quantified</div>
        <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight">
          The <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">complete</span> athlete dashboard
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-slate-400">
          Recovery, readiness, biomechanics, nutrition and progress — coached by AI, in one place.
        </p>
        <div className="mt-8 space-y-3">
          <Link href="/login" className="btn-primary">Get started — it&apos;s free</Link>
          <Link href="/login" className="btn-ghost">I already have an account</Link>
        </div>
      </div>

      {/* Feature grid */}
      <div className="mt-14 grid gap-3">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="card animate-fade-up p-5" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="text-2xl">{f.icon}</div>
            <h3 className="mt-2 font-bold text-slate-100">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <div className="text-2xl font-extrabold">
          <span className="bg-gradient-to-br from-pitch-400 to-pitch-600 bg-clip-text text-transparent">Apex</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Train smarter. Recover faster. Peak on match day.</p>
      </div>
    </main>
  );
}
