// Turns a video biomechanics analysis into an LLM prompt for a coaching
// narrative (reuses the deployed coach-chat endpoint), plus a deterministic
// local fallback so it always says something useful on GitHub Pages.

import type { VideoAnalysis } from "./types";

export function videoFeedbackRequest(a: VideoAnalysis): {
  question: string;
  context: { goal: string; soreAreas: string[]; readinessStatus: string | null; programDrills: string[] };
} {
  const form = Number.isFinite(a.form_score) ? a.form_score : a.symmetry_score;
  const b = a.biomechanics;
  const question =
    "Give me concise, specific coaching feedback on this movement analysis from my training video. " +
    "Explain what the numbers mean for me and the ONE thing to prioritise. " +
    `Form score ${form}/100. Symmetry ${a.symmetry_score}/100. ` +
    `Knee valgus left ${b.knee_valgus_left}°, right ${b.knee_valgus_right}°. ` +
    `Knee flexion left ${b.knee_flexion_left}°, right ${b.knee_flexion_right}°. ` +
    `Ground contact ${b.ground_contact_ms}ms. Focus area: ${a.focus_area}.` +
    (a.root_cause_alert ? ` Note: ${a.root_cause_alert}` : "");
  return {
    question,
    context: {
      goal: a.focus_area,
      soreAreas: [],
      readinessStatus: null,
      programDrills: (a.drills ?? []).map((d) => d.name),
    },
  };
}

const verdict = (f: number) =>
  f >= 85 ? "excellent" : f >= 70 ? "solid" : f >= 55 ? "a work in progress" : "high-risk and worth prioritising";

export function localVideoFeedback(a: VideoAnalysis): string {
  const form = Number.isFinite(a.form_score) ? a.form_score : a.symmetry_score;
  const b = a.biomechanics;
  const worse = b.knee_valgus_left >= b.knee_valgus_right ? "left" : "right";
  const worseVal = Math.max(b.knee_valgus_left, b.knee_valgus_right);
  const parts: string[] = [];
  parts.push(`Your movement quality is ${verdict(form)} (${form}/100).`);
  if (a.root_cause_alert) {
    parts.push(a.root_cause_alert);
  } else if (worseVal >= 10) {
    parts.push(`Your ${worse} knee drifts inward (${Math.round(worseVal)}° valgus) — that's the main thing to clean up before it costs you power or gets sore.`);
  } else if (a.symmetry_score < 85) {
    parts.push(`Your left and right sides aren't balanced (symmetry ${a.symmetry_score}/100) — even out the load with single-leg work.`);
  } else {
    parts.push("Your mechanics look balanced — now push the intensity while keeping this quality.");
  }
  const first = (a.drills ?? [])[0]?.name;
  if (first) parts.push(`Prioritise ${first} from your plan and re-film in ~2 weeks to track it.`);
  return parts.join(" ");
}
