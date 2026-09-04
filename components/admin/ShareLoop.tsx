"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { referralLink } from "@/lib/referral";
import { athleteShareLink } from "@/lib/share-card";
import { loopStats, loopWarning, type SourceCount } from "@/lib/share-loop";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY MARKETING THAT SCALES WITHOUT SPEND.
 *
 * Everything else on this page is the account posting. This is the athletes
 * posting, which is the only channel that grows with the product rather than
 * with the hours put into it.
 *
 * IT USED TO COUNT THE WRONG THING. "Links issued" was read off the affiliates
 * table, and the empty state said as much: "the plain address for most
 * athletes, their own for anyone with an affiliate row". True when written, and
 * false since migration 0107 made every username a code that resolves. Almost
 * nobody is an affiliate; almost everybody has a username. So the one screen
 * meant to answer "is the loop working" was ignoring nearly all of it.
 *
 * The maths is in lib/share-loop.ts — the interesting part is telling a paid
 * referral from a free one, and this is a grid of numbers.
 * ═══════════════════════════════════════════════════════════════════════════
 */
interface Affiliate { code: string; name: string; user_id: string | null }
interface ProfileRow { referral_code: string | null; username: string | null; public_profile: boolean | null }

export function ShareLoop() {
  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: affiliates, error: affErr }, { data: profiles }, { count: total }] = await Promise.all([
      supabase.from("affiliates").select("code, name, user_id").order("created_at", { ascending: false }).limit(500),
      // ONE QUERY, THREE COLUMNS. The old version fetched referral_code alone,
      // which is why usernames — most of the loop — were invisible to it.
      supabase.from("profiles").select("referral_code, username, public_profile").limit(5000),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    return {
      affiliates: (affiliates ?? []) as Affiliate[],
      profiles: (profiles ?? []) as ProfileRow[],
      totalProfiles: total ?? 0,
      error: affErr?.message ?? null,
    };
  }, []);

  const stats = useMemo(() => loopStats({
    affiliateCodes: (data?.affiliates ?? []).map((a) => a.code),
    usernames: (data?.profiles ?? []).map((p) => p.username ?? "").filter(Boolean),
    attributed: (data?.profiles ?? []).map((p) => p.referral_code ?? "").filter(Boolean),
    totalProfiles: data?.totalProfiles ?? 0,
    publicProfiles: (data?.profiles ?? []).filter((p) => p.public_profile).length,
  }), [data]);

  if (loading) return <p className="py-2 text-center text-sm text-slate-500">Loading…</p>;
  if (data?.error) {
    return <p className="text-sm text-readiness-yellow">Cannot read affiliates: {data.error}</p>;
  }

  const warning = loopWarning(stats);
  const nameFor = (code: string) =>
    data!.affiliates.find((a) => a.code.toLowerCase() === code)?.name ?? `@${code}`;

  return (
    <div className="space-y-4">
      {/* WHO COULD SHARE, split by what a share from them costs. An affiliate
          creates a commission line; a username creates nothing, which makes it
          the only channel here with a marginal cost of zero. */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Athletes with a link" value={stats.canShare.athletes} note="a username IS a code" />
        <Stat label="With a public page" value={stats.canShare.withPage} note="the strongest share target" />
        <Stat label="Affiliates" value={stats.canShare.affiliates} note="these earn commission" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Free signups" value={stats.signups.athlete} note="via an athlete, no payout" />
        <Stat label="Paid signups" value={stats.signups.affiliate} note="via an affiliate" />
        <Stat label="Attributed" value={stats.signups.total} note={`${stats.sharePct}% of all`} />
      </div>

      {warning && (
        <p className="rounded-2xl border border-readiness-yellow/25 bg-readiness-yellow/[0.04] p-3 text-sm text-slate-300">
          {warning}
        </p>
      )}

      {stats.sources.length > 0 ? (
        <div>
          <span className="field-label">Where signups came from</span>
          <ul className="mt-2 space-y-1">
            {stats.sources.slice(0, 12).map((source) => (
              <li
                key={source.code}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-slate-100">{nameFor(source.code)}</span>
                  <span className="ml-2 text-xs text-slate-500">{linkFor(source)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`chip ${source.kind === "affiliate" ? "text-accent-400" : ""}`}>
                    {LABEL[source.kind]}
                  </span>
                  <span className="font-bold text-accent-400">{source.signups}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No signup has arrived with a code yet. Every athlete with a username already has a working
          link — the card carries their page if they have published one, and{" "}
          <code>?ref=username</code> if not.
        </p>
      )}
    </div>
  );
}

const LABEL: Record<SourceCount["kind"], string> = {
  affiliate: "affiliate",
  athlete: "athlete",
  unknown: "unmatched",
};

/** The address that code actually appears on, which differs by kind. */
function linkFor(source: SourceCount): string {
  if (source.kind === "athlete") return athleteShareLink(source.code, true) ?? source.code;
  return referralLink(source.code);
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="text-2xl font-extrabold text-slate-100">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{note}</div>
    </div>
  );
}
