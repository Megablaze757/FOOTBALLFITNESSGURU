// =============================================================================
// Supabase Edge Function: process-daily-state (Deno)
//
// Triggered by a Database Webhook on INSERT/UPDATE of public.daily_check_ins.
// Fetches the user's recent history, calls the Python AI worker, and upserts the
// result into public.daily_insights (service role — bypasses RLS).
//
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided automatically in prod)
//   AI_WORKER_URL        e.g. https://ai-worker.yourdomain.com
//   WORKER_API_KEY       shared secret sent as x-worker-key
//
// Deploy:  supabase functions deploy process-daily-state
// Wire up: Dashboard > Database > Webhooks > new webhook on daily_check_ins
//          (INSERT, UPDATE) -> HTTP POST to this function.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

interface CheckInRow {
  id: string;
  user_id: string;
  check_in_date: string;
  pain_map: Record<string, number> | null;
  sleep_quality: number | null;
  fatigue_score: number | null;
  nutrition_quality: number | null;
  is_match_day: boolean;
  match_minutes_played: number;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: CheckInRow | null;
}

Deno.serve(async (req: Request) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const record = payload.record;
  if (!record || payload.type === "DELETE") {
    return json({ skipped: "no record" }, 200);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull the last 14 days of journal history for this athlete.
  const { data: history, error: histErr } = await supabase
    .from("daily_check_ins")
    .select("check_in_date, pain_map, sleep_quality, fatigue_score, nutrition_quality, is_match_day, match_minutes_played")
    .eq("user_id", record.user_id)
    .order("check_in_date", { ascending: true })
    .limit(14);

  if (histErr) return json({ error: histErr.message }, 500);

  // Recent training load + nutrition so the AI can see progression over time.
  const [{ data: training }, { data: nutrition }] = await Promise.all([
    supabase
      .from("training_logs")
      .select("log_date, drills, total_minutes, intensity")
      .eq("user_id", record.user_id)
      .order("log_date", { ascending: true })
      .limit(14),
    supabase
      .from("nutrition_logs")
      .select("log_date, daily_calorie_target, macros, daily_water_intake_ml")
      .eq("user_id", record.user_id)
      .order("log_date", { ascending: true })
      .limit(14),
  ]);

  const workerPayload = {
    user_id: record.user_id,
    is_in_season: true, // Phase 4 will derive this from season state
    history: (history ?? []).map((r) => ({
      date: r.check_in_date,
      pain: r.pain_map ?? {},
      sleep: r.sleep_quality,
      fatigue: r.fatigue_score,
      nutrition: r.nutrition_quality,
      is_match_day: r.is_match_day,
      match_minutes: r.match_minutes_played,
    })),
    training: (training ?? []).map((t) => ({
      date: t.log_date,
      drills: t.drills ?? [],
      total_minutes: t.total_minutes,
      intensity: t.intensity,
    })),
    nutrition_log: (nutrition ?? []).map((nlog) => ({
      date: nlog.log_date,
      calorie_target: nlog.daily_calorie_target,
      macros: nlog.macros ?? {},
      water_ml: nlog.daily_water_intake_ml,
    })),
  };

  // Call the Python AI worker.
  let insight;
  try {
    const res = await fetch(`${Deno.env.get("AI_WORKER_URL")}/analyze_daily_stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-key": Deno.env.get("WORKER_API_KEY") ?? "",
      },
      body: JSON.stringify(workerPayload),
    });
    if (!res.ok) {
      return json({ error: `worker ${res.status}: ${await res.text()}` }, 502);
    }
    insight = await res.json();
  } catch (e) {
    return json({ error: `worker unreachable: ${e}` }, 502);
  }

  // Persist (one insight per check-in).
  const { error: upsertErr } = await supabase.from("daily_insights").upsert(
    {
      user_id: record.user_id,
      check_in_id: record.id,
      risk_score: insight.risk_score,
      fatigue_trend: insight.fatigue_trend,
      ai_summary_text: insight.ai_summary_text,
      recommended_action: insight.recommended_action,
      focus_body_part: insight.focus_body_part,
    },
    { onConflict: "user_id,check_in_id" },
  );

  if (upsertErr) return json({ error: upsertErr.message }, 500);

  return json({ ok: true, insight }, 200);
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
