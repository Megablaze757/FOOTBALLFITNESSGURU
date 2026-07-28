"use client";

import { useMemo, useState } from "react";
import { MOVEMENTS, SLOT_LABEL_ORDER, type Movement } from "@/lib/movements";
import { SLOT_LABEL } from "@/lib/engine";

/**
 * Lets a coach choose specific exercises to build a program around.
 *
 * Only movements the ENGINE can actually program are offered. The library has
 * 330 exercises; the engine knows how to dose and place 85 of them. Offering a
 * coach the other 245 would let them pick something the builder then silently
 * ignores — a picker whose choices don't arrive is worse than no picker.
 *
 * What's chosen is a strong preference, not a command. Picks still pass through
 * the athlete's pain map and their own stated exclusions, so a squat chosen for
 * someone reporting bad knee pain is dropped. That's said on screen, because a
 * coach who doesn't know the rule will assume their instruction was followed.
 */
export function ExercisePicker({ sport, value, onChange }: {
  sport?: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const available = useMemo(() => {
    // Skill work is picked by position elsewhere, and warm-ups/cool-downs are
    // decided by the session rather than by a coach browsing a list.
    const pool = MOVEMENTS.filter((m) => m.slot !== "skill" && m.slot !== "warmup" && m.slot !== "cooldown");
    const forSport = sport ? pool.filter((m) => !m.sports || m.sports.includes(sport as never)) : pool;
    const q = query.trim().toLowerCase();
    return (q ? forSport.filter((m) => m.name.toLowerCase().includes(q)) : forSport)
      .sort((a, b) => SLOT_LABEL_ORDER.indexOf(a.slot) - SLOT_LABEL_ORDER.indexOf(b.slot) || a.name.localeCompare(b.name));
  }, [sport, query]);

  const chosen = value.map((id) => MOVEMENTS.find((m) => m.id === id)).filter(Boolean) as Movement[];

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/[0.07]"
      >
        <span className="min-w-0 break-words">
          {chosen.length ? `${chosen.length} exercise${chosen.length === 1 ? "" : "s"} chosen` : "Pick specific exercises (optional)"}
        </span>
        <span className="ml-2 shrink-0 text-slate-500">{open ? "▲" : "▼"}</span>
      </button>

      {chosen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className="rounded-full bg-pitch-400/15 px-2.5 py-1 text-xs font-medium text-pitch-400"
            >
              {m.name} ×
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library…"
            className="field"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            Chosen exercises are prioritised wherever they fit. They&apos;re still checked against
            each athlete&apos;s pain and their own exclusions, so an athlete with a bad knee
            won&apos;t be given a squat just because it was picked.
          </p>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {available.length === 0 && (
              <li className="px-1 py-3 text-center text-xs text-slate-500">Nothing matches that.</li>
            )}
            {available.map((m) => {
              const on = value.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`flex min-h-[2.5rem] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                      on ? "bg-pitch-400/15 text-pitch-400" : "text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="min-w-0 break-words">{m.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
                      {SLOT_LABEL[m.slot]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
