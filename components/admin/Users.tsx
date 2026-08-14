"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { useState } from "react";

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
  gold: "text-pitch-400",
  silver: "text-slate-200",
  bronze: "text-slate-500",
};

/** Everyone on the app: plan, beta status, and who referred them. */

export function Users() {
  const [filter, setFilter] = useState<"all" | "beta" | "paid" | "free">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await createClient().rpc("admin_users");
    if (error) throw error;
    return (data ?? []) as AdminUser[];
  }, [], "admin-users");

  async function act(id: string, run: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(id);
    const { error } = await run();
    setBusy(null);
    // Surface the database's own refusal — "you cannot suspend your own
    // account" is more useful than a generic failure.
    setNote(error ? error.message : done);
    setTimeout(() => setNote(null), 5000);
    if (!error) reload();
  }

  const suspend = (u: AdminUser) =>
    act(u.user_id,
      () => createClient().rpc("admin_set_suspended", {
        p_user: u.user_id, p_suspended: !u.suspended_at, p_reason: null,
      }),
      u.suspended_at
        ? `${u.email} restored — they can sign in again.`
        : `${u.email} deactivated. Any comped access has been revoked.`);

  const toggleComped = (u: AdminUser) =>
    act(u.user_id,
      () => createClient().rpc("admin_set_comped", { p_user: u.user_id, p_on: !u.comped }),
      u.comped ? `Pro removed from ${u.email}.` : `${u.email} now has comped Pro.`);

  const rows = data ?? [];
  const paid = rows.filter((r) => r.tier !== "bronze");
  const shown = rows.filter((r) =>
    filter === "all" ? true
      : filter === "beta" ? r.beta
      : filter === "paid" ? r.tier !== "bronze"
      : r.tier === "bronze" && !r.beta
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="field-label !mb-0">👥 Users · {rows.length}</h2>
        <span className="text-xs text-slate-400">
          {rows.filter((r) => r.beta).length} beta · {paid.length} paid
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", "beta", "paid", "free"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f ? "border-pitch-400/40 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error ? (
        <p className="card px-4 py-6 text-center text-sm text-readiness-red">
          Couldn&apos;t load users — has migration 0034 been applied?
        </p>
      ) : loading ? (
        <div className="card h-24 animate-pulse" />
      ) : !shown.length ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-500">No users match that filter.</p>
      ) : (
        <div className="card max-h-[28rem] overflow-auto">
          {/* Six columns don't fit a phone; scroll the table, not the page. */}
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="sticky top-0 bg-ink-800/95 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 pt-3 pb-2">User</th>
                <th className="px-4 pt-3 pb-2">Plan</th>
                <th className="px-4 pt-3 pb-2">Referred by</th>
                <th className="px-4 pt-3 pb-2">Joined</th>
                <th className="px-4 pt-3 pb-2">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((u) => (
                <tr key={u.user_id} className={u.suspended_at ? "opacity-50" : ""}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-slate-200">{u.email}</span>
                      {u.suspended_at && <span className="chip shrink-0 text-readiness-red">deactivated</span>}
                      {u.beta && <span className="chip shrink-0 text-pitch-400">beta</span>}
                      {u.role !== "athlete" && <span className="chip shrink-0 text-slate-400">{u.role}</span>}
                    </div>
                    {u.full_name && <div className="text-xs text-slate-500">{u.full_name}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`font-semibold capitalize ${TIER_STYLE[u.tier] ?? "text-slate-400"}`}>{u.tier}</span>
                    {/* past_due and cancelled both still read as their tier in
                        the DB, so the status is what tells you it's not money. */}
                    {u.tier !== "bronze" && u.status !== "active" && (
                      <span className="block text-xs text-readiness-red">{u.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.affiliate_name
                      ? <span className="text-slate-300">{u.affiliate_name}</span>
                      : u.referral_code
                        ? <span className="text-slate-400" title="Code has no matching affiliate">{u.referral_code}</span>
                        : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{u.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-400">{u.last_sign_in_at?.slice(0, 10) ?? "never"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {/* Only offered for COMPED access. A real Stripe
                          subscription has to be changed in Stripe — quietly
                          cutting off someone who is still being billed is the
                          worst thing this panel could do. */}
                      {(u.comped || u.tier === "bronze") && !u.suspended_at && (
                        <button
                          onClick={() => toggleComped(u)}
                          disabled={busy === u.user_id}
                          className="tap-target rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 disabled:opacity-40"
                        >
                          {u.comped ? "Remove Pro" : "Give Pro"}
                        </button>
                      )}
                      <button
                        onClick={() => suspend(u)}
                        disabled={busy === u.user_id}
                        className={`tap-target rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                          u.suspended_at
                            ? "border-readiness-green/40 text-readiness-green"
                            : "border-readiness-red/40 text-readiness-red"
                        }`}
                      >
                        {u.suspended_at ? "Restore" : "Deactivate"}
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
  );
}

export function randomPassword() {
  return "GURU-" + Math.random().toString(36).slice(2, 8);
}

interface AffiliateStat { code: string; name: string; email: string | null; signups: number; paid: number; waitlist: number }
