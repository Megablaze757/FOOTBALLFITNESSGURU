"use client";

import { useState } from "react";
import { rescaleEntry, type FoodEntry } from "@/lib/food-log";

/**
 * What you have eaten today, as a list you can change.
 *
 * WHAT THIS REPLACES. The page had a running total and three number boxes
 * labelled "macros eaten today". Logging a meal filled the boxes in; correcting
 * anything meant working out the new totals yourself and retyping them. So the
 * page carried a manual control that existed only because the data model had no
 * list in it — and once you had used both, the boxes and the tick-list
 * disagreed about the same day with no way to tell which was right.
 *
 * Editing a row is deliberately ONE number: the calories. That is the
 * correction people actually make — "that was more like 700" — and the macros
 * are re-scaled with it so the day keeps adding up. Nobody wants four boxes per
 * meal, and four boxes is how you get a day whose protein does not match its
 * calories.
 *
 * Collapsed rows are 44px tall and the whole row opens the editor, so this
 * stays usable with a thumb.
 */
export function TodayFood({
  entries,
  onChange,
}: {
  entries: FoodEntry[];
  onChange: (next: FoodEntry[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!entries.length) {
    return (
      <p className="text-sm text-slate-400">
        Nothing logged yet. Tick a meal off your plan, photograph a plate, or describe what you ate.
      </p>
    );
  }

  function commit(e: FoodEntry) {
    const n = Number(draft);
    // Empty or nonsense leaves it alone; zero is a removal, and removal has its
    // own button. Same rule as lib/food-log's rescaleEntry, enforced here so the
    // field never shows a number that was not applied.
    if (draft.trim() !== "" && Number.isFinite(n) && n > 0) {
      onChange(entries.map((x) => (x.id === e.id ? rescaleEntry(x, n) : x)));
    }
    setOpenId(null);
  }

  return (
    <ul className="divide-y divide-white/5">
      {entries.map((e) => {
        const open = openId === e.id;
        return (
          <li key={e.id} className="py-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setOpenId(open ? null : e.id); setDraft(String(e.kcal)); }}
                aria-expanded={open}
                className="tap-target flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{e.label}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">{e.kcal}</span>
                <span className="shrink-0 text-[11px] text-slate-500">kcal</span>
              </button>
              <button
                type="button"
                onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
                aria-label={`Remove ${e.label}`}
                className="tap-target shrink-0 px-1 text-slate-600 hover:text-readiness-red"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {open && (
              <div className="flex items-center gap-2 pb-2 pl-1">
                <label className="text-[11px] text-slate-500" htmlFor={`kcal-${e.id}`}>Calories</label>
                <input
                  id={`kcal-${e.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={draft}
                  autoFocus
                  onChange={(ev) => setDraft(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") commit(e); if (ev.key === "Escape") setOpenId(null); }}
                  className="field w-24 px-2 py-1 text-center text-xs tabular-nums"
                />
                <button type="button" onClick={() => commit(e)} className="chip text-accent-400">Save</button>
                <span className="text-[11px] text-slate-600">
                  {e.protein}p · {e.carbs}c · {e.fats}f
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
