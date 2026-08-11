/**
 * Geometry for the semicircular readiness gauge.
 *
 * Lives here rather than inside the component so it can be tested. It was wrong
 * for a long time and nothing could have noticed: the maths sat in a .tsx file,
 * the test suite only covers lib/, and a needle pointing off the bottom of the
 * canvas renders perfectly happily — SVG clips it without complaint.
 *
 * SVG ANGLE CONVENTION, which is what the bug came down to: 0° points RIGHT and
 * positive angles turn CLOCKWISE, because y grows downward. So a speedometer
 * sweeping left -> top -> right runs 180° -> 270° -> 360°, NOT -90° -> +90°.
 */

/** Where the needle points for a score, in SVG degrees. 0 = left, 100 = right. */
export function gaugeAngle(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return GAUGE_START_DEG + (clamped / 100) * 180;
}

/** Left-hand end of the sweep. The arc runs from here, over the top, to 360°. */
export const GAUGE_START_DEG = 180;
export const GAUGE_END_DEG = 360;

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}
