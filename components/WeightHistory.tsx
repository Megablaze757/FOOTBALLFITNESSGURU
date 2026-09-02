"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordChanged } from "@/lib/data-events";
import { ensureUser, isAuthFailure, SESSION_LOST_RETRY } from "@/lib/session-guard";
import type { Bodyweight } from "@/lib/bodyweight";
import {
  weightTrend, changeLabel, spanLabel, isTowardGoal, type DietGoal,
} from "@/lib/weight-trend";
import {
  editWeight, deleteWeight, deleteWarning, weightError, surpriseAgainst,
} from "@/lib/weight-edit";

/**
 * Which way it is going, and a way to fix a number that is wrong.
 *
 * THE PAGE HAD THE DATA AND ANSWERED THE WRONG QUESTION. It drew forty bars and
 * printed today's weight. "Am I actually losing weight?" is a subtraction, and
 * nobody answers it by comparing the heights of forty bars — so the app was
 * holding the difference and never showing it.
 *
 * AND THERE WAS NO WAY BACK. A weight, once typed, was permanent. Somebody who
 * put 8.5 in for 85 had a chart with one bar and thirty-nine flat lines, no
 * route to correcting it, and no way to ask anybody either — the admin
 * bodyweight table was removed on purpose (migration 0096: an admin screen
 * listing what every user weighs is not ours to look at), and the note said
 * "support can ask the athlete". This is the other half of that decision: the
 * athlete has to be able to fix it themselves.
 *
 * The rules about WHICH table a weight lives in and what deleting one may
 * touch are in lib/weight-edit.ts, because they matter enough to be tested —
 * a check-in weight shares its row with a whole day of training history.
 */
export function WeightHistory({ userId, series, today, dietGoal, bodyLogExtras, onChanged }: {
  userId: string;
  series: Bodyweight[];
  today: string;
  dietGoal: DietGoal | null;
  /** Dates whose body_logs row also holds a body fat reading or a photo. */
  bodyLogExtras: Set<string>;
  onChanged: () => void;
}) {
  const trend = weightTrend(series, today);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!trend.latest) return null;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 data-tip="weight-trend" className="field-label !mb-0">Trend</h2>
        <span className="text-xs text-slate-500">
          {trend.entries.length} entr{trend.entries.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {trend.windows.length === 0 ? (
        /* SAY WHAT IS MISSING RATHER THAN SHOW AN EMPTY ROW. One weight is not
           a trend, and "keep going" is more use than three dashes. */
        <p className="text-xs text-slate-400">
          One more weigh-in, a week apart, and the change shows up here.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {trend.windows.map((w) => {
            const good = isTowardGoal(w.change, dietGoal);
            return (
              <div key={w.days} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {w.days} days
                </span>
                <span
                  className={`mt-0.5 block text-base font-extrabold tabular-nums ${
                    /* COLOUR ONLY WHEN THE GOAL SAYS WHICH WAY IS GOOD.
                       Losing two kilos is a win on a cut and a problem on a
                       bulk, and a green arrow on every drop tells somebody
                       trying to add size that they are doing well while they
                       lose it. No goal set, no colour. */
                    good === true ? "text-accent-400" : good === false ? "text-readiness-yellow" : "text-slate-100"
                  }`}
                >
                  {changeLabel(w.change)}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                  {spanLabel(w)}
                  {w.perWeek !== null && (
                    <>
                      <br />
                      {changeLabel(w.perWeek)}/wk
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="tap-target cursor-pointer list-none text-xs font-semibold text-slate-400 hover:text-slate-200">
          {open ? "Hide entries" : "Edit or remove an entry"}
        </summary>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {trend.entries.slice(0, 40).map((entry) => (
            <WeightRow
              key={`${entry.source}-${entry.date}`}
              userId={userId}
              entry={entry}
              previousKg={previousOf(trend.entries, entry)}
              hasOtherBodyData={entry.source === "weigh-in" && bodyLogExtras.has(entry.date!)}
              editing={editing === `${entry.source}-${entry.date}`}
              onEdit={() => setEditing(editing === `${entry.source}-${entry.date}` ? null : `${entry.source}-${entry.date}`)}
              onDone={() => { setEditing(null); onChanged(); }}
            />
          ))}
        </ul>
      </details>
    </div>
  );
}

/** The entry recorded before this one, for the "that's a big jump" check. */
function previousOf(entries: Bodyweight[], entry: Bodyweight): number | null {
  // entries are newest first, so the one AFTER this in the array is older.
  const i = entries.indexOf(entry);
  return i >= 0 && i + 1 < entries.length ? entries[i + 1].kg : null;
}

function WeightRow({ userId, entry, previousKg, hasOtherBodyData, editing, onEdit, onDone }: {
  userId: string;
  entry: Bodyweight;
  previousKg: number | null;
  hasOtherBodyData: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(String(entry.kg));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSave, setConfirmSave] = useState<string | null>(null);

  async function run(plan: ReturnType<typeof editWeight>) {
    if (plan.action === "refuse") { setErr(plan.reason); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const q = supabase.from(plan.table);
    const { error } =
      plan.action === "delete"
        ? await q.delete().eq("user_id", plan.userId).eq(plan.dateColumn, plan.date)
        : await q.update(plan.patch).eq("user_id", plan.userId).eq(plan.dateColumn, plan.date);
    setBusy(false);
    if (error) {
      // Same failure as the daily log: a token that aged out in a pocket. Say
      // what happened rather than passing a JWT error to somebody editing a
      // weight — see lib/session-guard.ts.
      setErr(isAuthFailure(error) ? SESSION_LOST_RETRY : error.message);
      return;
    }
    // Every reader of bodyweight — calorie target, strength ranks, home — is
    // listening for this. Without it they keep showing the old number until a
    // reload.
    recordChanged("weight");
    onDone();
  }

  async function save() {
    const kg = Number(value);
    const complaint = weightError(kg);
    if (complaint) { setErr(complaint); return; }

    // Asked once, not refused. Somebody back after six months off genuinely has
    // moved twelve kilos.
    const surprise = surpriseAgainst(kg, previousKg);
    if (surprise && confirmSave !== value) { setConfirmSave(value); setErr(surprise); return; }

    await run(editWeight(entry, kg, userId));
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-slate-400">{entry.date}</span>
        {editing ? (
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => { setValue(e.target.value); setErr(null); setConfirmSave(null); }}
            className="field !py-1.5 min-w-0 flex-1 text-sm"
            aria-label={`Weight on ${entry.date}`}
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-slate-100">
            {entry.kg} kg
            {/* WHERE IT CAME FROM, because it decides what removing it does. */}
            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {entry.source === "weigh-in" ? "weigh-in" : "daily log"}
            </span>
          </span>
        )}
        {editing ? (
          <>
            <button onClick={save} disabled={busy} className="chip shrink-0 text-accent-400 disabled:opacity-40">
              {busy ? "…" : confirmSave === value ? "Yes, save" : "Save"}
            </button>
            <button onClick={onEdit} className="chip shrink-0 text-slate-400">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="chip shrink-0 text-slate-300">Edit</button>
            <button
              onClick={() => (confirmDelete ? void run(deleteWeight(entry, userId, { hasOtherBodyData })) : setConfirmDelete(true))}
              disabled={busy}
              className={`chip shrink-0 disabled:opacity-40 ${confirmDelete ? "text-readiness-red" : "text-slate-500"}`}
            >
              {confirmDelete ? "Confirm" : "Remove"}
            </button>
          </>
        )}
      </div>
      {/* SAY WHAT SURVIVES BEFORE THEY TAP, not after. A check-in weight shares
          its row with sleep, soreness, mood and the session they logged. */}
      {confirmDelete && !editing && (
        <div className="mt-1 flex items-center gap-2 pl-20">
          <p className="min-w-0 flex-1 text-[11px] text-slate-400">
            {deleteWarning(entry, userId, { hasOtherBodyData })}
          </p>
          {/* A real button rather than an underlined word inside the sentence:
              backing out of a delete is the more likely of the two choices, so
              it cannot be the harder one to hit. */}
          <button onClick={() => setConfirmDelete(false)} className="tap-target chip shrink-0 text-slate-300">
            Keep it
          </button>
        </div>
      )}
      {err && <p className="mt-1 pl-20 text-[11px] text-readiness-yellow">{err}</p>}
    </li>
  );
}
