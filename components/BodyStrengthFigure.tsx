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
 * A region is a smooth muscle-shaped curve; the definition behind it is traced.
 *
 * FOUR THINGS WERE TRIED AND EACH FAILED IN ITS OWN WAY, which is why it ended
 * up split like this:
 *
 *   hand-drawn shapes, no clip   never aligned with the body at all
 *   rectangles clipped to it     aligned perfectly, read as bars laid over a
 *                               person, and both overflowed and underflowed
 *                               the muscle they claimed to be
 *   the source's 584 paths       274KB, a runtime fetch, and the striation
 *                               fought the colour
 *   the traced muscle blobs      real boundaries, but the source's paths are
 *                               slivers of striation rather than whole muscles,
 *                               so the union of them comes out spiky
 *
 * So the two jobs are done by the two things that are good at them. The
 * HIGHLIGHT is a smooth curve — a shape a person would accept as a pec — and it
 * is clipped to the silhouette, so its outer edge is the body's own edge and
 * cannot drift. The DEFINITION is the traced anatomy from lib/body-outline.ts,
 * drawn as thin strokes, so what makes the figure read as a body is measured
 * rather than guessed.
 *
 * EVERY CURVE BELOW IS PLACED FROM A MEASUREMENT, not from an impression. The
 * source was re-rendered under a 100-unit coordinate grid and the landmarks
 * read straight off it: deltoids 300-450, pectorals 330-510, upper arm 380-650,
 * abdominals 515-800, thighs 830-1200. The first pass was done by eye and put
 * the chest 50 units low and 100 too tall, which is exactly the kind of error
 * that looks fine until somebody who trains looks at it.
 *
 * PAIRED MUSCLES ARE TWO SHAPES. You have two deltoids, and lighting a single
 * band across the top of the torso colours the throat.
 */
type Region = { muscle: MuscleGroup; d: string[] };

const REGIONS: Region[] = [
  {
    // Two deltoid caps, not a band across the neck. The band was the first
    // version and it lit the throat.
    muscle: "shoulders",
    d: [
      "M322,296 C268,292 218,318 194,368 C178,404 174,438 180,466 C214,442 254,426 302,416 C314,378 320,334 322,296 Z",
      "M538,296 C592,292 642,318 666,368 C682,404 686,438 680,466 C646,442 606,426 558,416 C546,378 540,334 538,296 Z",
    ],
  },
  {
    // Two pecs meeting at the sternum. Measured, after a first attempt put the
    // chest at y 378-618 when the pectorals are at 330-510 — it read as a bar
    // across the ribs.
    muscle: "chest",
    d: [
      "M428,334 C392,332 352,342 322,360 C306,392 304,432 312,466 C336,494 376,508 428,508 Z",
      "M432,334 C468,332 508,342 538,360 C554,392 556,432 548,466 C524,494 484,508 432,508 Z",
    ],
  },
  {
    muscle: "biceps",
    d: [
      "M302,398 C258,406 226,434 210,474 C196,520 194,576 202,628 C232,616 264,606 292,600 C298,530 302,464 302,398 Z",
      "M558,398 C602,406 634,434 650,474 C664,520 666,576 658,628 C628,616 596,606 568,600 C562,530 558,464 558,398 Z",
    ],
  },
  {
    muscle: "core",
    d: ["M430,516 C388,516 352,524 330,540 C324,600 328,668 340,724 C356,776 390,802 430,806 C470,802 504,776 520,724 C532,668 536,600 530,540 C508,524 472,516 430,516 Z"],
  },
  {
    muscle: "quads",
    d: [
      "M424,838 C376,834 328,846 296,872 C286,930 288,1000 300,1064 C312,1128 336,1176 366,1198 C396,1206 416,1188 424,1156 C428,1050 426,942 424,838 Z",
      "M436,838 C484,834 532,846 564,872 C574,930 572,1000 560,1064 C548,1128 524,1176 494,1198 C464,1206 444,1188 436,1156 C432,1050 434,942 436,838 Z",
    ],
  },
];

/**
 * Everything else — forearms, hands, calves, feet, head — is drawn and never
 * ranked, because no lift in the standards has a published bodyweight figure
 * for them. Left neutral rather than tinted grey and called "Untrained": the
 * app inventing a verdict it has no evidence for is the same absent-versus-zero
 * mistake the funnel once made.
 */
const NEUTRAL = "#dbe3ec";

/**
 * The seams a person reads a body by.
 *
 * A traced silhouette alone is a shadow puppet — correct in outline and flat
 * enough that nothing inside it looks like anything. These are the handful of
 * contours that make a torso read as a torso: the sternum line, the lower
 * border of the pecs, the ab bands, the arm seam, the sweep of each quad.
 *
 * DRAWN, NOT TRACED. The source illustration's own detail is 584 paths and
 * 274KB, and shipping it was tried: the muscle striation fought the region
 * colour and the whole thing had to be fetched at runtime. Eighteen strokes do
 * the same job for a few hundred bytes, and they sit UNDER nothing — they are
 * painted over the lit region so the definition survives being coloured in.
 */
const DEFINITION = [
  "M430,392 L430,846",                                            // sternum to navel
  "M300,414 C330,466 372,492 430,494 C488,492 530,466 560,414",   // lower border of the pecs
  "M318,372 C356,352 392,344 430,344 C468,344 504,352 542,372",   // collarbones
  "M296,352 C286,404 288,452 300,492",                            // left deltoid seam
  "M564,352 C574,404 572,452 560,492",                            // right deltoid seam
  "M352,620 C400,606 460,606 508,620",                            // abs
  "M356,690 C402,678 458,678 504,690",
  "M362,760 C404,750 456,750 498,760",
  "M330,800 C370,872 400,900 430,906 C460,900 490,872 530,800",   // the pelvic V
  "M262,470 C250,536 246,600 250,660",                            // left arm seam
  "M598,470 C610,536 614,600 610,660",                            // right arm seam
  "M430,860 L430,1240",                                           // between the thighs
  "M362,900 C352,986 350,1080 362,1160",                          // left quad sweep
  "M498,900 C508,986 510,1080 498,1160",                          // right quad sweep
  "M338,1246 C372,1262 400,1266 424,1264",                        // knees
  "M522,1246 C488,1262 460,1266 436,1264",
  "M372,1330 C362,1400 364,1450 374,1490",                        // calves
  "M488,1330 C498,1400 496,1450 486,1490",
];

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

          {REGIONS.map(({ muscle, d }) => {
            const tier = byMuscle.get(muscle)?.tier ?? null;
            const lit = selected === muscle;
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

/** Exported for the test that samples the figure for dead spots. */
export const FIGURE_REGIONS = REGIONS;
