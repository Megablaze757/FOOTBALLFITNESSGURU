"use client";

/**
 * How many days of history a panel is showing.
 *
 * Shared because it was written twice within an hour of itself, and both copies
 * came out at 29px — under the 44px floor, on a control whose whole job is to
 * be tapped. The floor is enforced by lib/tap-targets.test.ts, which caught
 * both before either shipped; this is the fix that stops the third copy.
 *
 * `.unit-toggle` is the app's segmented-control class: 44px tall with the
 * buttons filling it, selected state read from aria-pressed so the
 * announcement and the appearance cannot drift.
 */
export function RangeToggle<T extends number>({ value, options, onChange, unit = "d" }: {
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  unit?: string;
}) {
  return (
    <span className="unit-toggle">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          aria-label={`Last ${option} days`}
        >
          {option}{unit}
        </button>
      ))}
    </span>
  );
}
