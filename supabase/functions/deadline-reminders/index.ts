// =============================================================================
// Supabase Edge Function: deadline-reminders (Deno)
//
// Invoked by pg_cron. Emails athletes whose active program target date is within
// the next 7 days, with a nudge on their adherence.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM
// Deploy:  supabase functions deploy deadline-reminders
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data: programs, error } = await supabase
    .from("programs")
    .select("user_id, goal_type, target_date, plan, completed_sessions")
    .eq("status", "active")
    .not("target_date", "is", null)
    .gte("target_date", today)
    .lte("target_date", in7);
  if (error) return json({ error: error.message }, 500);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email]));

  let sent = 0;
  for (const p of programs ?? []) {
    const email = emailById.get(p.user_id);
    if (!email || !resendKey) continue;
    const total = (p.plan?.weeks ?? []).reduce((n: number, w: { sessions: unknown[] }) => n + w.sessions.length, 0);
    const done = (p.completed_sessions ?? []).length;
    const daysLeft = Math.ceil((new Date(p.target_date).getTime() - Date.now()) / 86400_000);
    if (await sendEmail(resendKey, email, p.goal_type, daysLeft, done, total)) sent++;
  }
  return json({ reminded: sent }, 200);
});

async function sendEmail(apiKey: string, to: string, goal: string, daysLeft: number, done: number, total: number): Promise<boolean> {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `⏳ ${daysLeft} days left on your ${goal} goal`,
      html: `<p>Your <b>${goal}</b> program target is <b>${daysLeft} day(s)</b> away — you're <b>${pct}%</b> through the plan (${done}/${total} sessions).</p>
             <p>Stay on it — finish strong.</p>
             <p><a href="${APP_URL}/coach">Open your program →</a></p>`,
    }),
  });
  return res.ok;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
