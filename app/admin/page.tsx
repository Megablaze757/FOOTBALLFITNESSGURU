"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { invokeAI } from "@/lib/api";
import { planFor } from "@/lib/subscription";
import type { Video } from "@/lib/types";

interface Metrics {
  total_users: number;
  subscribers: { silver: number; gold: number };
  dau: number;
  check_ins_today: number;
  videos_processing: number;
  videos_failed: number;
}

export default function AdminPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();

  const { data, loading } = useAsync(async () => {
    if (!user) return null;
    const supabase = createClient();
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return { forbidden: true as const };
    const [{ data: metrics }, { data: failed }] = await Promise.all([
      supabase.rpc("admin_metrics"),
      supabase.from("videos").select("*").eq("status", "failed").order("created_at", { ascending: false }).limit(10),
    ]);
    return { metrics: metrics as Metrics | null, failed: (failed ?? []) as Video[] };
  }, [user?.id]);

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
    if (data && "forbidden" in data) router.replace("/home");
  }, [sessionLoading, user, data, router]);

  if (sessionLoading || loading || !data || "forbidden" in data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
      </div>
    );
  }

  const m = data.metrics;
  const silver = m?.subscribers.silver ?? 0;
  const gold = m?.subscribers.gold ?? 0;
  const mrr = silver * planFor("silver").priceMonthly + gold * planFor("gold").priceMonthly;

  return (
    <main className="mx-auto max-w-3xl animate-fade-up px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-400">Back-office metrics.</p>
        </div>
        <Link href="/home" className="text-sm text-slate-400 hover:text-pitch-400">← App</Link>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="MRR" value={`$${mrr}`} accent />
        <Metric label="Paid subs" value={`${silver + gold}`} />
        <Metric label="DAU" value={`${m?.dau ?? 0}`} />
        <Metric label="Total users" value={`${m?.total_users ?? 0}`} />
        <Metric label="Silver" value={`${silver}`} />
        <Metric label="Gold" value={`${gold}`} />
        <Metric label="Videos processing" value={`${m?.videos_processing ?? 0}`} />
        <Metric label="Videos failed" value={`${m?.videos_failed ?? 0}`} />
      </section>

      <section className="mt-10">
        <CreateBetaAccount />
      </section>

      <section className="mt-10">
        <h2 className="field-label mb-3">Failed video jobs</h2>
        {!data.failed.length ? (
          <p className="card px-4 py-6 text-center text-sm text-slate-500">No failed jobs. 🎉</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 pt-3 pb-2">Video</th><th className="px-4 pt-3 pb-2">User</th><th className="px-4 pt-3 pb-2">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.failed.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{v.id.slice(0, 8)}…</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{v.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-2 text-slate-400">{v.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function randomPassword() {
  return "Apex-" + Math.random().toString(36).slice(2, 8);
}

function CreateBetaAccount() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [role, setRole] = useState("athlete");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null); setResult(null);
    try {
      await invokeAI<{ ok?: boolean; error?: string }>("admin-create-user", { email: email.trim(), password, full_name: name.trim(), role });
      setResult(`✅ Created ${email} — password: ${password} (share these, they can change it later).`);
      setEmail(""); setName(""); setPassword(randomPassword());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed. Is the Worker deployed with the service-role key?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="field-label mb-1">Create beta account</h2>
      <p className="mb-3 text-xs text-slate-400">Instantly provision a tester (email is auto-confirmed — they can sign in right away).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tester@email.com" type="email" />
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name (optional)" />
        <input className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temp password" />
        <select className="field [color-scheme:dark]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button onClick={create} disabled={busy || !email.trim() || password.length < 6} className="btn-primary mt-3">
        {busy ? "Creating…" : "Create account"}
      </button>
      {result && <p className="mt-2 break-words text-sm text-pitch-400">{result}</p>}
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "shadow-glow ring-1 ring-pitch-400/40" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ? "text-pitch-400" : "text-slate-100"}`}>{value}</div>
    </div>
  );
}
