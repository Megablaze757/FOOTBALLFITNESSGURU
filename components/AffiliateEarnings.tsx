"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import {
  poundsFromPennies, DEFAULT_RATES, MAX_LEVEL, MAX_TOTAL_PCT,
} from "@/lib/affiliate";

interface Earnings {
  affiliate_id: string;
  code: string;
  name: string;
  parent_code: string | null;
  rate_pct: string | number | null;
  active: boolean;
  referred_signups: number;
  paying_clients: number;
  pending_pennies: number;
  approved_pennies: number;
  paid_pennies: number;
  reversed_pennies: number;
}

/**
 * What each affiliate has earned, and what's ready to pay.
 *
 * Four states, and the distinction between the first two is the important one:
 * PENDING is earned but inside the 30-day refund window, APPROVED has cleared
 * it. Paying out pending commission means chasing money back when a customer
 * refunds, which is a conversation nobody wants to have.
 */
export function AffiliateEarnings() {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const { data, error } = await createClient().rpc("affiliate_earnings");
    if (error) throw error;
    return (data ?? []) as Earnings[];
  }, [], "affiliate-earnings");

  async function setRate(id: string, pct: string) {
    const n = pct.trim() === "" ? null : Number(pct);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) return;
    setBusy(id);
    await createClient().from("affiliates").update({ rate_pct: n }).eq("id", id);
    setBusy(null);
    reload();
  }

  async function toggleActive(id: string, next: boolean) {
    setBusy(id);
    await createClient().from("affiliates").update({ active: next }).eq("id", id);
    setBusy(null);
    reload();
  }

  async function markPaid(id: string, name: string) {
    setBusy(id);
    const { data: settled } = await createClient().rpc("mark_commissions_paid", { p_affiliate: id });
    setBusy(null);
    setNote(`Marked ${poundsFromPennies(Number(settled) || 0)} as paid to ${name}.`);
    setTimeout(() => setNote(null), 4000);
    reload();
  }

  if (loading) return <div className="card h-56 animate-pulse" />;
  const rows = data ?? [];

  const owed = rows.reduce((n, r) => n + r.approved_pennies, 0);
  const held = rows.reduce((n, r) => n + r.pending_pennies, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="field-label !mb-0">💸 Commission</h2>
        <span className="text-sm">
          <b className="text-pitch-400">{poundsFromPennies(owed)}</b>
          <span className="text-slate-400"> ready to pay · {poundsFromPennies(held)} still held</span>
        </span>
      </div>

      {note && <p className="mb-3 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.05] px-4 py-2.5 text-sm text-slate-200">{note}</p>}

      {!rows.length ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-400">
          No affiliates yet. Add one above and share their link.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const rate = r.rate_pct === null ? "" : String(Number(r.rate_pct));
            return (
              <div key={r.affiliate_id} className={`card p-4 ${r.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{r.name}</span>
                      <span className="chip">{r.code}</span>
                      {r.parent_code && <span className="chip text-slate-400">under {r.parent_code}</span>}
                      {!r.active && <span className="chip text-readiness-red">paused</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {r.referred_signups} signup{r.referred_signups === 1 ? "" : "s"} · {r.paying_clients} paying
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-extrabold text-pitch-400">{poundsFromPennies(r.approved_pennies)}</div>
                    <div className="text-[11px] text-slate-400">ready to pay</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Held" value={poundsFromPennies(r.pending_pennies)} hint="in the refund window" />
                  <Stat label="Paid" value={poundsFromPennies(r.paid_pennies)} />
                  <Stat label="Reversed" value={poundsFromPennies(r.reversed_pennies)} hint="refunded" />
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="field-label">Their rate</span>
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={rate}
                        onBlur={(e) => e.target.value !== rate && setRate(r.affiliate_id, e.target.value)}
                        placeholder={String(DEFAULT_RATES[1])}
                        inputMode="decimal"
                        className="field w-24"
                      />
                      <span className="text-sm text-slate-400">%</span>
                    </div>
                  </label>
                  <button
                    onClick={() => toggleActive(r.affiliate_id, !r.active)}
                    disabled={busy === r.affiliate_id}
                    className="tap-target rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
                  >
                    {r.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => markPaid(r.affiliate_id, r.name)}
                    disabled={busy === r.affiliate_id || r.approved_pennies <= 0}
                    className="tap-target rounded-xl bg-pitch-500 px-3 py-2 text-xs font-semibold text-ink-900 disabled:opacity-40"
                  >
                    Mark {poundsFromPennies(r.approved_pennies)} paid
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
        <p>
          <b className="text-slate-200">How it works.</b> Commission is earned only when a
          customer&apos;s payment succeeds, calculated on what landed after Stripe&apos;s fee.
          The direct referrer gets their own rate (default {DEFAULT_RATES[1]}%); whoever recruited
          them gets {DEFAULT_RATES[2]}%. It stops at {MAX_LEVEL} levels and can never total more
          than {MAX_TOTAL_PCT}% of a payment.
        </p>
        <p className="mt-2">
          Nothing is payable for 30 days. Refunds and chargebacks reverse it automatically —
          which is only harmless while it&apos;s still held, so pay from the
          <b className="text-slate-200"> ready to pay</b> figure and never the held one.
        </p>
        <p className="mt-2">
          <b className="text-slate-200">Marking paid records it, it doesn&apos;t send money.</b>{" "}
          Transfer separately, then mark it here.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <div className="text-sm font-bold text-slate-200">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}
