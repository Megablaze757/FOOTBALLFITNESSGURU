"use client";

import { FILTER_CHIPS, activeFilterCount, type MealFilters } from "@/lib/meal-filters";

/**
 * The filter chips, rendered the same way in the library and the swap sheet.
 *
 * One component rather than two copies, for the reason the shared filter model
 * exists at all: these are the two screens you go to looking for a meal, and
 * they should not look or behave differently depending on which door you came
 * through.
 *
 * A "Clear" chip appears only once something is on. A permanent clear button is
 * a control that does nothing most of the time, and on a phone the row is
 * already competing for width with five real filters.
 *
 * `hide` exists for the swap sheet: starring is meaningless there when the
 * database column isn't deployed, and a chip that filters to an empty list is
 * worse than no chip.
 */
export function MealFilterBar({ filters, onChange, hide = [], count, children }: {
  filters: MealFilters;
  onChange: (next: MealFilters) => void;
  hide?: (keyof MealFilters)[];
  /** Results after filtering, so the row can say what it did. */
  count?: number;
  /**
   * Extra chips for one screen only — the library's "Fits my diet", which is a
   * scoping control rather than a content filter and so doesn't belong in the
   * shared set. Rendered INSIDE the same flex row: left on its own it wrapped
   * to a line of its own and read as a separate, unrelated control.
   */
  children?: React.ReactNode;
}) {
  const active = activeFilterCount(filters);
  const chips = FILTER_CHIPS.filter((c) => !hide.includes(c.id));

  return (
    <div className="space-y-2">
      {/* ONE SCROLLING ROW, not a wrapping block.
          Wrapped, five filters plus the library's diet chip plus "Clear" ran to
          three lines, and with the search box and the slot chips above them the
          screen was more than half chrome before a single recipe. The "Clear"
          chip was stranded alone on the third line, which reads as an unrelated
          control rather than the end of the row.

          `chip-option` already carries `shrink-0`, so the row scrolls cleanly —
          and `-mx-4 px-4` lets it bleed to the screen edge so the cut-off chip
          is visibly cut off, which is what tells you to swipe. The order is
          most-reached-for first, because the tail is the part you have to go
          looking for. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange({ ...filters, [c.id]: !filters[c.id] })}
            aria-pressed={filters[c.id]}
            className="chip-option chip-option-sm"
          >
            <span aria-hidden>{c.icon}</span> {c.label}
          </button>
        ))}
        {children}
        {active > 0 && (
          <button
            onClick={() => onChange({ ...filters, ...Object.fromEntries(chips.map((c) => [c.id, false])) })}
            className="chip-option chip-option-sm border-white/5 text-slate-500"
          >
            Clear {active}
          </button>
        )}
      </div>
      {count != null && (
        // Says what the filters did. Without it, a combination that matches
        // three meals looks identical to a broken list.
        <p className="text-xs text-slate-500">
          {count} {count === 1 ? "meal" : "meals"}{active > 0 ? " match" : ""}
        </p>
      )}
    </div>
  );
}
