"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { referralLink } from "@/lib/referral";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY MARKETING THAT SCALES WITHOUT SPEND.
 *
 * Everything else on this page is the account posting. This is the athletes
 * posting, which is the only channel that grows with the product rather than
 * with the hours put into it — and it was invisible: there was no screen that
 * said how many people can share with attribution, or whether any of it works.
 *
 * Two numbers matter and both are here. How many athletes have a link at all,
 * because an athlete without one shares a dead end. And how many signups
 * arrived carrying a code, because that is the loop closing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
interface Row { code: string; name: string; user_id: string | null }

export function ShareLoop() {
  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: affiliates, error: affErr }, { data: attributed }, { count: total }] = await Promise.all([
      supabase.from("affiliates").select("code, name, user_id").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("referral_code").not("referral_code", "is", null).limit(2000),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    return {
      affiliates: (affiliates ?? []) as Row[],
      codes: ((attributed ?? []) as { referral_code: string | null }[])
        .map((p) => p.referral_code).filter((c): c is string => !!c),
      totalProfiles: total ?? 0,
      error: affErr?.message ?? null,
    };
  }, []);

  const byCode = useMemo(() => {
    const c = new Map<string, number>();
    for (const code of data?.codes ?? []) c.set(code, (c.get(code) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]);
  }, [data?.codes]);

  if (loading) return <p className="py-2 text-center text-sm text-slate-500">Loading…</p>;
  if (data?.error) {
    return <p className="text-sm text-readiness-yellow">Cannot read affiliates: {data.error}</p>;
  }

  const withUser = data!.affiliates.filter((a) => a.user_id).length;
  const attributedCount = data!.codes.length;
  const share = data!.totalProfiles > 0 ? Math.round((attributedCount / data!.totalProfiles) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Links issued", value: data!.affiliates.length, note: `${withUser} to athletes` },
          { label: "Signups attributed", value: attributedCount, note: `${share}% of all` },
          { label: "Codes used", value: byCode.length, note: `of ${data!.affiliates.length}` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <div className="text-2xl font-extrabold text-slate-100">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{s.note}</div>
          </div>
        ))}
      </div>

      {/* The one that decides whether any of this works. An athlete without a
          code shares a card with a plain address on it — fine, but nothing
          comes back to them, so there is no reason to do it twice. */}
      {withUser === 0 && data!.affiliates.length > 0 && (
        <p className="rounded-2xl border border-readiness-yellow/25 bg-readiness-yellow/[0.04] p-3 text-sm text-slate-300">
          No affiliate row is linked to an athlete account, so no athlete&apos;s share card carries
          their own link. Set <code>user_id</code> on an affiliate to give that person a code that
          follows them.
        </p>
      )}

      {byCode.length > 0 && (
        <div>
          <span className="field-label">Where signups came from</span>
          <ul className="mt-2 space-y-1">
            {byCode.slice(0, 10).map(([code, n]) => {
              const affiliate = data!.affiliates.find((a) => a.code === code);
              return (
                <li key={code} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-slate-100">{affiliate?.name ?? code}</span>
                    <span className="ml-2 text-xs text-slate-500">{referralLink(code)}</span>
                  </span>
                  <span className="shrink-0 font-bold text-accent-400">{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {byCode.length === 0 && (
        <p className="text-sm text-slate-500">
          No signup has arrived with a code yet. Every share card carries a link now — the plain
          address for most athletes, their own for anyone with an affiliate row.
        </p>
      )}
    </div>
  );
}
