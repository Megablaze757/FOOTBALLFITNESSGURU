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

export interface BodyRegion {
  key: string;
  label: string;
  /** Centre, in the figure's own 160x320 coordinate space. */
  cx: number;
  cy: number;
  /** Drawn radius. Presentation only — it has nothing to do with hit-testing. */
  r: number;
}

export const BODY_REGIONS: BodyRegion[] = [
  { key: "head", label: "Head / neck", cx: 80, cy: 36, r: 10 },
  { key: "shoulder_left", label: "L shoulder", cx: 58, cy: 70, r: 9 },
  { key: "shoulder_right", label: "R shoulder", cx: 102, cy: 70, r: 9 },
  { key: "lower_back", label: "Lower back", cx: 80, cy: 120, r: 10 },
  { key: "hip_left", label: "L hip", cx: 66, cy: 148, r: 9 },
  { key: "hip_right", label: "R hip", cx: 94, cy: 148, r: 9 },
  { key: "groin", label: "Groin", cx: 80, cy: 158, r: 9 },
  { key: "hamstring_left", label: "L hamstring", cx: 68, cy: 195, r: 9 },
  { key: "hamstring_right", label: "R hamstring", cx: 92, cy: 195, r: 9 },
  { key: "knee_left", label: "L knee", cx: 68, cy: 235, r: 9 },
  { key: "knee_right", label: "R knee", cx: 92, cy: 235, r: 9 },
  { key: "calf_left", label: "L calf", cx: 68, cy: 262, r: 8 },
  { key: "calf_right", label: "R calf", cx: 92, cy: 262, r: 8 },
  { key: "ankle_left", label: "L ankle", cx: 68, cy: 285, r: 8 },
  { key: "ankle_right", label: "R ankle", cx: 92, cy: 285, r: 8 },
];

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
 * 42 is a little over twice the closest region spacing, so every point on the
 * body itself resolves while the corners of the box stay dead.
 */
export const MAX_TAP_DISTANCE = 42;

export function regionLabel(key: string): string {
  return BODY_REGIONS.find((r) => r.key === key)?.label ?? key;
}

/**
 * The region a tap at (x, y) meant, or null if it wasn't aimed at the body.
 *
 * Ties go to the region defined first, which only matters for a point exactly
 * equidistant between two — but "only matters rarely" is how you get a control
 * that behaves differently on one device.
 */
export function nearestRegion(
  x: number,
  y: number,
  maxDistance: number = MAX_TAP_DISTANCE
): BodyRegion | null {
  let best: BodyRegion | null = null;
  let bestDist = Infinity;
  for (const region of BODY_REGIONS) {
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
