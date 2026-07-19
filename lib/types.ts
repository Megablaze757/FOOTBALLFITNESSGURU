// Shared domain types for Phase 1.

export type PainMap = Record<string, number>; // e.g. { knee_left: 7, ankle: 0 }

export interface CheckInInput {
  pain_map: PainMap;
  fatigue_score: number | null; // 1-10
  sleep_quality: number | null; // 1-10
  nutrition_quality: number | null; // 1-10
  weight_kg: number | null;
  is_match_day: boolean;
  match_minutes_played: number;
}

export interface DailyCheckIn extends CheckInInput {
  id: string;
  user_id: string;
  check_in_date: string; // ISO date
  created_at: string;
  updated_at: string;
}

export type ReadinessStatus = "Green" | "Yellow" | "Red";

export interface ReadinessResult {
  status: ReadinessStatus;
  score: number; // 0-100, higher = more ready
  advice: string;
  focus_body_part: string | null; // weakest link, if any
}

export type Tier = "bronze" | "silver" | "gold";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "incomplete";

export interface Subscription {
  id: string;
  user_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export type FatigueTrend = "improving" | "stable" | "declining";

export interface DailyInsight {
  id: string;
  user_id: string;
  check_in_id: string;
  risk_score: number | null; // 0..1
  fatigue_trend: FatigueTrend | null;
  ai_summary_text: string | null;
  recommended_action: string | null;
  focus_body_part: string | null;
  created_at: string;
}

export interface StrengthBenchmark {
  id: string;
  user_id: string;
  test_date: string;
  metrics: Record<string, number>;
  notes: string | null;
  created_at: string;
}

// "ready" = uploaded, waiting for you to open it (analysis runs in the browser).
// "analyzed" = in-browser biomechanics done and saved.
export type VideoStatus = "uploading" | "processing" | "ready" | "analyzed" | "failed";

export interface Video {
  id: string;
  user_id: string;
  check_in_id: string | null;
  storage_path: string;
  session_type: "match" | "training" | "recovery" | null;
  is_in_season: boolean;
  status: VideoStatus;
  created_at: string;
}

export interface HeatPoint {
  x: number;
  y: number;
  intensity: number;
}

export interface DrillItem {
  id: string;
  name: string;
  sets: number;
  reps: number;
  targets: string;
}

// Which way the athlete faces the camera. Knee valgus is a frontal-plane
// measurement — it is only meaningful from a front or back view.
export type CameraView = "front" | "side" | "angled" | "unknown";

export interface VideoAnalysis {
  symmetry_score: number;
  form_score: number;   // 0–100 overall movement quality
  rep_count: number;    // detected movement cycles
  view?: CameraView;    // optional: older saved analyses predate this
  confidence?: number;  // 0..1 — how much to trust these numbers
  biomechanics: {
    knee_valgus_left: number;
    knee_valgus_right: number;
    knee_flexion_left: number;
    knee_flexion_right: number;
    // null when the sample rate is too low to resolve it (needs ≥60fps).
    ground_contact_ms: number | null;
  };
  heatmap_data: HeatPoint[];
  root_cause_alert: string | null;
  focus_area: string;
  pose_source: "mediapipe" | "synthetic";
  drills: DrillItem[];
}

export interface AiPlan {
  id: string;
  video_id: string;
  analysis_json: VideoAnalysis;
  drill_program: DrillItem[] | null;
  focus_area: string | null;
}

export interface TrainingDrill {
  name: string;
  sets: number;
  reps: number;
  load_kg?: number | null;
  notes?: string | null;
}

export interface TrainingLog {
  id: string;
  user_id: string;
  log_date: string;
  drills: TrainingDrill[];
  total_minutes: number | null;
  intensity: number | null;
  created_at: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  log_date: string;
  daily_calorie_target: number | null;
  macros: { protein?: number; carbs?: number; fats?: number };
  daily_water_intake_ml: number | null;
}

export interface Program {
  id: string;
  user_id: string;
  goal_type: string;
  goal_notes: string | null;
  plan: import("./coach").ProgramPlan;
  status: "active" | "completed" | "archived";
  start_date: string;
  completed_sessions: string[]; // ["w1d1", ...]
  in_season: boolean;
  target_date: string | null;
  block: number;
  target_metric: string | null;
  target_value: number | null;
  baseline_value: number | null;
  created_at: string;
}

export interface BodyLog {
  id: string;
  user_id: string;
  log_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "athlete" | "coach" | "admin";
  experience_years: number | null;
  bio: string | null;
  sport?: string | null;
  position?: string | null;
  training_focus?: string | null;
  onboarded?: boolean | null;
  level?: string | null;
}
