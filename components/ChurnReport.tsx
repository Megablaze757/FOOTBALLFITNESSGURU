"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";

interface Summary { reason: string; total: number; cancelled: number; paused: number; saved: number }
interface Row { reason: string; outcome: string; detail: string | null; created_at: string }

const LABELS: Record<string, string> = {
  injured: "Injured",
  season_ended: "Season finished",
  not_using: "Not using it enough",
  too_expensive: "Too expensive",
  missing_feature: "Missing a feature",
  technical: "Something broken",
  other: "Something else",
};

/**
 * Why people leave, and whether the save offer works.
 *
 * The point of collecting a reason is to act on it, and a reason that only ever
 * lands in a table nobody opens is theatre. The number that matters is the
 * rescue rate: if offering a pause isn't keeping anyone, the offer is wrong and
 * should change.
 */
export function ChurnReport() {
  const [days, setDays] = useState(90);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: summary }, { data: rows }] = await Promise.all([
      supabase.rpc("cancellation_summary", { p_days: days }),
      supabase.rpc("cancellation_reasons", { p_days: days }),
    ]);
    return { summary: (summary ?? []) as Summary[], rows: (rows ?? []) as Row[] };
  }, [days], `churn:${days}`);

  if (loading) return <div className="card h-48 animate-pulse" />;

  const summary = data?.summary ?? [];
  const rows = data?.rows ?? [];
  const total = summary.reduce((n, s) => n + Number(s.total), 0);
  const rescued = summary.reduce((n, s) => n + Number(s.paused) + Number(s.saved), 0);
  const rescueRate = total ? Math.round((rescued / total) * 100) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="field-label !mb-0">Why people leave</h2>
          <p className="text-[11px] text-slate-500">
            {total === 0 ? "Nobody yet." : `${total} in the last ${days} days · ${rescued} kept`}
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="field [color-scheme:dark] w-auto py-1.5 text-xs"
        >
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>A year</option>
        </select>
      </div>

      {total === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-slate-400">
          No cancellations yet. This fills in as people use the cancel flow — including the ones
          who take the pause instead, which is the number worth watching.
        </p>
      ) : (
        <>
          {rescueRate != null && (
            <div className="card mb-3 p-4 text-center">
              <div className="stat-label">Kept instead of lost</div>
              <div className="mt-1 text-3xl font-extrabold text-accent-400">{rescueRate}%</div>
              <p className="mt-1 text-[11px] text-slate-500">
                Took a pause or stayed, rather than cancelling outright.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {summary.map((s) => {
              const kept = Number(s.paused) + Number(s.saved);
              const pct = Number(s.total) ? Math.round((kept / Number(s.total)) * 100) : 0;
              return (
                <li key={s.reason} className="card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-100">
                      {LABELS[s.reason] ?? s.reason}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {s.total} · {kept} kept ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-pitch-400" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* What they typed matters more than which box they ticked. */}
          {rows.some((r) => r.detail) && (
            <div className="mt-4">
              <h3 className="field-label">In their words</h3>
              <ul className="space-y-2">
                {rows.filter((r) => r.detail).slice(0, 12).map((r, i) => (
                  <li key={i} className="card p-3">
                    <p className="text-sm text-slate-200">&ldquo;{r.detail}&rdquo;</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {LABELS[r.reason] ?? r.reason} · {r.outcome} · {r.created_at.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
