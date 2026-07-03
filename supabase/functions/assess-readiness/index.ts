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
}
type ReadinessStatus = "Green" | "Yellow" | "Red";

const PAIN_HARD_LIMIT = 7;
const SLEEP_HARD_LIMIT = 3;

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

  const score = Math.round(
    (0.35 * painGood + 0.3 * sleepGood + 0.25 * fatigueGood + 0.1 * nutritionGood) * 100
  );

  let status: ReadinessStatus;
  if (pain.value >= PAIN_HARD_LIMIT || sleep <= SLEEP_HARD_LIMIT) status = "Red";
  else if (score >= 70) status = "Green";
  else if (score >= 45) status = "Yellow";
  else status = "Red";

  let advice: string;
  if (status === "Red" && pain.value >= PAIN_HARD_LIMIT && focus) {
    advice = `${cap(focus)} pain is high (${pain.value}/10). Skip sprints today — focus on gentle mobility and static stretching around the area.`;
  } else if (status === "Red" && sleep <= SLEEP_HARD_LIMIT) {
    advice = `Sleep quality is very low (${sleep}/10). Prioritise rest and light recovery work; heavy training now raises injury risk.`;
  } else if (status === "Red") {
    advice = "Your overall load is high. Treat today as active recovery: stretching, mobility and hydration.";
  } else if (status === "Yellow") {
    advice = focus && pain.value > 0
      ? `Mostly recovered, but watch your ${focus} (${pain.value}/10). Keep intensity moderate and warm up thoroughly.`
      : "You're moderately ready. Train as planned but ease off if anything flares up.";
  } else {
    advice = "You're well recovered and ready to go. Good day for a higher-intensity session.";
  }

  return { status, score, advice, focus_body_part: focus };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
