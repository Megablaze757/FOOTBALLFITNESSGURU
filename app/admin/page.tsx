"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { planFor } from "@/lib/subscription";
import { costLines, monthlyMargin, totalMonthlyCost, unitEconomics } from "@/lib/costs";
import { AdminShell, AdminArea } from "@/components/admin/AdminShell";

interface Metrics {
  total_users: number;
  subscribers: { silver: number; gold: number; comped: number };
  dau: number;
  check_ins_today: number;
  videos_processing: number;
  videos_failed: number;
}

interface Costs {
  ai_spend_usd: number;
  ai_calls: number;
  paid_subs: number;
  videos_this_month: number;
  emails_sent: number;
  commission_month_pennies: number;
  commission_owed_pennies: number;
  active_users: number;
}

/**
 * The one screen to open first.
 *
 * It answers three questions and stops: is the business making or losing money,
 * who are the users, and is anything on fire. Everything that used to sit below
 * it — the funnel, affiliates, the full user table, failed jobs — moved to its
 * own tab, because a page that answers twelve questions answers none of them
 * quickly.
 */
export default function AdminOverview() {
  const { data } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: metrics }, { data: costs }, { data: breakdown }] = await Promise.all([
      supabase.rpc("admin_metrics"),
      supabase.rpc("admin_costs"),
      supabase.rpc("admin_user_breakdown"),
    ]);
    const c = Array.isArray(costs) ? costs[0] : costs;
    return {
      // PostgREST hands back an array for set-returning functions and a bare
      // value for scalar ones, and an empty array when a function is missing or
      // returns nothing. Normalised here so the render never has to care —
      // `[] as Metrics` is truthy, which is how this page white-screened: the
      // guard `m?.subscribers.silver` only protects `m`, so a truthy value with
      // no `subscribers` threw straight past it into the error boundary.
      metrics: (Array.isArray(metrics) ? metrics[0] : metrics) as Metrics | null,
      // Null when 0080 has not been applied yet. Kept as null rather than
      // defaulted to zeros — "no data" and "zero cost" are different claims and
      // the second one would be a lie.
      costs: (c ?? null) as Costs | null,
      breakdown: (breakdown ?? []) as { dimension: string; label: string; people: number }[],
    };
  }, []);

  const m = data?.metrics;
  const silver = m?.subscribers?.silver ?? 0;
  const gold = m?.subscribers?.gold ?? 0;
  const comped = m?.subscribers?.comped ?? 0;
  const mrr = silver * planFor("silver").priceMonthly + gold * planFor("gold").priceMonthly;

  const usage = {
    aiSpendUsd: Number(data?.costs?.ai_spend_usd ?? 0),
    paidSubs: data?.costs?.paid_subs ?? silver + gold,
    mrr,
    // Pennies at the source, because money in floating point loses a penny and
    // then the ledger stops reconciling. Converted once, here, at the edge.
    commissionGbp: (data?.costs?.commission_month_pennies ?? 0) / 100,
    activeUsers: data?.costs?.active_users ?? 0,
  };
  const cost = totalMonthlyCost(usage);
  const { commission, net, profit, breakEvenSubs } = monthlyMargin(usage);
  const unit = unitEconomics(usage);
  const owed = (data?.costs?.commission_owed_pennies ?? 0) / 100;

  const dim = (name: string) =>
    (data?.breakdown ?? []).filter((b) => b.dimension === name).sort((a, b) => b.people - a.people);

  return (
    <AdminShell title="Overview" note="Money, people, and anything on fire.">
      {/* ONE NUMBER FIRST. Nine tiles of identical weight is a list, not a
          dashboard — you read all nine every time to find the one you came for. */}
      <section className="mb-9">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* GROSS, THEN WHAT ACTUALLY LANDS. Commission used to be buried in
              the cost stack, which made £500 billed with £50 paid away read as
              "£500 of income and a £50 expense". It is not — it is £450 of
              income, and the gap is the number that grows with affiliate sales
              rather than with usage. The headline is what you charged; the line
              under it is what you keep. */}
          <div className="card p-5 shadow-glow ring-1 ring-pitch-400/40">
            <div className="stat-label">Monthly recurring revenue</div>
            <div className="mt-0.5 text-4xl font-extrabold tracking-tight text-pitch-400">£{mrr}</div>
            {commission > 0 && (
              <div className="mt-1 text-sm text-slate-400">
                −£{commission.toFixed(2)} to affiliates ·{" "}
                <b className="text-slate-200">£{net.toFixed(2)} actually yours</b>
              </div>
            )}
            <div className="mt-2 text-sm text-slate-400">
              <b className="text-slate-200">{silver + gold}</b> paying · {silver} silver, {gold} gold
              {comped > 0 && (
                // Outside the revenue figure and said so. A comped tester counted
                // as a customer is how a dashboard reports money nobody paid.
                <span className="block text-slate-500">{comped} comped, not counted as revenue</span>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="stat-label">Running costs</div>
            <div className="mt-0.5 text-4xl font-extrabold tracking-tight text-slate-100">
              {data?.costs ? `£${cost.toFixed(2)}` : "—"}
            </div>
            <div className={`mt-2 text-sm font-semibold ${profit >= 0 ? "text-pitch-400" : "text-readiness-red"}`}>
              {!data?.costs ? (
                <span className="font-normal text-slate-500">Run migration 0080 to see this</span>
              ) : profit >= 0 ? (
                <>£{profit.toFixed(2)} profit a month</>
              ) : (
                <>
                  £{Math.abs(profit).toFixed(2)} a month short
                  {breakEvenSubs > 0 && (
                    <span className="block font-normal text-slate-500">
                      Break even at {breakEvenSubs} subscription{breakEvenSubs === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Metric label="Active today" value={m?.dau ?? 0} />
          <Metric label="Check-ins" value={m?.check_ins_today ?? 0} />
          <Metric label="Total users" value={m?.total_users ?? 0} />
        </div>

        {/* Only shown when there is something to say. A permanent "0 failed"
            row is noise that trains you to stop reading the section. */}
        {((m?.videos_failed ?? 0) > 0 || (m?.videos_processing ?? 0) > 0) && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-400">
            {m?.videos_processing ?? 0} video{(m?.videos_processing ?? 0) === 1 ? "" : "s"} processing
            {(m?.videos_failed ?? 0) > 0 && (
              <>
                {" · "}
                <span className="text-readiness-red">{m?.videos_failed} failed</span>
              </>
            )}
          </p>
        )}
      </section>

      {data?.costs && (
        <AdminArea title="Where the money goes" note="Per month, in pounds">
          <div className="card divide-y divide-white/[0.06] overflow-hidden">
            {costLines(usage).map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-slate-200">{l.label}</span>
                  {/* MEASURED vs ESTIMATED, said out loud on every row. Only AI
                      spend is real — the app records cost per call. Presenting a
                      guess with the same authority as a measurement is how a
                      cost report starts lying. */}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      l.basis === "measured" ? "bg-pitch-400/15 text-pitch-400" : "bg-white/[0.06] text-slate-500"
                    }`}
                  >
                    {l.basis}
                  </span>
                  <span className="block text-xs leading-snug text-slate-500">{l.note}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-100">
                  £{l.monthly.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 bg-white/[0.02] px-4 py-3">
              <span className="text-sm font-bold text-slate-100">Total</span>
              <span className="text-sm font-extrabold tabular-nums text-slate-100">£{cost.toFixed(2)}</span>
            </div>
          </div>

          {/* THE WHOLE STORY IN FOUR ROWS, because a cost list on its own does
              not tell you whether you are making money. Commission sits here
              rather than in the list above: it is revenue that never arrived,
              not something the business bought. */}
          <div className="card mt-3 divide-y divide-white/[0.06] overflow-hidden">
            <Waterfall label="Billed" value={mrr} note="Gross MRR" />
            <Waterfall label="To affiliates" value={-commission} note="Commission earned this month" />
            <Waterfall label="Actually yours" value={net} note="What lands before costs" strong />
            <Waterfall label="Running costs" value={-cost} note="Platform, AI and Stripe" />
            <Waterfall label={profit >= 0 ? "Profit" : "Shortfall"} value={profit} note="Per month" strong />
          </div>

          <p className="text-xs text-slate-500">
            Subscription prices come from published rates in <code>lib/costs.ts</code> — edit that file if
            a plan changes. AI spend is the only figure read from real usage. Affiliate commission is
            deducted from revenue rather than listed as a cost: billing £100 and paying £10 away is
            £90 of income, not £100 with an expense.
          </p>
        </AdminArea>
      )}

      {data?.costs && usage.paidSubs > 0 && (
        <AdminArea
          title="Per customer"
          note="What one more subscriber is actually worth"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Revenue each" value={`£${unit.arpu.toFixed(2)}`} note="Average paid" />
            <Figure label="Their costs" value={`£${unit.variableCostPerSub.toFixed(2)}`} note="Stripe, commission, AI" />
            {/* THE DECISION NUMBER. Average cost per customer includes the
                platform bill, which is paid whether you have one customer or a
                thousand — so it says nothing about whether the NEXT one is worth
                having. Contribution does, and it is what to weigh against
                whatever winning a customer costs. */}
            <Figure
              label="You keep"
              value={`£${unit.contributionPerSub.toFixed(2)}`}
              note="Each extra subscriber"
              accent
            />
            <Figure label="Gross margin" value={`${unit.grossMarginPct}%`} note="Of revenue" />
          </div>
          <p className="text-xs text-slate-500">
            &ldquo;You keep&rdquo; excludes the fixed platform bill on purpose — that is paid whether
            you have one customer or a thousand, so it does not change what the next one is worth.
            Spending more than £{unit.contributionPerSub.toFixed(2)} to win a subscriber loses money
            in month one.
            {unit.costPerActiveUser > 0 && (
              <> Everything costs £{unit.costPerActiveUser.toFixed(2)} per active user a month.</>
            )}
          </p>
          {owed > 0 && (
            // A liability, not this month's cost — kept out of the profit figure
            // so it cannot be counted twice.
            <p className="text-xs text-slate-500">
              £{owed.toFixed(2)} of commission is earned but unpaid. Not in the figures above; it
              leaves when you pay it.
            </p>
          )}
        </AdminArea>
      )}

      {(data?.breakdown.length ?? 0) > 0 && (
        <AdminArea title="Who the users are" note="Testers excluded throughout">
          <div className="grid gap-4 sm:grid-cols-3">
            <Breakdown title="Sport" rows={dim("sport")} />
            <Breakdown title="Plan" rows={dim("plan")} />
            <Breakdown title="Life signs" rows={dim("activity")} />
          </div>
        </AdminArea>
      )}
    </AdminShell>
  );
}

function Figure({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className={`card p-3 ${accent ? "ring-1 ring-pitch-400/40" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className={`mt-0.5 text-xl font-extrabold ${accent ? "text-pitch-400" : "text-slate-100"}`}>{value}</div>
      <div className="text-[11px] leading-tight text-slate-500">{note}</div>
    </div>
  );
}

/**
 * One row of the revenue-to-profit waterfall.
 *
 * Negatives are shown with a real minus sign rather than red-and-positive: a
 * column of unsigned numbers where some are additions and some are subtractions
 * cannot be checked by adding it up, which is the only thing a waterfall is for.
 */
function Waterfall({ label, value, note, strong }: {
  label: string; value: number; note: string; strong?: boolean;
}) {
  const negative = value < 0;
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-3 ${strong ? "bg-white/[0.02]" : ""}`}>
      <span className="min-w-0">
        <span className={`text-sm ${strong ? "font-bold text-slate-100" : "font-semibold text-slate-200"}`}>{label}</span>
        <span className="block text-xs leading-snug text-slate-500">{note}</span>
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "text-sm font-extrabold" : "text-sm font-bold"} ${
          strong && value < 0 ? "text-readiness-red" : negative ? "text-slate-400" : "text-slate-100"
        }`}
      >
        {negative ? "−" : ""}£{Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-slate-100">{value}</div>
    </div>
  );
}

/**
 * A dimension, biggest first, with a bar for shape.
 *
 * Percentages are of the people in THIS dimension rather than of all users, so
 * each column adds to 100% on its own. Mixing the two is how a breakdown starts
 * implying overlaps that do not exist.
 */
function Breakdown({ title, rows }: { title: string; rows: { label: string; people: number }[] }) {
  const total = rows.reduce((n, r) => n + r.people, 0);
  return (
    <div className="card p-4">
      <div className="stat-label mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate capitalize text-slate-300">{r.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-100">{r.people}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-pitch-400/70"
                  style={{ width: `${total > 0 ? Math.max(2, Math.round((r.people / total) * 100)) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
