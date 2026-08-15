// =============================================================================
// The tappable regions of the body figure, and how a tap finds one.
//
// WHY THIS IS A MODULE AND NOT A CONSTANT IN THE COMPONENT.
//
// Fifteen regions sit on a 160x320 figure that renders about 144px wide on a
// phone, so a region dot is roughly 14px across and the only thing that
// responded to a tap was the dot itself. The codebase's own floor is 44px and
// the playbook's ideal is 48; these were a third of that, on the control that
// answers "where does it hurt".
//
// The obvious fix — bigger dots, or an invisible bigger hit circle — cannot
// work here, and the numbers say why. The closest pair (a hip and the groin)
// are 17 user units apart, so a hit radius large enough to matter would have
// each region stealing taps from its neighbour. The regions are close together
// because bodies are; that is not a layout mistake to be fixed by spacing.
//
// So the tap does not have to LAND on anything. The whole figure is one target
// and the nearest region wins, which is how people already think about a body
// map: you point at your knee, not at a 14px circle that represents your knee.
// There are no dead zones and no misses, and it stays correct at any size.
// =============================================================================

/**
 * WHY THE MAP HAS TWO SIDES NOW.
 *
 * It had one, and the one it had was the front, and the front of a thigh is a
 * QUADRICEPS. There was no quad region at all: the list went hamstring at y=195
 * straight to knee at y=235, so an athlete with a quad strain — one of the most
 * common injuries in any running sport — tapped the front of their thigh and
 * marked a hamstring. The one structure on the front of the leg you could name
 * was named after the structure on the back of it.
 *
 * It cannot be fixed by adding quads to a single figure, because then the quad
 * and the hamstring sit on the same pixels and the nearest-region rule has to
 * pick one. They are not in the same place; they are on opposite sides of the
 * same limb, and a drawing that shows one side can only offer one of them.
 *
 * So the same front/back control the strength figure already uses. That is also
 * why it is the same control: an athlete who has turned the body round on the
 * Progress tab should not have to learn a second idiom to do it here.
 */
export type BodyView = "front" | "back";

export interface BodyRegion {
  key: string;
  label: string;
  /** Centre, in the figure's own 160x320 coordinate space. */
  cx: number;
  cy: number;
  /** Drawn radius. Presentation only — it has nothing to do with hit-testing. */
  r: number;
  /**
   * Which side of the body this can be tapped from.
   *
   * Most structures belong to one side. Some genuinely belong to both: a knee
   * hurts from in front or behind, an ankle and a head have no side at all, and
   * the arms hang in the same place whichever way the athlete is facing.
   * Listing those twice is not duplication — it is the difference between a map
   * of a body and a map of a photograph of one.
   */
  views: BodyView[];
}

const BOTH: BodyView[] = ["front", "back"];
const FRONT: BodyView[] = ["front"];
const BACK: BodyView[] = ["back"];

export const BODY_REGIONS: BodyRegion[] = [
  { key: "head", label: "Head / neck", cx: 80, cy: 36, r: 10, views: BOTH },
  // MOVED OUT ONTO THE DELTOIDS when the figure became a real body. On the old
  // stick figure the torso was 40 units wide and 58/102 was its edge, which read
  // as a shoulder; on an anatomical outline the same point is a collarbone.
  { key: "shoulder_left", label: "L shoulder", cx: 50, cy: 74, r: 9, views: BOTH },
  { key: "shoulder_right", label: "R shoulder", cx: 110, cy: 74, r: 9, views: BOTH },
  /**
   * ARMS, WHICH THE MAP HAD NONE OF.
   *
   * The old figure drew each arm as a 12-unit rectangle and the region list
   * stopped at the shoulder, so there was nowhere to report a sore elbow. That
   * was survivable while the arms were sticks. On a figure with visible arms and
   * hands it is not: an athlete taps their elbow, the nearest region is 50 units
   * away, and nothing happens at all.
   *
   * Both come with a rehab protocol in lib/essentials.ts — a region you can mark
   * and get no help for is a worse answer than one that resolves to a neighbour.
   */
  { key: "elbow_left", label: "L elbow", cx: 34, cy: 132, r: 8, views: BOTH },
  { key: "elbow_right", label: "R elbow", cx: 126, cy: 132, r: 8, views: BOTH },
  { key: "wrist_left", label: "L wrist", cx: 26, cy: 186, r: 8, views: BOTH },
  { key: "wrist_right", label: "R wrist", cx: 134, cy: 186, r: 8, views: BOTH },

  // --- Front -----------------------------------------------------------------
  { key: "hip_left", label: "L hip", cx: 66, cy: 148, r: 9, views: FRONT },
  { key: "hip_right", label: "R hip", cx: 94, cy: 148, r: 9, views: FRONT },
  { key: "groin", label: "Groin", cx: 80, cy: 158, r: 9, views: FRONT },
  /**
   * THE ONES THAT WERE MISSING. Placed where the hamstrings used to sit,
   * because that is the front of the thigh and always was.
   */
  { key: "quad_left", label: "L quad", cx: 68, cy: 195, r: 9, views: FRONT },
  { key: "quad_right", label: "R quad", cx: 92, cy: 195, r: 9, views: FRONT },

  // --- Back ------------------------------------------------------------------
  /**
   * ON BOTH SIDES, which is not a compromise but a measurement.
   *
   * Making it back-only left 168 points of the front torso resolving to nothing
   * — the whole midriff between the shoulders at y=74 and the hips at y=148,
   * found by the sweep at the bottom of the test file rather than by looking.
   * The alternative was inventing a front-of-trunk region, and "abs" is not
   * what somebody who has tweaked their back is pointing at. A trunk is one
   * thing to a person indicating it, and the label already says which part.
   */
  // y=120 exactly, not 125. MAX_TAP_DISTANCE below is 33 because the widest gap
  // on the silhouette is the 32 units of upper chest between the shoulders and
  // this point; nudging it down to 125 opened that gap to 35 and left four dead
  // points at the sternum. The two constants are one measurement.
  { key: "lower_back", label: "Lower back", cx: 80, cy: 120, r: 10, views: BOTH },
  { key: "glute_left", label: "L glute", cx: 68, cy: 165, r: 9, views: BACK },
  { key: "glute_right", label: "R glute", cx: 92, cy: 165, r: 9, views: BACK },
  { key: "hamstring_left", label: "L hamstring", cx: 68, cy: 205, r: 9, views: BACK },
  { key: "hamstring_right", label: "R hamstring", cx: 92, cy: 205, r: 9, views: BACK },

  // --- Both ------------------------------------------------------------------
  { key: "knee_left", label: "L knee", cx: 68, cy: 235, r: 9, views: BOTH },
  { key: "knee_right", label: "R knee", cx: 92, cy: 235, r: 9, views: BOTH },
  // Shin from the front, calf from behind, one structure to an athlete pointing
  // at their lower leg. The label says both so the word matches either view.
  { key: "calf_left", label: "L calf / shin", cx: 68, cy: 262, r: 8, views: BOTH },
  { key: "calf_right", label: "R calf / shin", cx: 92, cy: 262, r: 8, views: BOTH },
  { key: "ankle_left", label: "L ankle", cx: 68, cy: 285, r: 8, views: BOTH },
  { key: "ankle_right", label: "R ankle", cx: 92, cy: 285, r: 8, views: BOTH },
];

/** The regions tappable from one side of the body. */
export function regionsInView(view: BodyView): BodyRegion[] {
  return BODY_REGIONS.filter((r) => r.views.includes(view));
}

/** The figure's coordinate space. Hit-testing happens in these units. */
export const BODY_VIEWBOX = { width: 160, height: 320 };

/**
 * How far from a region a tap can land and still count, in figure units.
 *
 * Generous, because being generous is the entire point — but not unlimited. A
 * tap in the empty margin beside the head should do nothing rather than log
 * neck pain, and an unexplained selection is worse than a missed one: the
 * athlete has to notice it happened before they can undo it.
 *
 * TIGHTENED FROM 42 WHEN THE ARMS ARRIVED. At 42 a tap in the empty margin
 * beside the torso resolved, because the nearest region was now a wrist — an
 * unexplained selection, which is the failure this cap exists to prevent.
 *
 * 33 rather than 30, and the three units are load-bearing: the widest gap
 * anywhere on the silhouette is 32 units, in the upper chest between the
 * shoulders and the lower back. Measured by sweeping the outline itself rather
 * than its bounding box — an anatomical figure has real empty space beside the
 * head and between the legs, so a box sweep asks thin air to resolve.
 */
export const MAX_TAP_DISTANCE = 33;

export function regionLabel(key: string): string {
  return BODY_REGIONS.find((r) => r.key === key)?.label ?? key;
}

/**
 * The region a tap at (x, y) meant, or null if it wasn't aimed at the body.
 *
 * SEARCHES ONLY THE SIDE ON SCREEN. A tap on the thigh has to mean the quad
 * when the front is showing and the hamstring when the back is, and those two
 * sit on the same pixels — the view is the only thing that separates them, so
 * it cannot be an afterthought applied to the result.
 *
 * Ties go to the region defined first, which only matters for a point exactly
 * equidistant between two — but "only matters rarely" is how you get a control
 * that behaves differently on one device.
 */
export function nearestRegion(
  x: number,
  y: number,
  view: BodyView = "front",
  maxDistance: number = MAX_TAP_DISTANCE
): BodyRegion | null {
  let best: BodyRegion | null = null;
  let bestDist = Infinity;
  for (const region of BODY_REGIONS) {
    if (!region.views.includes(view)) continue;
    const dx = x - region.cx;
    const dy = y - region.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = region;
    }
  }
  return bestDist <= maxDistance ? best : null;
}

/** The side a marked region lives on, so a stored pain map can show itself. */
export function viewOfRegion(key: string): BodyView {
  const region = BODY_REGIONS.find((r) => r.key === key);
  return region && !region.views.includes("front") ? "back" : "front";
}
