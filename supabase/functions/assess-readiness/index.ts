// =============================================================================
// Supabase Edge Function: assess-readiness (Deno)
//
// Production equivalent of the Next.js /api/assess-readiness route. Keep the
// scoring logic in sync with lib/readiness.ts. In Phase 2 this function will
// instead forward to the Python AI microservice and persist to daily_insights.
//
// Deploy:  supabase functions deploy assess-readiness
// Serve:   supabase functions serve assess-readiness
// =============================================================================

interface PainMap {
  [part: string]: number;
}
interface CheckInInput {
  pain_map: PainMap;
  fatigue_score: number | null;
  sleep_quality: number | null;
  nutrition_quality: number | null;
  // Migration 0115. All four optional, and null for most check-ins — only
  // hours is asked in the quick form. See the renormalising weights below.
  sleep_hours?: number | string | null;
  stress_score?: number | string | null;
  soreness_score?: number | string | null;
  cycle_phase?: string | null;
}
type ReadinessStatus = "Green" | "Yellow" | "Red";

const PAIN_HARD_LIMIT = 7;
const SLEEP_HARD_LIMIT = 3;
const SLEEP_HOURS_HARD_LIMIT = 4;
const SORENESS_SPEAK_UP = 7;

/**
 * THE WEIGHTS, WHICH RENORMALISE. Mirrors WEIGHTS in lib/readiness.ts, and
 * lib/readiness-mirror.test.ts fails if the two stop agreeing — this file
 * scoring a check-in differently from the browser would mean an athlete's
 * number changing according to which backend answered, with nothing to see.
 */
const WEIGHTS = {
  pain: 0.35,
  sleepQuality: 0.3,
  fatigue: 0.25,
  nutrition: 0.1,
  sleepHours: 0.15,
  soreness: 0.2,
  stress: 0.1,
};

const CYCLE_PHASES = ["period", "follicular", "ovulation", "luteal"];

/** Mirrors CYCLE_PHASE_LABELS in lib/cycle.ts. */
const CYCLE_NOTES: Record<string, string> = {
  period: "You logged your period phase. Many athletes train normally through it; some want a lighter day. Both are fine.",
  follicular: "You logged your follicular phase. The days after a period. Often when harder sessions feel most doable.",
  ovulation: "You logged your ovulation phase. Mid-cycle. Often a strong window, and worth noting if yours is not.",
  luteal: "You logged your luteal phase. The run-up to a period. Often heavier legs and a higher effort for the same work.",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Partial<CheckInInput>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const result = assessReadiness({
    pain_map: body.pain_map ?? {},
    fatigue_score: body.fatigue_score ?? null,
    sleep_quality: body.sleep_quality ?? null,
    nutrition_quality: body.nutrition_quality ?? null,
    sleep_hours: body.sleep_hours ?? null,
    stress_score: body.stress_score ?? null,
    soreness_score: body.soreness_score ?? null,
    cycle_phase: body.cycle_phase ?? null,
  });

  return json(result, 200);
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function maxPain(painMap: PainMap): { part: string | null; value: number } {
  let part: string | null = null;
  let value = 0;
  for (const [k, v] of Object.entries(painMap ?? {})) {
    const n = Number(v) || 0;
    if (n > value) {
      value = n;
      part = k;
    }
  }
  return { part, value };
}

function prettyBodyPart(key: string | null): string | null {
  if (!key) return null;
  const parts = key.split("_");
  const side = parts.find((p) => p === "left" || p === "right");
  const joint = parts.filter((p) => p !== "left" && p !== "right").join(" ");
  return side ? `${side} ${joint}` : joint;
}

function clamp1to10(v: number | null): number {
  if (v == null || Number.isNaN(v)) return 5;
  return Math.min(10, Math.max(1, Math.round(v)));
}

function assessReadiness(input: CheckInInput) {
  const sleep = clamp1to10(input.sleep_quality);
  const fatigue = clamp1to10(input.fatigue_score);
  const nutrition = clamp1to10(input.nutrition_quality);
  const pain = maxPain(input.pain_map);
  const focus = prettyBodyPart(pain.part);

  const sleepGood = (sleep - 1) / 9;
  const fatigueGood = (10 - fatigue) / 9;
  const nutritionGood = (nutrition - 1) / 9;
  const painGood = 1 - Math.min(pain.value, 10) / 10;

  /**
   * RENORMALISED OVER THE ANSWERS PRESENT, so a question nobody was asked
   * costs nothing. The alternative — a fixed divisor — would mean every
   * check-in that skipped the optional questions scored lower than the same
   * check-in did before migration 0115, which is the whole app's history
   * silently re-scored.
   */
  const parts: { weight: number; good: number }[] = [
    { weight: WEIGHTS.pain, good: painGood },
    { weight: WEIGHTS.sleepQuality, good: sleepGood },
    { weight: WEIGHTS.fatigue, good: fatigueGood },
    { weight: WEIGHTS.nutrition, good: nutritionGood },
  ];

  const sleepHours = numberOrNull(input.sleep_hours);
  if (sleepHours != null) {
    parts.push({ weight: WEIGHTS.sleepHours, good: sleepHoursGood(sleepHours) });
  }
  const soreness = numberOrNull(input.soreness_score);
  if (soreness != null) {
    parts.push({ weight: WEIGHTS.soreness, good: (10 - clamp1to10(soreness)) / 9 });
  }
  const stress = numberOrNull(input.stress_score);
  if (stress != null) {
    parts.push({ weight: WEIGHTS.stress, good: (10 - clamp1to10(stress)) / 9 });
  }

  const totalWeight = parts.reduce((t, f) => t + f.weight, 0);
  const score = Math.round(
    (parts.reduce((t, f) => t + f.weight * f.good, 0) / totalWeight) * 100
  );

  let status: ReadinessStatus;
  if (
    pain.value >= PAIN_HARD_LIMIT ||
    sleep <= SLEEP_HARD_LIMIT ||
    (sleepHours != null && sleepHours < SLEEP_HOURS_HARD_LIMIT)
  ) status = "Red";
  else if (score >= 70) status = "Green";
  else if (score >= 45) status = "Yellow";
  else status = "Red";

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE SAME SENTENCES AS lib/readiness.ts, WORD FOR WORD.
   *
   * They were not. This file said "Skip sprints today — focus on gentle
   * mobility and static stretching around the area" where the browser says
   * "No sprints today — gentle mobility and stretching around it", and three
   * other lines differed the same way. Nobody wrote two versions on purpose:
   * one was edited and the other was not, under a header asking whoever did
   * it to remember. The numbers were checked after 0115; the words were the
   * half nothing was looking at.
   *
   * WHAT THIS FILE CANNOT MIRROR, and it is better to name it than to leave
   * somebody comparing the two and wondering. The browser's advice also knows
   * about acute:chronic load, whether they have already trained today, and
   * what the watch reported. None of that is in a request to this endpoint —
   * it carries a check-in and nothing else — so those lines have no input
   * here and are absent rather than approximated. lib/readiness-mirror.test.ts
   * compares the branches that exist in both.
   * ═══════════════════════════════════════════════════════════════════════
   */
  let advice: string;
  if (
    soreness != null && soreness >= SORENESS_SPEAK_UP &&
    status !== "Red" && fatigue < 7 && !(focus && pain.value > 0)
  ) {
    advice = `Sore (${soreness}/10) but not wrecked. Train light and move — mobility and easy work beat sitting still.`;
  } else if (status === "Red" && pain.value >= PAIN_HARD_LIMIT && focus) {
    advice = `${cap(focus)} pain is high (${pain.value}/10). No sprints today — gentle mobility and stretching around it.`;
  } else if (status === "Red" && sleepHours != null && sleepHours < SLEEP_HOURS_HARD_LIMIT) {
    const hrs = Number.isInteger(sleepHours) ? `${sleepHours}` : sleepHours.toFixed(1);
    advice = `${hrs} hours' sleep. Rest and light work only — training hard on that is where injuries come from.`;
  } else if (status === "Red" && sleep <= SLEEP_HARD_LIMIT) {
    advice = `Sleep is very low (${sleep}/10). Rest and light work only — heavy training now raises injury risk.`;
  } else if (status === "Red") {
    advice = "Load is high. Active recovery today — stretching, mobility, hydration.";
  } else if (status === "Yellow") {
    advice = focus && pain.value > 0
      ? `Mostly recovered. Watch your ${focus} (${pain.value}/10) — moderate intensity, warm up properly.`
      : fatigue >= 7
        ? "Fatigue is up. A moderate session is fine — no maximal efforts."
        : "Moderately ready. Train as planned, ease off if anything flares up.";
  } else {
    advice = "You're well recovered and ready to go. Good day for a higher-intensity session.";
  }

  /**
   * The cycle phase informs the advice and never the score — see lib/cycle.ts.
   * It is appended AFTER the score and the status are decided, and outside
   * `parts` above, so it cannot reach either.
   */
  const cycle = input.cycle_phase && CYCLE_PHASES.includes(input.cycle_phase)
    ? CYCLE_NOTES[input.cycle_phase]
    : null;

  return { status, score, advice: cycle ? `${advice} ${cycle}` : advice, focus_body_part: focus };
}

/** Mirrors numberOrNull in lib/readiness.ts: "" and junk are not answers. */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mirrors sleepHoursGood in lib/readiness.ts: eight hours is full marks. */
function sleepHoursGood(hours: number): number {
  const h = Math.max(0, Math.min(24, hours));
  return Math.max(0, Math.min(1, h / 8));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
