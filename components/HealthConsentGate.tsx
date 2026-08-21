"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HEALTH_CONSENT_VERSION } from "@/lib/consent";

/**
 * Health, injury and body-composition data is the service's raw material, not a
 * harmless account preference. Existing accounts predate recorded consent, so
 * they receive the same separate choice as a new signup before personalised
 * processing resumes. Profile remains reachable so consent can be withdrawn
 * and an account can still be deleted.
 */
export function HealthConsentGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "consented" | "needed" | "error">("loading");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void createClient().from("profiles").select("health_data_consent_at").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setStatus(error ? "error" : data?.health_data_consent_at ? "consented" : "needed");
      });
    return () => { active = false; };
  }, [userId, pathname]);

  // Profile is the withdrawal and account-deletion route. Never trap someone
  // outside the one page that lets them say no and leave.
  if (pathname.endsWith("/profile")) return children;
  if (status === "consented") return children;
  if (status === "loading") {
    return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" /></div>;
  }

  async function recordConsent() {
    if (!agreed) return;
    setSaving(true);
    const { error } = await createClient().from("profiles").update({
      health_data_consent_at: new Date().toISOString(),
      health_data_consent_version: HEALTH_CONSENT_VERSION,
    }).eq("id", userId);
    setSaving(false);
    setStatus(error ? "error" : "consented");
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
      <section className="card w-full p-6">
        <div className="text-3xl" aria-hidden>🔐</div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Your health data, your choice</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          PocketAthlete uses the health and fitness information you choose to enter — including
          pain, injury, sleep, fatigue, weight, body composition, nutrition and training history —
          to calculate readiness and personalise training, recovery and food guidance.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Some coach questions send the relevant details to our named AI providers. We do not sell
          this data or use it for advertising. Read the <Link href="/privacy" className="text-pitch-400 underline">privacy policy</Link>.
        </p>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-pitch-500" />
          <span className="text-sm text-slate-200">
            I explicitly consent to PocketAthlete processing this health data for those purposes.
          </span>
        </label>
        {status === "error" && <p className="mt-3 text-sm text-readiness-red">We couldn&apos;t save or check this choice. Nothing has been accepted — try again.</p>}
        <button onClick={recordConsent} disabled={!agreed || saving} className="btn-primary mt-4">
          {saving ? "Saving…" : "Save my choice and continue"}
        </button>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
          <Link href="/profile" className="hover:text-slate-300">Manage or delete my account</Link>
          <button onClick={signOut} className="hover:text-slate-300">Sign out</button>
        </div>
      </section>
    </main>
  );
}
