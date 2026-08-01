"use client";

/**
 * The day's fuelling, as concentric rings.
 *
 * WHY RINGS. The page was a stack of bordered rectangles — a verdict card, a
 * calories card, macro bars, a water bar — each one a box with an edge, all the
 * same weight, and two of them reporting the same number in different words. It
 * read as a form to fill in rather than a thing to look at, which for the one
 * screen someone opens after training is the wrong way round.
 *
 * Four rings answer "am I on track" in one glance and no reading. It's also a
 * shape this audience already knows from their watch, so nobody has to be
 * taught what closing one means.
 *
 * Calories are the outer ring because that's the headline; protein sits just
 * inside because for an athlete it's the one that actually matters after total
 * intake. Everything is drawn from the same numbers the rest of the page uses —
 * no second calculation.
 *
 * GEOMETRY IS LOAD-BEARING. Four rings at a 15px stroke leave a 64px hole, and
 * "2,800" at 36px is about 100px wide — the headline number sat straight on top
 * of the inner two rings, which I only saw by rendering it. 10px strokes and a
 * 30px number leave a ~98px hole with room to spare at the widest value.
 *
 * THE PALETTE IS FIXED, not the sport accent. Calories took `accent`, and two
 * of the six sport accents are `#4ade80` and `#38bdf8` — the exact greens and
 * blues used for carbs and protein. A footballer would have had two identical
 * rings. Colour here means "which macro", and that meaning has to hold on every
 * account; the sport's accent already colours the rest of the page. Fat is
 * violet because the obvious amber was indistinguishable from the gold beside
 * it in the legend.
 */
const RING_COLOURS = {
  kcal: "#e3b53f",
  protein: "#38bdf8",
  carbs: "#4ade80",
  fats: "#c084fc",
} as const;

export function FuelRings({ eaten, targetKcal, macros, targets }: {
  eaten: number;
  targetKcal: number;
  macros: { protein: number; carbs: number; fats: number };
  targets: { protein: number; carbs: number; fats: number } | null;
}) {
  const SIZE = 208;
  const STROKE = 10;
  const GAP = 5;

  const rings = [
    { key: "kcal", label: "Calories", value: eaten, target: targetKcal, colour: RING_COLOURS.kcal, unit: "" },
    { key: "protein", label: "Protein", value: macros.protein, target: targets?.protein ?? 0, colour: RING_COLOURS.protein, unit: "g" },
    { key: "carbs", label: "Carbs", value: macros.carbs, target: targets?.carbs ?? 0, colour: RING_COLOURS.carbs, unit: "g" },
    { key: "fats", label: "Fat", value: macros.fats, target: targets?.fats ?? 0, colour: RING_COLOURS.fats, unit: "g" },
  ];

  const left = Math.max(0, targetKcal - eaten);
  const over = eaten > targetKcal;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
          {rings.map((r, i) => {
            const radius = SIZE / 2 - STROKE / 2 - i * (STROKE + GAP);
            const circ = 2 * Math.PI * radius;
            // Capped at one full turn. A ring that wraps past 100% reads as
            // being back near the start, which is the opposite of the truth.
            const pct = r.target > 0 ? Math.min(1, r.value / r.target) : 0;
            return (
              <g key={r.key}>
                <circle
                  cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none"
                  stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE}
                />
                <circle
                  cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none"
                  stroke={r.colour} strokeWidth={STROKE} strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                  style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
                />
              </g>
            );
          })}
        </svg>

        {/* The one number worth reading from across a changing room. It takes
            the calorie ring's colour because it is that ring's number, and
            switches to blue when you go past — the same blue "over" wears
            everywhere else on the page. */}
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-3xl font-extrabold leading-none tabular-nums" style={{ color: over ? RING_COLOURS.protein : RING_COLOURS.kcal }}>
              {targetKcal > 0 ? (over ? `+${(eaten - targetKcal).toLocaleString()}` : left.toLocaleString()) : eaten.toLocaleString()}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
              {targetKcal > 0 ? (over ? "kcal over" : "kcal left") : "kcal eaten"}
            </div>
          </div>
        </div>
      </div>

      {/* The legend carries the numbers, so the rings never have to. */}
      <ul className="w-full space-y-2">
        {rings.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.colour }} />
            <span className="flex-1 text-xs text-slate-400">{r.label}</span>
            <span className="tabular-nums text-sm font-bold text-slate-100">
              {Math.round(r.value).toLocaleString()}{r.unit}
            </span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">
              {r.target > 0 ? `/ ${Math.round(r.target).toLocaleString()}${r.unit}` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
