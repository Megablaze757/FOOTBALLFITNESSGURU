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
 * ONE REGION WEARS COLOUR AT A TIME. Tinting all seven by tier was built and
 * reads as camouflage — and worse, two regions that reach the same tier take
 * the same colour and merge into one shape, so the thing colour was meant to
 * encode becomes unreadable. The body stays neutral, the region you asked about
 * lights up, and the list beside it carries every rank at once in words.
 *
 * FRONT ONLY, ON PURPOSE. There is no comparable public-domain posterior view —
 * both candidates found were raster images in an SVG wrapper. Mirroring the
 * front was considered and rejected: it would claim to show a back while
 * showing a chest. Lats, triceps, glutes and hamstrings are ranked identically
 * and listed beside this, which is honest rather than clever.
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
type Region = { muscle: MuscleGroup };

const REGIONS: Region[] = [
  { muscle: "shoulders" },
  { muscle: "chest" },
  { muscle: "biceps" },
  { muscle: "core" },
  { muscle: "quads" },
];

/**
 * Everything else — forearms, hands, calves, feet, head — is drawn and never
 * ranked, because no lift in the standards has a published bodyweight figure
 * for them. Left neutral rather than tinted grey and called "Untrained": the
 * app inventing a verdict it has no evidence for is the same absent-versus-zero
 * mistake the funnel once made.
 */
const NEUTRAL = "#dbe3ec";


export function BodyStrengthFigure({
  parts,
  selected,
  onSelect,
}: {
  parts: BodyPartStrength[];
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const byMuscle = new Map(parts.map((p) => [p.muscle, p]));

  return (
    <div>
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

          {REGIONS.map(({ muscle }) => {
            const tier = byMuscle.get(muscle)?.tier ?? null;
            const lit = selected === muscle;
            const d = MUSCLE_SHAPES[muscle] ?? [];
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
                    // Transparent rather than absent when unlit: Safari does not
                    // dispatch pointer events to a shape with `fill: none`, so
                    // an unselected region would stop being tappable at all.
                    fill={lit && tier ? tier.color : "transparent"}
                    fillOpacity={lit && tier ? 0.9 : 0}
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
            {Object.values(MUSCLE_SHAPES).flat().map((shape, i) => <path key={i} d={shape} />)}
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
        {REGIONS.map(({ muscle }) => {
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

/** The muscles this drawing can show, so nothing is ranked invisibly. */
export const FIGURE_ZONES = REGIONS.map((r) => ({ zone: r.muscle as string, muscle: r.muscle }));

/** Exported for the tests that check each region sits on the right muscle. */
export const FIGURE_REGIONS = REGIONS.map((r) => ({ ...r, d: MUSCLE_SHAPES[r.muscle] ?? [] }));
