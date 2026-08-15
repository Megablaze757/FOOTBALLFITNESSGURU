"use client";

import { useRef, useState } from "react";
import type { PainMap } from "@/lib/types";
import {
  BODY_REGIONS as REGIONS, BODY_VIEWBOX, nearestRegion, type BodyRegion,
} from "@/lib/body-map";
import { BODY_OUTLINE } from "@/lib/body-outline";

// Untouched regions used to be slate-300 — a bright, solid dot. Fifteen of
// them, all shouting, so the one area you'd actually marked was the quietest
// thing on the figure and the map read as a column of beads rather than a body.
// A dim fill with a legible edge still says "tap me" without competing with an
// answer.
const UNSET_FILL = "rgba(255,255,255,0.10)";
const UNSET_STROKE = "rgba(255,255,255,0.32)";

function painColor(level: number): string {
  if (level <= 0) return UNSET_FILL;
  if (level >= 7) return "#dc2626"; // red
  if (level >= 4) return "#eab308"; // yellow
  return "#fb923c"; // orange (mild)
}

export function BodyMap({
  value,
  onChange,
  mode = "pain",
}: {
  value: PainMap;
  onChange: (next: PainMap) => void;
  // "pain" logs a 0-10 severity (daily check-in). "select" is a simple
  // tap-to-toggle for picking an injured area.
  mode?: "pain" | "select";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedLabel = REGIONS.find((r) => r.key === selected)?.label;
  const svgRef = useRef<SVGSVGElement>(null);

  /** Tap or keyboard, one path. `select` toggles; `pain` opens the slider. */
  function choose(region: BodyRegion) {
    setSelected(region.key);
    if (mode !== "select") return;
    const next = { ...value };
    if (next[region.key]) delete next[region.key];
    else next[region.key] = 5;
    onChange(next);
  }

  /**
   * THE WHOLE FIGURE IS THE TARGET.
   *
   * Every region was a ~14px circle and nothing but the circle responded, so
   * half the taps did nothing at all. They cannot simply be made bigger: the
   * closest pair are 17 units apart and a 44px target needs 24, so growing them
   * would have each region stealing its neighbour's taps. Bodies are crowded.
   *
   * So the tap doesn't have to land on anything — the nearest region wins. See
   * lib/body-map.ts, where the arithmetic is, and its tests, which sweep every
   * point of the silhouette looking for a dead one.
   *
   * getScreenCTM, not getBoundingClientRect: the SVG scales to its container
   * and preserveAspectRatio letterboxes it, so the box is not the drawing. The
   * matrix knows about both and stays right at any size.
   */
  function onFigureTap(e: React.MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const region = nearestRegion(p.x, p.y);
    if (region) choose(region);
  }

  function setLevel(level: number) {
    if (!selected) return;
    const next = { ...value };
    if (level <= 0) delete next[selected];
    else next[selected] = level;
    onChange(next);
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}
        className="mx-auto h-72 touch-manipulation"
        role="group"
        aria-label="Body pain map — tap where it hurts"
      >
        {/* THE SAME BODY THE STRENGTH MAP USES.
            This was a circle and five rounded rectangles — a stick figure,
            which is what "tap where it hurts" gets away with because the dots
            carry the meaning. It still looked like a stick figure, on the one
            screen an injured athlete opens.

            The outline is traced from a CC0 anatomical figure (lib/body-outline
            .ts) and scaled into this map's own 160x320 space, so every region
            coordinate and the whole nearest-region hit test below are untouched
            — see the transform. Two things did move: the shoulder dots, which
            sat on a collarbone once the torso stopped being 40 units wide, and
            the arms, which now exist and therefore needed regions of their own. */}
        <g
          transform="translate(80 14) scale(0.1801) translate(-430.3 -36.8)"
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="9"
          strokeLinejoin="round"
        >
          <path d={BODY_OUTLINE} />
        </g>

        {/* The dots are the READOUT now, not the target — they say where you
            have marked and how badly. Hit-testing is the overlay below. */}
        {REGIONS.map((region) => {
          const level = value[region.key] ?? 0;
          const isSel = selected === region.key;
          const marked = level > 0;
          return (
            <circle
              key={region.key}
              cx={region.cx}
              cy={region.cy}
              // A marked area grows slightly. On a phone the fill colour alone
              // is easy to miss mid-tap; size is legible at a glance.
              r={marked ? region.r + 1.5 : region.r}
              fill={painColor(level)}
              stroke={isSel ? "#e3b53f" : marked ? "rgba(255,255,255,0.5)" : UNSET_STROKE}
              strokeWidth={isSel ? 2.5 : 1.5}
              // pointer-events-none, so the overlay below gets every tap. The
              // <title> that used to be here went with it: a tooltip needs
              // hover, and this can no longer be hovered. The sr-only list is
              // where the same information lives now, once, for everyone.
              className="pointer-events-none transition-all"
            />
          );
        })}

        {/* One target, over everything. Last in the document so it sits on top;
            transparent rather than absent, because Safari does not dispatch
            pointer events to a shape with `fill: none`. */}
        <rect
          x={0}
          y={0}
          width={BODY_VIEWBOX.width}
          height={BODY_VIEWBOX.height}
          fill="transparent"
          className="cursor-pointer"
          onClick={onFigureTap}
        />
      </svg>

      {/* KEYBOARD AND SCREEN READER ACCESS, which the map had none of.
          Fifteen circles with onClick handlers announce as nothing and cannot
          be reached with a keyboard at all — so the one control that answers
          "where does it hurt" was unusable without a pointer.

          Real buttons, positioned off-screen rather than `display: none`, so
          they are reachable by tab and by a screen reader's element list while
          the figure stays the visual. Each one says its own state, so moving
          through them reads as a body rather than as fifteen anonymous dots. */}
      <ul className="sr-only">
        {REGIONS.map((region) => {
          const level = value[region.key] ?? 0;
          return (
            <li key={region.key}>
              <button
                type="button"
                onClick={() => choose(region)}
                // Focus lights up the dot on the figure. These buttons are
                // off-screen, so without this a keyboard user is tabbing
                // through fifteen controls with no visible focus anywhere on
                // the page — the ring IS the focus indicator.
                onFocus={() => setSelected(region.key)}
                aria-pressed={mode === "select" ? level > 0 : undefined}
              >
                {region.label}
                {mode === "select" ? "" : `: ${level} out of 10`}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Select mode gets chips, not a panel. A full-width rounded box to hold
          the words "Selected: L knee" was more furniture than content, and the
          chips double as a way to see and undo what you've picked. */}
      {mode === "select" ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {Object.keys(value).length === 0 ? (
            <p className="text-sm text-slate-500">Tap where it hurts.</p>
          ) : (
            Object.keys(value).map((k) => (
              <button
                key={k}
                onClick={() => {
                  const next = { ...value };
                  delete next[k];
                  onChange(next);
                }}
                className="flex items-center gap-1.5 rounded-full border border-pitch-400/40 bg-pitch-400/10 px-3 py-1.5 text-xs font-semibold text-pitch-400 transition hover:bg-pitch-400/20"
              >
                {REGIONS.find((r) => r.key === k)?.label ?? k}
                <span className="text-pitch-400/60" aria-hidden>×</span>
                <span className="sr-only">Remove</span>
              </button>
            ))
          )}
        </div>
      ) : (
      <div className="mt-3 rounded-2xl bg-white/[0.04] p-3">
        {selected ? (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">{selectedLabel}</span>
              <span className="tabular-nums text-slate-400">{value[selected] ?? 0}/10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={value[selected] ?? 0}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full"
            />
          </>
        ) : (
          <p className="text-center text-sm text-slate-500">Tap a body part to log pain.</p>
        )}
      </div>
      )}
    </div>
  );
}
