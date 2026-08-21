// Evening reminder for athletes with an active program who have not logged
// training or an explicit rest day today.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM, APP_URL
// Deploy:  supabase functions deploy send-workout-reminders

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);
  const type = `workout_reminder_${today}`;
  const [{ data: programs }, { data: logs }, { data: profiles }, { data: deliveries }, { data: users }] = await Promise.all([
    supabase.from("programs").select("user_id").eq("status", "active"),
    supabase.from("training_logs").select("user_id").eq("log_date", today),
    supabase.from("profiles").select("id, email_workout_reminders").neq("email_workout_reminders", false),
    supabase.from("email_delivery_logs").select("user_id").eq("email_type", type)
      .in("status", ["sent", "delivered", "delayed", "bounced", "complained"]),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const eligible = new Set((profiles ?? []).map((profile) => profile.id));
  const active = new Set((programs ?? []).map((program) => program.user_id));
  const logged = new Set((logs ?? []).map((log) => log.user_id));
  const alreadySent = new Set((deliveries ?? []).map((delivery) => delivery.user_id));
  const emailById = new Map((users?.users ?? []).map((user) => [user.id, user.email]));
  let sent = 0;

  for (const userId of active) {
    const email = emailById.get(userId);
    if (!eligible.has(userId) || logged.has(userId) || alreadySent.has(userId) || !email) continue;
    if (await sendAndLog({
      supabase, userId, type, apiKey: Deno.env.get("RESEND_API_KEY"), from: FROM, to: email,
      subject: "Log today's session or recovery day",
      html: `<p>You have an active program but no training entry for today yet.</p><p>Log your workout, active recovery, or planned rest day so your streak, training load and coach advice stay accurate.</p><p><a href="${APP_URL}/journal">Log today →</a></p>`,
    })) sent++;
  }

  return new Response(JSON.stringify({ workout_reminders_sent: sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
