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
// "paused" is ours, not Stripe's. Stripe leaves a paused subscription reading
// as active, so the Worker translates pause_collection into this — otherwise we
// keep granting Pro to someone we've deliberately stopped charging.
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "incomplete" | "paused";

export interface Subscription {
  id: string;
  user_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  /** Stripe's exact state; `status` above is the app access state. */
  stripe_status?: string | null;
  trial_end?: string | null;
  trial_reminder_created_at?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** When a paused subscription starts billing again. Null unless paused. */
  pause_until?: string | null;
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
  movement?: import("./movement").MovementType | null;
  title?: string | null;
  thumb_data_url?: string | null;
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
  movement?: import("./movement").MovementType;
  findings?: import("./movement").Finding[]; // drill-specific "what to improve"
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
  /** How this movement is measured. Additive inside the drills JSONB. */
  measure?: "reps" | "seconds" | "minutes" | "metres";
  /** Per working set. Timed holds are not disguised as repetitions anymore. */
  duration_seconds?: number | null;
  /** Per working set for carries, sprints and other distance prescriptions. */
  distance_m?: number | null;
  /** Original programme wording, retained so its unit survives into check-in. */
  prescription?: string | null;
  /** Summary. Derived from sets_detail when that is present — see lib/training-sets.ts. */
  sets: number;
  /** Summary: the rounded average when sets varied. Never the source of truth. */
  reps: number;
  /** Summary: the heaviest set. */
  load_kg?: number | null;
  /**
   * Each set as it actually happened. Additive and optional: rows written
   * before per-set logging existed have none, and the three fields above are
   * the whole record for them. Ask lib/training-sets.ts rather than reading
   * either shape directly.
   */
  sets_detail?: { reps: number; load_kg?: number | null; isWarmup?: boolean }[];
  notes?: string | null;
}

export interface TrainingLog {
  id: string;
  user_id: string;
  log_date: string;
  drills: TrainingDrill[];
  total_minutes: number | null;
  /** Exact duration. Added after total_minutes so mm:ss is never rounded away. */
  duration_seconds?: number | null;
  intensity: number | null;
  /** Distance covered. What a runner actually plans in — see migration 0062. */
  distance_km?: number | null;
  /** Original value and unit as entered, alongside canonical distance_km. */
  distance_value?: number | null;
  distance_unit?: "km" | "mi" | null;
  pace_seconds_per_km?: number | null;
  avg_speed_kmh?: number | null;
  /** Contact work, weighted above running minutes in sessionLoad. */
  contact_minutes?: number | null;
  /** Which of the fourteen run types this was — see lib/running.ts, migration 0064. */
  run_type?: import("./running").RunTypeId | null;
  /** The zone actually run, 1–5. May differ from the one the run type prescribes. */
  zone?: import("./running").ZoneId | null;
  /** Average heart rate from a watch. */
  avg_hr?: number | null;
  /**
   * Interval structure — how many efforts, how long each was, how long the jog
   * between them was. See migration 0084 and `intervalEffort` in lib/running.ts,
   * which turns these into the session's intensity instead of asking the athlete
   * to guess it on a slider.
   */
  intervals?: number | null;
  interval_seconds?: number | null;
  recovery_seconds?: number | null;
  /** A deliberately light day still counts as attendance, but not strength volume. */
  session_type?: "workout" | "active_rest" | "rest_day" | null;
  /** Free-text detail for an active-rest day or the session as a whole. */
  notes?: string | null;
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
  /**
   * Prescribed exercise name → the substitute the athlete is doing instead.
   * An overlay, so the plan is never rewritten and a swap can be undone by
   * deleting a key. See migration 0086 and lib/exercise-match.ts.
   */
  swaps?: Record<string, string> | null;
  /** Ordered objectives. Additive: goal_type remains the backwards-compatible anchor. */
  goals?: import("./program-preferences").GoalPreference[] | null;
  /** Custom rotation and advanced generation controls used to build this block. */
  settings?: import("./program-preferences").ProgramSettings | null;
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
  /** Public handle. What leaderboards show, in place of a real name. */
  username?: string | null;
  /** Primary position — kept as positions[0]. */
  position?: string | null;
  /** Every position they play. Skill work covers all of them. */
  positions?: string[] | null;
  training_focus?: string | null;
  onboarded?: boolean | null;
  level?: string | null;
  leaderboard_opt_out?: boolean | null;
  goals?: import("./program-preferences").GoalPreference[] | null;
  saved_exercises?: string[] | null;
  distance_unit?: "km" | "mi" | null;
  calorie_target?: number | null;
  protein_target?: number | null;
  carbs_target?: number | null;
  fats_target?: number | null;
  email_weekly_summary?: boolean | null;
  email_checkin_reminders?: boolean | null;
  email_workout_reminders?: boolean | null;
  email_milestones?: boolean | null;
  email_program_reminders?: boolean | null;
  in_app_training_reminders?: boolean | null;
  health_data_consent_at?: string | null;
  health_data_consent_version?: string | null;
}
