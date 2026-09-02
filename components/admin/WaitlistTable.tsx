"use client";

import { useState } from "react";

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <div className="text-lg font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

export function Waitlist({ rows }: { rows: { email: string; source: string | null; created_at: string }[] }) {
  const [copied, setCopied] = useState(false);
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join(", "));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="field-label !mb-0">📧 Email waitlist · {rows.length}</h2>
        {rows.length > 0 && (
          <button onClick={copyEmails} className="tap-target text-xs font-semibold text-accent-400 hover:underline">
            {copied ? "Copied ✓" : "Copy all emails"}
          </button>
        )}
      </div>
      {!rows.length ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">No signups yet. Share pocketathlete.com/waitlist.</p>
      ) : (
        <div className="card max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-raised/95 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 pt-3 pb-2">Email</th><th className="px-4 pt-3 pb-2">Via</th><th className="px-4 pt-3 pb-2">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-2 text-slate-200">{r.email}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.source || "—"}</td>
                  <td className="px-4 py-2 text-slate-400">{r.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AdminUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  beta: boolean;
  tier: string;
  status: string;
  referral_code: string | null;
  affiliate_name: string | null;
  created_at: string;
  suspended_at: string | null;
  comped: boolean;
  last_sign_in_at: string | null;
}

const TIER_STYLE: Record<string, string> = {
  gold: "text-accent-400",
  silver: "text-slate-200",
  bronze: "text-slate-500",
};

/** Everyone on the app: plan, beta status, and who referred them. */
