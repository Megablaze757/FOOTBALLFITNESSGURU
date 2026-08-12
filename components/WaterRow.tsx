"use client";

import { useState } from "react";
import { NumberInput } from "./NumberInput";

/**
 * WATER, STILL IN ONE LINE — with the exact controls one tap behind it.
 *
 * It was two buttons that only counted up. +250 and +500 cover the common case
 * and nothing else: a 750ml bottle is two taps that land you 250 over, and a
 * mis-tap was permanent, because nothing on the page could take water off
 * again. The number was written straight to the database and never shown
 * anywhere you could correct it.
 *
 * The obvious fix — drop a field, a minus and a clear into the row — does not
 * fit. That row already carries a label, a bar, a readout and two chips inside
 * roughly 330px on a phone, which leaves the bar about 70px; three more controls
 * would squeeze it to nothing and turn the line into a toolbar.
 *
 * So the resting row is exactly what it was, and the READOUT is the way in.
 * Tapping "1.5/3.0L" opens a line with a typed amount and add/remove either side
 * of it. Anyone who only ever taps +500 sees no change at all, and the precision
 * costs one tap rather than permanent clutter.
 */
export function WaterRow({ ml, goalMl, onChange }: {
  ml: number;
  goalMl: number;
  /** Absolute new total; clamping and rounding belong to the caller. */
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Seeded at 500, not empty. An empty box disables both buttons, so the panel
   * would open looking broken — and 500 is the right number for undoing a
   * mis-tapped +500, which is half the reason anyone opens this.
   */
  const [amount, setAmount] = useState<number | null>(500);
  const step = amount ?? 0;

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      {/* gap-2, not gap-3. Five items share about 260px inside the card on a
          320px phone, and the only elastic one is the bar — which measured 22px
          wide there, a progress bar too short to read a proportion off. The word
          "Water" goes with it at that size for the same 34px; the droplet, the
          blue fill and a readout in litres are not ambiguous without it, and it
          is still announced. */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs text-slate-400">
          <span aria-hidden>💧</span>
          <span className="sr-only">Water</span>
          <span className="ml-1 hidden min-[360px]:inline" aria-hidden>Water</span>
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-sky-400 transition-all"
            style={{ width: `${Math.min(100, (ml / goalMl) * 100)}%` }}
          />
        </span>
        {/* The readout IS the disclosure. A chevron of its own would cost 44px
            of a row that has none spare, so the dotted underline carries the
            affordance and the hit area grows outwards via tap-pad rather than
            pushing the bar any narrower. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="water-exact"
          className="tap-pad relative shrink-0 text-xs tabular-nums text-sky-300 underline decoration-slate-600 decoration-dotted underline-offset-4 transition hover:decoration-sky-400"
        >
          {(ml / 1000).toFixed(1)}
          <span className="text-slate-600">/{(goalMl / 1000).toFixed(1)}L</span>
        </button>
        {[250, 500].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(ml + v)}
            className="chip shrink-0 text-sky-300 hover:bg-white/[0.08]"
          >
            +{v}
          </button>
        ))}
      </div>

      {/* Rendered whether or not it is open, so `aria-controls` always points at
          something real and the typed amount survives closing the panel. */}
      <div id="water-exact" hidden={!open} className="mt-3">
        {/* A STEPPER, NOT A FORM. The box is HOW MUCH and the buttons are which
            way — one control, and both halves of what was missing fall out of
            it. A single field holding the day's TOTAL would have been fewer
            parts, but then logging a 750ml bottle means doing the addition
            yourself, which is the thing being fixed.

            The field is sized to the number it holds. Rendered at flex-1 it came
            out 203px wide and 50px tall, which made a four-digit box the largest
            and loudest thing on a card whose headline is a set of rings — and it
            is the least important control here. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(ml - step)}
            disabled={!step || ml === 0}
            aria-label={`Remove ${step} ml`}
            className="chip w-11 shrink-0 justify-center text-base text-sky-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-white/[0.05]"
          >
            −
          </button>
          {/* h-11/py-0 to match the 44px buttons either side. `.field` is py-3
              at 16px type, which is 50px — a stepper visibly taller in the
              middle than at its ends. The 16px stays: anything smaller and iOS
              zooms the page on focus and does not zoom back. */}
          <NumberInput
            value={amount}
            onChange={setAmount}
            min={0}
            max={5000}
            step={50}
            className="field h-11 w-24 py-0 text-center tabular-nums"
            aria-label="Amount of water in millilitres"
          />
          <span className="shrink-0 text-xs text-slate-500">ml</span>
          <button
            type="button"
            onClick={() => onChange(ml + step)}
            disabled={!step}
            aria-label={`Add ${step} ml`}
            className="chip w-11 shrink-0 justify-center text-base text-sky-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:hover:bg-white/[0.05]"
          >
            +
          </button>
          {/* Right of the stepper, where there is room, rather than on a line of
              its own. Quiet: emptying the day is the rarest thing here and it
              was rendering as the boldest. */}
          <button
            type="button"
            onClick={() => onChange(0)}
            disabled={ml === 0}
            className="tap-target ml-auto shrink-0 text-xs text-slate-500 transition hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-500"
          >
            Clear
          </button>
        </div>
        {/* In millilitres, because that is the unit being typed. The readout
            above rounds to one decimal place, so "1.5L" is anything from 1,450
            to 1,549 — not a number you can correct against. */}
        <p className="mt-2 text-xs tabular-nums text-slate-500">
          {ml.toLocaleString()} ml logged today
        </p>
      </div>
    </div>
  );
}
