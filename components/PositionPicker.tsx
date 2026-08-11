"use client";

import { positionsForSport } from "@/lib/coach";

/**
 * Pick every position you play, not just one.
 *
 * The first one selected is the primary — it's what the playbook guide and the
 * AI prompt lead with — so the order is kept as tapped rather than sorted, and
 * the primary is marked. Tapping it again deselects it and the next one takes
 * over, which is how someone who's changed position fixes their profile without
 * having to clear it first.
 */
export function PositionPicker({ sport, value, onChange }: {
  sport: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const options = positionsForSport(sport);
  // A position they picked before a sport change, or one seeded from the old
  // single column, still belongs in the list — otherwise saving would silently
  // drop it.
  const all = [...new Set([...value, ...options])];
  if (!all.length) return null;

  const toggle = (p: string) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);

  return (
    <div>
      {/* "Your position / event" — a slash serving two sports at once, which is
          the kind of label that reads as an unfinished thought. A runner has an
          event, everyone else has a position; the app knows which they are, so
          it can just say the right word. */}
      <span className="field-label">{sport === "running" ? "Your event" : "Your position"}</span>
      <div className="flex flex-wrap gap-2">
        {all.map((p) => {
          const i = value.indexOf(p);
          const on = i >= 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              aria-pressed={on}
              className="chip-option"
            >
              {p}
              {i === 0 && <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">main</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {value.length > 1
          ? "Your skill drills will cover all of these. The first is your main position."
          : "Play more than one? Tap them all — your drills will cover each."}
      </p>
    </div>
  );
}
