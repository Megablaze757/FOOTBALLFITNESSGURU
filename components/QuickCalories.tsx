"use client";

import { useState } from "react";
import { NumberInput } from "./NumberInput";

/**
 * The fastest way to log a coffee and a banana without describing them.
 *
 * WHAT WAS WRONG WITH IT. Three buttons that ran `setEaten(c => c + 200)`, a box
 * bound straight to `eaten`, and a Reset that set it to zero. None of them wrote
 * anything to the database, and — worse — none of them was in the food list.
 * Everything else on the page recomputes the day by summing that list, so
 * tapping +200 and then ticking your breakfast silently dropped the 200. The
 * number went up, the ring moved, and then it was gone.
 *
 * So a quick-add is an ENTRY now, like everything else. It saves on tap, it
 * shows up in Today's food where it can be corrected or removed, and it cannot
 * be overwritten by the next thing logged.
 *
 * The box no longer edits the total, because there is no total to edit — the
 * total is the sum of the list. It adds an exact amount instead, which is the
 * one thing the three fixed buttons cannot do.
 *
 * NO MINUS HERE, unlike the water row. Water is a single running number with
 * nothing itemising it, so removal has to live on the control. Calories are a
 * list of named rows sitting directly below this one, each with its own ✕ —
 * a "-200" here would have to guess which of them you meant.
 */
export function QuickCalories({ hidden, onAdd }: {
  hidden?: boolean;
  /** Always positive; the caller appends it to today's list. */
  onAdd: (kcal: number) => void;
}) {
  /**
   * Empty, and the + inert until something is typed — where the water stepper
   * seeds itself at 500. The difference is what the box is FOR: water's doubles
   * as the undo for a mis-tapped +500, while this one exists only for the
   * amounts the three buttons beside it don't cover. Seeding it with a fourth
   * fixed number would just be a fourth button that takes two taps.
   */
  const [amount, setAmount] = useState<number | null>(null);

  function add(kcal: number) {
    onAdd(kcal);
    setAmount(null);
  }

  return (
    <div className={`mt-5 flex-wrap items-center gap-2 ${hidden ? "hidden" : "flex"}`}>
      {[200, 400, 600].map((kc) => (
        <button
          key={kc}
          type="button"
          onClick={() => add(kc)}
          // h-11: `btn-ghost` is py-3, but the py-2 that was here to keep the
          // row compact rendered these at 38px — under the 44px floor, on the
          // most-tapped control on the card.
          className="btn-ghost h-11 flex-1 py-0 text-sm"
        >
          +{kc}
        </button>
      ))}
      {/* Kept together so the box, its unit and its button never wrap apart. */}
      <div className="flex shrink-0 items-center gap-2">
        <NumberInput
          value={amount}
          onChange={setAmount}
          min={0}
          max={5000}
          className="field h-11 w-20 py-0 text-center tabular-nums"
          placeholder="kcal"
          aria-label="Calories to add"
        />
        <button
          type="button"
          onClick={() => amount && add(amount)}
          disabled={!amount || amount <= 0}
          aria-label={amount ? `Add ${amount} kcal` : "Add calories"}
          className="chip w-11 shrink-0 justify-center text-base text-pitch-400 hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-white/[0.05]"
        >
          +
        </button>
      </div>
    </div>
  );
}
