"use client";

import { createClient } from "@/lib/supabase/client";
import { referralLink, waitlistLink } from "@/lib/referral";
import { useAsync } from "@/lib/use-async";
import { useState } from "react";

interface AffiliateStat { code: string; name: string; email: string | null; signups: number; paid: number; waitlist: number }

export function Affiliates() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const { data, error } = await createClient().rpc("affiliate_stats");
    if (error) throw error;
    return (data ?? []) as AffiliateStat[];
  }, []);

  const suggested = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  async function add() {
    const finalCode = (code.trim() || suggested);
    if (!name.trim() || !finalCode) return;
    setBusy(true); setError(null);
    const { error } = await createClient().from("affiliates").insert({
      name: name.trim(), email: email.trim() || null, code: finalCode,
    });
    setBusy(false);
    if (error) { setError(error.message.includes("duplicate") ? "That code is already taken." : error.message); return; }
    setName(""); setEmail(""); setCode("");
    reload();
  }

  // Two links per affiliate: the landing page, and straight to the waitlist for
  // pre-launch sharing. Both carry the same ?ref=, so attribution is identical.
  async function copy(c: string, kind: "site" | "waitlist") {
    try {
      await navigator.clipboard.writeText(kind === "waitlist" ? waitlistLink(c) : referralLink(c));
      setCopied(`${c}:${kind}`);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked */ }
  }

  const rows = data ?? [];
  const totalSignups = rows.reduce((n, r) => n + Number(r.signups), 0);
  const totalPaid = rows.reduce((n, r) => n + Number(r.paid), 0);
  const totalWaitlist = rows.reduce((n, r) => n + Number(r.waitlist ?? 0), 0);

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="field-label !mb-0">🤝 Affiliates</h2>
        <span className="text-xs text-slate-400">{totalWaitlist} waitlist · {totalSignups} signups · {totalPaid} paid</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">Give each partner a link — signups through it are attributed to them.</p>

      <div className="grid gap-2 sm:grid-cols-3">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Affiliate name" />
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" type="email" />
        <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggested || "code"} />
      </div>
      <button onClick={add} disabled={busy || !name.trim()} className="btn-primary mt-3">{busy ? "Adding…" : "Add affiliate"}</button>
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}

      <div className="mt-5">
        {loading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No affiliates yet.</p>
        ) : (
          // Six columns will not fit a phone. Scroll the table, not the page —
          // a body-level horizontal scroll breaks every other screen too.
          <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="pb-2">Affiliate</th><th className="pb-2">Code</th><th className="pb-2 text-right">Waitlist</th><th className="pb-2 text-right">Signups</th><th className="pb-2 text-right">Paid</th><th className="pb-2" /></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="py-2">
                    <div className="font-semibold text-slate-100">{r.name}</div>
                    {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-300">{r.code}</td>
                  <td className="py-2 text-right text-slate-300">{r.waitlist}</td>
                  <td className="py-2 text-right font-bold text-slate-100">{r.signups}</td>
                  <td className="py-2 text-right font-bold text-pitch-400">{r.paid}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => copy(r.code, "waitlist")} className="whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
                        {copied === `${r.code}:waitlist` ? "Copied ✓" : "Waitlist link"}
                      </button>
                      <button onClick={() => copy(r.code, "site")} className="whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
                        {copied === `${r.code}:site` ? "Copied ✓" : "Site link"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
