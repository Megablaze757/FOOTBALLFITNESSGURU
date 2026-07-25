"use client";

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

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
            active === t.id
              ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
          }`}
        >
          {t.icon && <span className="mr-1">{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  );
}
