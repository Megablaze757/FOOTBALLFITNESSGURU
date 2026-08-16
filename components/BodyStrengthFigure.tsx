"use client";

import { useId } from "react";
import type { MuscleGroup } from "@/lib/hypertrophy";
import { BODY_OUTLINE, BODY_VIEWBOX, MUSCLE_SHAPES } from "@/lib/body-outline";
import { MUSCLE_WORD, type BodyPartStrength } from "@/lib/strength-standards";

/**
 * A body you can point at, with one region lit at a time.
 *
 * WHY NOT components/BodyMap.tsx. That figure is a circle and five rounded
 * rectangles — fine for "tap where it hurts", where the dots carry the meaning
 * and the body is only a frame of reference. Here the BODY is the readout, and
 * you cannot say "your back is Advanced" on a rectangle.
 *
 * THE OUTLINE IS TRACED FROM A CC0 ILLUSTRATION — see lib/body-outline.ts and
 * the generator that builds it. Four attempts at hand-drawing a figure came
 * first and every one looked like blobs beside a body rather than parts of one.
 *
 * THE REGIONS ARE RECTANGLES CLIPPED TO THAT OUTLINE, which is the whole trick.
 * Drawing a shape that matches the body's edge means matching it to within a
 * pixel at every size; clipping means the body's own edge IS the region's edge,
 * so misalignment stops being a thing that can happen.
 *
 * EVERY RANKED REGION IS COLOURED, and the one you tap comes forward.
 *
 * It used to be one at a time, on the reasoning that tinting all seven reads as
 * camouflage and that two neighbours at the same tier merge into one shape. Both
 * of those are real and neither justified the result, which was a plain grey
 * figure: "doesn't really show anything until you click it". A body-map readout
 * whose resting state is blank is a readout you have to interrogate one muscle
 * at a time to learn anything from, and nobody taps all seven.
 *
 * So both failure modes are answered instead of avoided:
 *
 *   camouflage    resting tint is 0.45, not the 0.9 a selection wears, and it
 *                 sits under the same definition strokes the figure is drawn
 *                 with. Selecting anything drops the rest to 0.22, so a
 *                 selection is still unmistakable.
 *   merging       every filled region carries its own edge in its tier colour.
 *                 Two Advanced neighbours are two shapes with a seam, not one
 *                 gold blob.
 *
 * Unranked stays uncoloured — see NEUTRAL. Absent is not zero, and painting a
 * muscle the app has no lift for would be inventing a verdict.
 *
 * The list beside it still carries every rank in words, which is what makes the
 * colours legible without a key.
 *
 * FRONT AND BACK, AND THE BACK NEEDED NO SECOND SOURCE.
 *
 * There is no usable public-domain posterior anatomy: the two SVG candidates
 * were raster images in a wrapper, and the one real vector is CC BY-SA, whose
 * share-alike is a licensing decision for the business rather than something to
 * adopt quietly.
 *
 * It turns out not to be needed. A standing figure's SILHOUETTE is the same
 * from behind — same head, same shoulders, same arms at the sides, same legs —
 * so the outline is reused rather than mirrored or redrawn. What differs is
 * what is inside it, and nothing from the front is shown on the back: no
 * pectorals, no abdominals.
 *
 * THREE OF THE FOUR BACK MUSCLES REUSE A TRACED SHAPE, and that is a fact about
 * anatomy rather than a shortcut. The triceps occupy the back of the same upper
 * arm the biceps occupy the front of, and within a silhouette that is the same
 * area; likewise hamstrings and quadriceps on the thigh. Only the trapezius,
 * the latissimus and the glutes are shapes the front has no counterpart for,
 * and those three are drawn — measured against the same landmarks, and large
 * simple forms rather than the fiddly ones that kept going wrong.
 */

/**
 * A region is the muscle's own boundary, traced from the anatomy.
 *
 * FIVE THINGS WERE TRIED AND EACH FAILED IN ITS OWN WAY:
 *
 *   hand-drawn shapes, no clip   never aligned with the body at all
 *   rectangles clipped to it     aligned perfectly, read as bars laid over a
 *                               person, and both overflowed and underflowed
 *                               the muscle they claimed to be
 *   the source's 584 paths       274KB, a runtime fetch, and the striation
 *                               fought the colour
 *   band-bucketed tracing        real boundaries, wrong contents — a band wide
 *                               enough to catch the deltoid also catches the
 *                               top of the pectoral, so highlights spilled onto
 *                               their neighbours
 *   smooth curves by eye         better, and still approximations: the first
 *                               chest sat 50 units low, and the arms sat on the
 *                               ribs rather than on the arms
 *
 * What ships is none of them. Each muscle is selected out of the source by a
 * BOX MEASURED UNDER A 50-UNIT GRID — pectorals 248-612 x 352-545, deltoids
 * 150-290 x 300-490, upper arm 115-255 x 450-655, rectus 350-512 x 545-795 —
 * then rasterised, boundary-traced and corner-rounded. See
 * scripts/gen-body-figure.mjs. The shape of a pec is the shape of that pec, so
 * there is nothing left to overflow: what lights up is the muscle.
 *
 * The same traced shapes, drawn faintly, are the figure's definition. What
 * makes it read as a body and what decides where a highlight lands are one
 * thing, which is why they cannot drift apart.
 */
export type BodyView = "front" | "back";

type Region = { muscle: MuscleGroup; d: string[] };

/**
 * The three posterior forms the front has no counterpart for.
 *
 * Placed against the same landmarks the front boxes came from — the body's
 * proportions do not change when you walk round it. Large, simple shapes on
 * purpose: the fiddly ones are what kept coming out wrong, and a lat is a big
 * plain triangle in any case.
 */
const TRAPS = ["M430,258 C372,262 320,286 292,330 C330,356 380,372 430,376 C480,372 530,356 568,330 C540,286 488,262 430,258 Z"];
const LATS = [
  "M428,392 C374,396 322,420 292,458 C286,516 300,576 328,628 C356,678 392,706 428,714 Z",
  "M432,392 C486,396 538,420 568,458 C574,516 560,576 532,628 C504,678 468,706 432,714 Z",
];
const GLUTES = [
  "M428,760 C376,760 326,780 298,816 C292,864 308,906 342,928 C380,946 412,938 428,912 Z",
  "M432,760 C484,760 534,780 562,816 C568,864 552,906 518,928 C480,946 448,938 432,912 Z",
];

const shapesOf = (muscle: string) => MUSCLE_SHAPES[muscle] ?? [];

const VIEWS: Record<BodyView, Region[]> = {
  front: [
    { muscle: "shoulders", d: shapesOf("shoulders") },
    { muscle: "chest", d: shapesOf("chest") },
    { muscle: "biceps", d: shapesOf("biceps") },
    { muscle: "core", d: shapesOf("core") },
    { muscle: "quads", d: shapesOf("quads") },
  ],
  back: [
    // Traps and lats are one muscle group to this app, and one shape to a
    // person: "my back". Splitting them would rank two things the standards
    // measure as one.
    { muscle: "back", d: [...TRAPS, ...LATS] },
    { muscle: "triceps", d: shapesOf("biceps") },
    { muscle: "glutes", d: GLUTES },
    { muscle: "hamstrings", d: shapesOf("quads") },
  ],
};

/** Faint outlines behind each view. Never the other side's anatomy. */
const DEFINITION: Record<BodyView, string[]> = {
  front: Object.values(MUSCLE_SHAPES).flat(),
  back: [...TRAPS, ...LATS, ...GLUTES,
    ...shapesOf("biceps"), ...shapesOf("quads"), ...shapesOf("calves"), ...shapesOf("forearms")],
};

/**
 * Everything else — forearms, hands, calves, feet, head — is drawn and never
 * ranked, because no lift in the standards has a published bodyweight figure
 * for them. Left neutral rather than tinted grey and called "Untrained": the
 * app inventing a verdict it has no evidence for is the same absent-versus-zero
 * mistake the funnel once made.
 */
const NEUTRAL = "#dbe3ec";

/**
 * How strongly a ranked region wears its tier colour.
 *
 * `resting` is what the figure looks like before anybody touches it, which is
 * the state it spends nearly all of its life in and the one that was blank.
 * `dimmed` is a resting region while something else is selected — still legible
 * as a colour, clearly not the answer to the question just asked. `lit` is the
 * selection.
 */
const FILL = { lit: 0.9, resting: 0.45, dimmed: 0.22 } as const;

/**
 * Each region's own edge, so same-tier neighbours stay two shapes.
 *
 * This is the entire reason tinting everything was rejected the first time: a
 * chest and a pair of shoulders that both reach Advanced take the same gold and
 * read as one mass across the top of the figure. A seam in the region's own
 * colour costs nothing and separates them.
 */
const EDGE = { lit: 1, resting: 0.7, dimmed: 0.35 } as const;


export function BodyStrengthFigure({
  parts,
  selected,
  onSelect,
  view,
  onViewChange,
}: {
  parts: BodyPartStrength[];
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  view: BodyView;
  onViewChange: (v: BodyView) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const byMuscle = new Map(parts.map((p) => [p.muscle, p]));
  const regions = VIEWS[view];

  return (
    <div>
      {/* A segmented control, not a single button: "Back" on a button beside a
          body reads as navigation rather than as the other side of a person. */}
      <div className="mx-auto mb-2 flex w-fit rounded-full bg-white/[0.06] p-1" role="tablist" aria-label="Body view">
        {(["front", "back"] as BodyView[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => { onViewChange(v); onSelect(null); }}
            className={`tap-target min-h-[36px] rounded-full px-5 text-xs font-bold capitalize transition ${
              view === v ? "bg-white/[0.12] text-slate-100" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}
        // 220px, not 190. The bands are sized by anatomy, and at 190 the shoulder
        // yoke came out 40px tall against this codebase's 44px floor — measured,
        // not eyeballed. Shrinking the anatomy to fit the target would have put
        // the chest band across the navel; making the figure bigger costs
        // nothing on a 390px phone and fixes every region at once.
        className="mx-auto block h-auto w-full max-w-[220px] touch-manipulation"
        role="group"
        aria-label="Strength by body part — tap a muscle"
      >
        <defs>
          <clipPath id={`body-${uid}`}>
            <path d={BODY_OUTLINE} />
          </clipPath>
        </defs>

        <g clipPath={`url(#body-${uid})`}>
          <rect
            x="0" y="0" width={BODY_VIEWBOX.width} height={BODY_VIEWBOX.height}
            fill={NEUTRAL} fillOpacity="0.2"
          />

          {regions.map(({ muscle, d }) => {
            const tier = byMuscle.get(muscle)?.tier ?? null;
            const lit = selected === muscle;
            // Three states, not two: resting, resting-while-something-else-is-
            // selected, and selected. The middle one is what lets every muscle
            // carry its rank at rest without a selection getting lost among them.
            const state = lit ? "lit" : selected ? "dimmed" : "resting";
            return (
              <g
                key={muscle}
                onClick={() => onSelect(lit ? null : muscle)}
                role="button"
                aria-label={`${MUSCLE_WORD[muscle]}: ${tier?.name ?? "not ranked yet"}`}
                className="cursor-pointer"
              >
                {d.map((shape, i) => (
                  <path
                    key={i}
                    d={shape}
                    // Transparent rather than absent when there is no colour to
                    // wear: Safari does not dispatch pointer events to a shape
                    // with `fill: none`, so an unranked region would stop being
                    // tappable — and it is exactly the one an athlete taps to
                    // find out why it is blank.
                    fill={tier ? tier.color : "transparent"}
                    fillOpacity={tier ? FILL[state] : 0}
                    stroke={tier ? tier.color : "none"}
                    strokeOpacity={tier ? EDGE[state] : 0}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    className="transition-all duration-300"
                  />
                ))}
              </g>
            );
          })}

          {/* DEFINITION, traced from the source anatomy rather than drawn by
              eye — see lib/body-outline.ts. Painted after the regions so it
              still reads through a lit colour instead of being buried by it. */}
          <g
            fill="none" stroke={NEUTRAL} strokeOpacity="0.34"
            strokeWidth="3.5" strokeLinejoin="round" className="pointer-events-none"
          >
            {DEFINITION[view].map((shape, i) => <path key={i} d={shape} />)}
          </g>
        </g>

        {/* Outline last, so the body keeps a crisp edge over any lit region. */}
        <path
          d={BODY_OUTLINE}
          fill="none"
          stroke={NEUTRAL}
          strokeOpacity="0.6"
          strokeWidth="5"
          strokeLinejoin="round"
          className="pointer-events-none"
        />
      </svg>

      {/* Keyboard and screen-reader access. An <svg> of onClick groups is
          unreachable without a pointer and announces as nothing — the same gap
          BodyMap had before lib/body-map.ts, and the same fix: real buttons,
          off-screen, each stating its own value. */}
      <ul className="sr-only">
        {regions.map(({ muscle }) => {
          const part = byMuscle.get(muscle);
          return (
            <li key={muscle}>
              <button type="button" onClick={() => onSelect(muscle)} onFocus={() => onSelect(muscle)}>
                {MUSCLE_WORD[muscle]}: {part?.tier ? `${part.tier.name}, from ${part.from}` : "not ranked yet"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Every muscle the drawing can show, across both views. */
export const FIGURE_ZONES = [...VIEWS.front, ...VIEWS.back]
  .map((r) => ({ zone: r.muscle as string, muscle: r.muscle }));

/** Exported for the tests that check each region sits on the right muscle. */
export const FIGURE_REGIONS = [...VIEWS.front, ...VIEWS.back];
export const FIGURE_VIEWS = VIEWS;
