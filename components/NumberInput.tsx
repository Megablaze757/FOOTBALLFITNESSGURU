"use client";

import { useState } from "react";

/**
 * A number field you can actually type in.
 *
 * THE BUG THIS EXISTS TO END. A controlled number input bound straight to a
 * number cannot hold the half-finished states typing goes through, and there
 * are three of them:
 *
 *   ""    Clearing the box. `Number("")` is 0, so the field re-renders as "0"
 *         the instant you press backspace. You cannot empty it — you have to
 *         select-all and overtype, which on a phone means a long-press.
 *   "8."  On the way to 8.5. `Number("8.")` is 8, the box snaps back to "8",
 *         and the decimal point is unreachable. 8.5 km simply cannot be typed.
 *   "-"   On the way to a negative. Same collapse.
 *
 * It had already broken the meal-quantity field, where a stray 0 also wiped the
 * macros it scaled from. Rather than patch each site, the raw text lives here
 * while the field has focus and the parsed number goes to the caller — so what
 * you see is exactly what you typed, and what the app stores is a number.
 *
 * On blur the draft is dropped and the canonical value is shown, so "007" or
 * "8.50" tidies itself up without ever fighting you mid-edit.
 */
export function NumberInput({
  value,
  onChange,
  decimal = false,
  min,
  max,
  step,
  placeholder,
  className = "field",
  inputMode,
  "aria-label": ariaLabel,
  id,
}: {
  value: number | null;
  /** null means the box is empty — distinct from 0, which is a real answer. */
  onChange: (next: number | null) => void;
  decimal?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  className?: string;
  inputMode?: "numeric" | "decimal";
  "aria-label"?: string;
  id?: string;
}) {
  // null = not being edited; show the value the app holds.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      id={id}
      type="number"
      inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
      min={min}
      max={max}
      step={step ?? (decimal ? "0.1" : undefined)}
      placeholder={placeholder}
      className={className}
      aria-label={ariaLabel}
      value={draft ?? (value == null ? "" : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === "") { onChange(null); return; }
        const n = Number(raw);
        // "8." and "-" parse to 8 and NaN respectively. Both are legitimate
        // things to be part-way through, so the draft keeps them on screen and
        // the caller simply isn't told until there is a real number to tell it.
        if (Number.isFinite(n)) onChange(decimal ? n : Math.trunc(n));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
