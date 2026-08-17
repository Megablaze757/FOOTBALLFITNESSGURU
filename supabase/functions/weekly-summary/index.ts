// =============================================================================
// Supabase Edge Function: weekly-summary (Deno)
//
// Invoked by pg_cron weekly. Aggregates each active user's last 7 days and emails
// an HTML recap via Resend.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM
// Deploy:  supabase functions deploy weekly-summary
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

interface CheckIn {
  user_id: string;
  check_in_date: string;
  fatigue_score: number | null;
  sleep_quality: number | null;
  is_match_day: boolean;
  weight_kg: number | null;
}

interface TrainingLog {
  user_id: string;
  total_minutes: number | null;
  duration_seconds: number | null;
  intensity: number | null;
  session_type: string | null;
  drills: Array<{
    sets?: number;
    reps?: number;
    load_kg?: number | null;
    sets_detail?: Array<{ reps?: number; load_kg?: number | null; isWarmup?: boolean }>;
  }> | null;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [{ data: rows }, { data: trainingRows }] = await Promise.all([
    supabase.from("daily_check_ins")
      .select("user_id, check_in_date, fatigue_score, sleep_quality, is_match_day, weight_kg")
      .gte("check_in_date", weekAgo)
      .order("check_in_date", { ascending: true }),
    supabase.from("training_logs")
      .select("user_id, total_minutes, duration_seconds, intensity, session_type, drills")
      .gte("log_date", weekAgo)
      .or("session_type.is.null,session_type.neq.rest_day"),
  ]);

  // Group by user.
  const byUser = new Map<string, CheckIn[]>();
  for (const r of (rows ?? []) as CheckIn[]) {
    (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(r);
  }
  const trainingByUser = new Map<string, TrainingLog[]>();
  for (const row of (trainingRows ?? []) as TrainingLog[]) {
    (trainingByUser.get(row.user_id) ?? trainingByUser.set(row.user_id, []).get(row.user_id)!).push(row);
  }
  const activeUsers = new Set([...byUser.keys(), ...trainingByUser.keys()]);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email]));
  const { data: profiles } = await supabase.from("profiles").select("id, email_weekly_summary");
  const enabled = new Set((profiles ?? []).filter((profile) => profile.email_weekly_summary !== false).map((profile) => profile.id));

  let sent = 0;
  for (const userId of activeUsers) {
    const email = emailById.get(userId);
    if (!email || !enabled.has(userId)) continue;
    if (await sendAndLog({ supabase, userId, type: "weekly_summary", apiKey: resendKey,
      from: FROM, to: email, subject: "Your weekly training summary 📊",
      html: summarize(byUser.get(userId) ?? [], trainingByUser.get(userId) ?? []) })) sent++;
  }

  return json({ summaries_sent: sent, active_users: activeUsers.size }, 200);
});

function summarize(entries: CheckIn[], sessions: TrainingLog[]): string {
  const n = entries.length;
  const avg = (sel: (c: CheckIn) => number | null) => {
    const v = entries.map(sel).filter((x): x is number => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–";
  };
  const matches = entries.filter((e) => e.is_match_day).length;
  const minutes = Math.round(sessions.reduce((sum, session) =>
    sum + (session.duration_seconds != null ? session.duration_seconds / 60 : session.total_minutes ?? 0), 0));
  let workingReps = 0;
  let tonnage = 0;
  for (const session of sessions) {
    for (const drill of session.drills ?? []) {
      const sets = drill.sets_detail?.length
        ? drill.sets_detail.filter((set) => !set.isWarmup)
        : Array.from({ length: drill.sets ?? 0 }, () => ({ reps: drill.reps, load_kg: drill.load_kg }));
      for (const set of sets) {
        const reps = Math.max(0, Number(set.reps) || 0);
        workingReps += reps;
        tonnage += reps * Math.max(0, Number(set.load_kg) || 0);
      }
    }
  }
  const latestWeight = [...entries].reverse().find((entry) => entry.weight_kg != null)?.weight_kg ?? null;
  const calories = latestWeight == null ? null : Math.round(sessions.reduce((sum, session) => {
    const sessionMinutes = session.duration_seconds != null ? session.duration_seconds / 60 : session.total_minutes ?? 0;
    const met = 3 + Math.max(1, Math.min(10, session.intensity ?? 5)) * 0.7;
    return sum + met * 3.5 * latestWeight / 200 * sessionMinutes;
  }, 0));
  const volume = tonnage > 0
    ? `${Math.round(tonnage).toLocaleString()} kg (${workingReps.toLocaleString()} working reps)`
    : `${workingReps.toLocaleString()} working reps`;
  return `
    <h2>Your week in numbers</h2>
    <ul>
      <li>Workouts completed: <b>${sessions.length}</b></li>
      <li>Training time: <b>${minutes} min</b></li>
      <li>Total volume: <b>${volume}</b></li>
      <li>Estimated training calories: <b>${calories == null ? "Log weight to estimate" : `${calories.toLocaleString()} kcal`}</b></li>
      <li>Check-ins logged: <b>${n}/7</b></li>
      <li>Average sleep: <b>${avg((c) => c.sleep_quality)}/10</b></li>
      <li>Average fatigue: <b>${avg((c) => c.fatigue_score)}/10</b></li>
      <li>Matches played: <b>${matches}</b></li>
    </ul>
    <p><a href="${APP_URL}/dashboard">See your full dashboard →</a></p>`;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
