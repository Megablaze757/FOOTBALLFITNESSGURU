"use client";

import { useRef } from "react";

/**
 * The pill tab strip the Coach page already used, extracted so the other long
 * pages can group their sections the same way instead of stacking everything.
 *
 * Tabs beat collapsing sections here because these pages hold several distinct
 * jobs — "what am I eating today" and "plan next week's shop" are different
 * visits, and showing both at once is what made them feel endless.
 */
export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, label = "Sections" }: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  /**
   * Names the strip for a screen reader. Without it a tablist announces as
   * "tab list" with nothing to say what it switches between — and there are four
   * of these across the app on four unrelated pages.
   */
  label?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);

  /**
   * Arrow-key movement, per the ARIA tabs pattern.
   *
   * These were plain buttons in a row: reachable by Tab, but each one its own
   * stop, so a keyboard user pressed Tab four times to get past the strip and
   * arrow keys did nothing. The pattern is one stop for the whole strip and
   * arrows to move within it, which is also what a screen-reader user expects
   * the moment it announces as a tablist.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (!delta && jump === null) return;
    e.preventDefault();

    const at = tabs.findIndex((t) => t.id === active);
    // Wraps, so the last tab doesn't dead-end.
    const next = jump ?? (at + delta + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    // Focus follows selection, otherwise the focus ring is left on the old tab.
    strip.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div
      ref={strip}
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            // One tab stop for the strip; arrows move inside it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            // Styling and the 44px floor come from `aria-selected`, which this
            // already sets. Before, the strip was 38px tall and the selected
            // look was a separate className that could disagree with the ARIA.
            className="chip-option"
          >
            {t.icon && <span aria-hidden>{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The content half of a tab.
 *
 * Each tab now advertises `aria-controls`, and that is a promise the markup has
 * to keep — without a matching element the association is a lie told to
 * assistive tech. Wrap a tab's content in this and it's true.
 */
export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
