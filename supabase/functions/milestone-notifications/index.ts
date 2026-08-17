import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM, APP_URL
// Deploy:  supabase functions deploy milestone-notifications

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";
const MILESTONES = [7, 14, 30, 60, 100, 180, 365];

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const since = new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: profiles }, { data: checks }, { data: logs }, { data: users }] = await Promise.all([
    supabase.from("profiles").select("id, email_milestones").neq("email_milestones", false),
    supabase.from("daily_check_ins").select("user_id, check_in_date").gte("check_in_date", since),
    supabase.from("email_delivery_logs").select("user_id, email_type").eq("status", "sent").like("email_type", "streak_%"),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const enabled = new Set((profiles ?? []).map((profile) => profile.id));
  const emailById = new Map((users?.users ?? []).map((user) => [user.id, user.email]));
  const already = new Set((logs ?? []).map((log) => `${log.user_id}:${log.email_type}`));
  const dates = new Map<string, Set<string>>();
  for (const row of checks ?? []) {
    if (!dates.has(row.user_id)) dates.set(row.user_id, new Set());
    dates.get(row.user_id)!.add(row.check_in_date);
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
  return new Response(JSON.stringify({ milestone_emails_sent: sent }), { headers: { "Content-Type": "application/json" } });
});

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
