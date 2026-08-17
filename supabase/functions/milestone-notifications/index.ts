import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM, APP_URL
// Deploy:  supabase functions deploy milestone-notifications

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";
const MILESTONES = [7, 14, 21, 30, 60, 100, 180, 365];
const LOWER_IS_BETTER = new Set(["sprint_10m", "sprint_20m", "sprint_40m", "bronco_s", "lane_agility_s", "run_1500m_min", "run_5k_min", "run_10k_min"]);
const METRIC_LABELS: Record<string, string> = {
  squat_1rm: "back squat 1RM", bench_1rm: "bench press 1RM", deadlift_1rm: "deadlift 1RM",
  sprint_10m: "10 m sprint", sprint_20m: "20 m sprint", sprint_40m: "40 m sprint",
  vertical_jump_cm: "vertical jump", yo_yo_level: "Yo-Yo IR1 level", bronco_s: "Bronco test",
  lane_agility_s: "lane agility", run_1500m_min: "1500 m time", run_5k_min: "5K time",
  run_10k_min: "10K time", snatch_1rm: "snatch 1RM", clean_jerk_1rm: "clean & jerk 1RM",
  front_squat_1rm: "front squat 1RM", ohp_1rm: "overhead press 1RM", pullups_max: "max pull-ups",
};

interface GoalProgram {
  id: string;
  user_id: string;
  goal_type: string;
  target_metric: string | null;
  target_value: number | null;
}

interface BenchmarkRow {
  user_id: string;
  metrics: Record<string, unknown> | null;
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: profiles }, { data: checks }, { data: logs }, { data: users }, { data: programs }, { data: benchmarks }] = await Promise.all([
    supabase.from("profiles").select("id, email_milestones").neq("email_milestones", false),
    supabase.from("daily_check_ins").select("user_id, check_in_date").gte("check_in_date", since),
    supabase.from("email_delivery_logs").select("user_id, email_type")
      .in("status", ["sent", "delivered", "delayed", "bounced", "complained"])
      .or("email_type.like.streak_%,email_type.like.goal_%"),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("programs").select("id, user_id, goal_type, target_metric, target_value")
      .eq("status", "active").not("target_metric", "is", null).not("target_value", "is", null),
    supabase.from("strength_benchmarks").select("user_id, metrics").order("test_date", { ascending: false }),
  ]);
  const enabled = new Set((profiles ?? []).map((profile) => profile.id));
  const emailById = new Map((users?.users ?? []).map((user) => [user.id, user.email]));
  const already = new Set((logs ?? []).map((log) => `${log.user_id}:${log.email_type}`));
  const dates = new Map<string, Set<string>>();
  for (const row of checks ?? []) {
    if (!dates.has(row.user_id)) dates.set(row.user_id, new Set());
    dates.get(row.user_id)!.add(row.check_in_date);
  }

  const latestMetrics = new Map<string, Record<string, number>>();
  for (const row of (benchmarks ?? []) as BenchmarkRow[]) {
    const current = latestMetrics.get(row.user_id) ?? {};
    for (const [metric, raw] of Object.entries(row.metrics ?? {})) {
      const value = Number(raw);
      if (!(metric in current) && Number.isFinite(value)) current[metric] = value;
    }
    latestMetrics.set(row.user_id, current);
  }

  let sent = 0;
  for (const userId of enabled) {
    const streak = currentStreak(dates.get(userId) ?? new Set());
    if (!MILESTONES.includes(streak)) continue;
    const type = `streak_${streak}`;
    if (already.has(`${userId}:${type}`)) continue;
    const email = emailById.get(userId);
    if (!email) continue;
    if (await sendAndLog({
      supabase, userId, type, apiKey: Deno.env.get("RESEND_API_KEY"), from: FROM, to: email,
      subject: `🔥 ${streak}-day check-in streak`,
      html: `<h2>${streak} days in a row</h2><p>You have checked in for ${streak} consecutive days. That consistency is what makes the trends useful.</p><p><a href="${APP_URL}/dashboard">See your progress →</a></p>`,
    })) sent++;
  }

  for (const program of (programs ?? []) as GoalProgram[]) {
    if (!enabled.has(program.user_id) || !program.target_metric || program.target_value == null) continue;
    const current = latestMetrics.get(program.user_id)?.[program.target_metric];
    if (current == null || !goalAchieved(program.target_metric, current, Number(program.target_value))) continue;
    const type = `goal_${program.id}_${program.target_metric}`;
    if (already.has(`${program.user_id}:${type}`)) continue;
    const email = emailById.get(program.user_id);
    if (!email) continue;
    const label = METRIC_LABELS[program.target_metric] ?? program.target_metric.replaceAll("_", " ");
    if (await sendAndLog({
      supabase, userId: program.user_id, type, apiKey: Deno.env.get("RESEND_API_KEY"), from: FROM, to: email,
      subject: `🏆 You hit your ${label} goal`,
      html: `<h2>Goal achieved</h2><p>Your latest <b>${label}</b> result is <b>${current}</b>, reaching your target of <b>${program.target_value}</b>.</p><p><a href="${APP_URL}/coach">See your program progress →</a></p>`,
    })) sent++;
  }
  return new Response(JSON.stringify({ milestone_emails_sent: sent }), { headers: { "Content-Type": "application/json" } });
});

function goalAchieved(metric: string, current: number, target: number): boolean {
  return LOWER_IS_BETTER.has(metric) ? current <= target : current >= target;
}

function currentStreak(dates: Set<string>): number {
  let cursor = new Date();
  let iso = cursor.toISOString().slice(0, 10);
  if (!dates.has(iso)) cursor = new Date(cursor.getTime() - 86_400_000);
  let count = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return count;
}
