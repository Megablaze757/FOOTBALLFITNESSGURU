"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { useState } from "react";
import { todayLocal } from "@/lib/day";
import { callWorker, workerError } from "@/lib/admin-api";

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
  /**
   * The last day they actually put something in — see migration 0098.
   *
   * Optional because the column does not exist until that migration is applied,
   * and `undefined` has to stay distinguishable from `null`: one means we
   * cannot tell, the other means they have logged nothing.
   */
  last_logged_on?: string | null;
  /**
   * Billing, as three optional fields — see migration 0104.
   *
   * Optional for the same reason last_logged_on is: before that migration the
   * RPC returns no such columns, and `undefined` has to stay distinguishable
   * from `false`. "We cannot tell whether they have billing" must render as
   * nothing at all, never as a Cancel button that will 404.
   */
  has_billing?: boolean;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
}

/**
 * "3d ago", or "never".
 *
 * A bare date makes an admin do arithmetic on every row to answer the only
 * question the column is there for, which is how long it has been.
 */
function ago(day: string | null, today: string): string {
  if (!day) return "never";
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(days) || days < 0) return day;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

const TIER_STYLE: Record<string, string> = {
  gold: "text-pitch-400",
  silver: "text-slate-200",
  bronze: "text-slate-500",
};

/** Everyone on the app: plan, beta status, and who referred them. */

export function Users() {
  const today = todayLocal();
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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CANCELLING FOR SOMEBODY WHO ASKED.
   *
   * Goes through the Worker rather than the database, because the thing that
   * actually has to change is at Stripe. Writing `status: cancelled` here
   * would stop their access and keep taking their money, which is the worst
   * of both and the exact mistake this button exists to prevent.
   *
   * Period end by default. They paid for the month, so they keep the month,
   * and it stays undoable the whole time.
   * ═══════════════════════════════════════════════════════════════════════
   */
  async function billing(u: AdminUser, action: "cancel" | "cancel_now" | "resume") {
    const what =
      action === "resume" ? `Let ${u.email} keep their subscription?`
      : action === "cancel_now"
        // Named in full, because this is the irreversible one and a dialog
        // saying "are you sure?" tells nobody what they are agreeing to.
        ? `Cancel ${u.email} IMMEDIATELY?\n\nThey lose access now, this cannot be undone `
          + `from here, and no refund is issued — refund on the invoice in Stripe if you mean to.`
        : `Cancel ${u.email} at the end of the period they have paid for?\n\n`
          + `They keep access until then, and you can undo this until it ends.`;
    if (!window.confirm(what)) return;

    const reason = action === "resume" ? undefined
      : window.prompt("Reason (kept for the churn numbers, optional):") ?? undefined;

    setBusy(u.user_id);
    const res = await callWorker("/admin-subscription", { userId: u.user_id, action, reason });
    setBusy(null);

    if (!res.ok) {
      setNote(res.data.error === "no-billing-account"
        ? `${u.email} has no Stripe subscription — nothing to cancel. A comped account is removed with the Pro toggle.`
        : workerError(res, "That did not work. Check the Worker is deployed."));
    } else {
      const endsAt = typeof res.data.endsAt === "string" ? res.data.endsAt.slice(0, 10) : null;
      setNote(
        action === "resume" ? `${u.email} is no longer cancelling.`
        : action === "cancel_now" ? `${u.email} cancelled immediately. No refund was issued.`
        : `${u.email} cancels${endsAt ? ` on ${endsAt}` : " at the end of the period"}.`);
      reload();
    }
    setTimeout(() => setNote(null), 8000);
  }

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
            className={`min-h-[44px] rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
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
            <thead className="sticky top-0 bg-surface-raised/95 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 pt-3 pb-2">User</th>
                <th className="px-4 pt-3 pb-2">Plan</th>
                <th className="px-4 pt-3 pb-2">Referred by</th>
                <th className="px-4 pt-3 pb-2">Joined</th>
                {/* NOT "last seen", which was the last sign-in and counted a
                    session refresh. Somebody who has recorded nothing for six
                    weeks but whose phone keeps the session alive read as
                    active — the column an admin scans for "is this person
                    using it" was answering a different question convincingly.
                    This is the last day they put something in. */}
                <th className="px-4 pt-3 pb-2">Last logged</th>
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
                  <td className="px-4 py-2 text-slate-400">
                    {/* UNDEFINED IS NOT NULL. Before migration 0098 the RPC has
                        no such column, and rendering that as "never" would tell
                        an admin their whole user base had stopped using the app.
                        Absent means fall back and say so; null means they really
                        have logged nothing. */}
                    {u.last_logged_on === undefined ? (
                      <span title="Run migration 0098 to see when they last logged something">
                        {u.last_sign_in_at?.slice(0, 10) ?? "never"}
                        <span className="block text-xs text-slate-600">sign-in · needs 0098</span>
                      </span>
                    ) : (
                    <>
                    <span className={u.last_logged_on ? "" : "text-slate-600"}>{ago(u.last_logged_on, today)}</span>
                    {/* Signing in and never recording anything is its own
                        story, and the one the old column could not tell apart
                        from using the app. Worth a second line, not a column. */}
                    {!u.last_logged_on && u.last_sign_in_at && (
                      <span className="block text-xs text-slate-600">signed in {ago(u.last_sign_in_at.slice(0, 10), today)}</span>
                    )}
                    </>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {/* ═════════════════════════════════════════════════
                          BILLING, WHEN THERE IS ACTUALLY BILLING.

                          Shown only when the RPC says there is a Stripe
                          subscription behind this row. `undefined` means the
                          0104 migration has not been applied and we cannot
                          tell — which renders nothing, rather than a button
                          that would 404.

                          It goes through the Worker, never the database:
                          quietly writing "cancelled" here would cut their
                          access off and keep taking their money, which is the
                          worst thing this panel could do.
                          ═════════════════════════════════════════════════ */}
                      {u.has_billing && !u.suspended_at && (
                        u.cancel_at_period_end ? (
                          <button
                            onClick={() => billing(u, "resume")}
                            disabled={busy === u.user_id}
                            title={u.current_period_end ? `Cancels ${u.current_period_end.slice(0, 10)}` : undefined}
                            className="tap-target rounded-lg border border-readiness-green/40 px-2 py-1 text-[11px] font-semibold text-readiness-green disabled:opacity-40"
                          >
                            Undo cancel
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => billing(u, "cancel")}
                              disabled={busy === u.user_id}
                              className="tap-target rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 disabled:opacity-40"
                            >
                              Cancel
                            </button>
                            {/* Deliberately quieter than the reversible one.
                                This is the button for fraud and chargebacks,
                                not for somebody who emailed asking to stop. */}
                            <button
                              onClick={() => billing(u, "cancel_now")}
                              disabled={busy === u.user_id}
                              title="Ends access immediately. Cannot be undone here, and issues no refund."
                              className="tap-target rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-readiness-red disabled:opacity-40"
                            >
                              now
                            </button>
                          </>
                        )
                      )}

                      {/* Only offered for COMPED access — access granted
                          without Stripe, which is the only kind this toggle
                          can honestly revoke. A real subscription is cancelled
                          with the buttons above. */}
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
