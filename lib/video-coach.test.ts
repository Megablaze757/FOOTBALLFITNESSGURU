import { test } from "node:test";
import assert from "node:assert/strict";
import { videoFeedbackRequest, localVideoFeedback } from "./video-coach";
import type { VideoAnalysis } from "./types";

const base: VideoAnalysis = {
  symmetry_score: 78, form_score: 62, rep_count: 5,
  biomechanics: { knee_valgus_left: 14, knee_valgus_right: 6, knee_flexion_left: 95, knee_flexion_right: 96, ground_contact_ms: 220 },
  heatmap_data: [], root_cause_alert: null, focus_area: "stability", pose_source: "mediapipe",
  drills: [{ id: "band_lateral_walk", name: "Band lateral walks", sets: 4, reps: 15, targets: "glute med" }],
};

test("videoFeedbackRequest embeds the metrics + drills", () => {
  const { question, context } = videoFeedbackRequest(base);
  assert.match(question, /Form score 62/);
  assert.match(question, /valgus left 14/);
  assert.equal(context.programDrills[0], "Band lateral walks");
});

test("local fallback flags the worse valgus side + a drill", () => {
  const t = localVideoFeedback(base);
  assert.match(t, /left knee/i);
  assert.match(t, /Band lateral walks/);
});

test("local fallback praises balanced clean movement", () => {
  const clean = { ...base, form_score: 90, symmetry_score: 95, biomechanics: { ...base.biomechanics, knee_valgus_left: 3, knee_valgus_right: 3 } };
  assert.match(localVideoFeedback(clean), /balanced|excellent/i);
});
