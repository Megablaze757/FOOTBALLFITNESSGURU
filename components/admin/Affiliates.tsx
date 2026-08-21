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
  /** Which affiliate's email is being edited, and the value so far. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");

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

  /**
   * ATTACH OR CHANGE AN EMAIL AFTER THE FACT.
   *
   * The email is how an affiliate reaches their own dashboard — it is matched
   * against the address on their account and then claimed permanently — so a
   * row created without one is a partner who can never see what they have
   * earned. Several were, before the dashboard existed, and there was no way to
   * fix it short of a SQL console.
   *
   * Editing rather than delete-and-recreate, because the code is what every
   * referral and every commission row points at: recreating it would orphan
   * their entire history to fix a missing email address.
   */
  async function saveEmail(affCode: string, next: string) {
    setBusy(true); setError(null);
    const value = next.trim();
    const { error } = await createClient()
      .from("affiliates")
      .update({ email: value || null })
      .eq("code", affCode);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setEditing(null);
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
                    {editing === r.code ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          className="field min-h-0 w-44 py-1 text-xs"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="their@email.com"
                          type="email"
                          autoFocus
                        />
                        <button
                          disabled={busy}
                          onClick={() => saveEmail(r.code, editEmail)}
                          className="chip shrink-0 text-pitch-400 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="tap-target shrink-0 px-1 text-xs text-slate-500 hover:text-slate-300"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditing(r.code); setEditEmail(r.email ?? ""); }}
                        className="min-h-[44px] mt-0.5 text-left text-xs text-slate-500 hover:text-pitch-400"
                      >
                        {/* AN AFFILIATE WITH NO EMAIL CANNOT SEE THEIR OWN
                            DASHBOARD, so the gap is called out rather than
                            rendered as an empty space nobody notices. */}
                        {r.email ?? <span className="text-amber-400">no email — can&apos;t use the dashboard</span>}
                      </button>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-300">{r.code}</td>
                  <td className="py-2 text-right text-slate-300">{r.waitlist}</td>
                  <td className="py-2 text-right font-bold text-slate-100">{r.signups}</td>
                  <td className="py-2 text-right font-bold text-pitch-400">{r.paid}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => copy(r.code, "waitlist")} className="tap-target whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
                        {copied === `${r.code}:waitlist` ? "Copied ✓" : "Waitlist link"}
                      </button>
                      <button onClick={() => copy(r.code, "site")} className="tap-target whitespace-nowrap text-xs text-slate-400 hover:text-pitch-400">
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
