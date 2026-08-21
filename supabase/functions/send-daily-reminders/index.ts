// =============================================================================
// Supabase Edge Function: send-daily-reminders (Deno)
//
// Invoked by pg_cron each morning. Emails users who haven't logged today's
// check-in via Resend.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM
// Deploy:  supabase functions deploy send-daily-reminders
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const today = new Date().toISOString().slice(0, 10);

  // Who already checked in today?
  const { data: done } = await supabase
    .from("daily_check_ins")
    .select("user_id")
    .eq("check_in_date", today);
  const checkedIn = new Set((done ?? []).map((r) => r.user_id));

  // Email addresses come from auth.users (service role only).
  const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return json({ error: error.message }, 500);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const { data: profiles } = await supabase.from("profiles").select("id, email_checkin_reminders");
  const enabled = new Set((profiles ?? []).filter((profile) => profile.email_checkin_reminders !== false).map((profile) => profile.id));
  let sent = 0;
  for (const u of list.users) {
    if (checkedIn.has(u.id) || !u.email || !enabled.has(u.id)) continue;
    const ok = await sendAndLog({
      supabase, userId: u.id, type: "checkin_reminder", apiKey: resendKey,
      from: FROM, to: u.email, subject: "Your daily check-in 🏃",
      html: `<p>Morning! Log how your body feels today to get your readiness score.</p>
             <p><a href="${APP_URL}/journal">Open today's check-in →</a></p>`,
    });
    if (ok) sent++;
  }

  return json({ reminded: sent, skipped_checked_in: checkedIn.size }, 200);
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
