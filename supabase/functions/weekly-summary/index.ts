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

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

interface CheckIn {
  user_id: string;
  fatigue_score: number | null;
  sleep_quality: number | null;
  is_match_day: boolean;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from("daily_check_ins")
    .select("user_id, fatigue_score, sleep_quality, is_match_day")
    .gte("check_in_date", weekAgo);

  // Group by user.
  const byUser = new Map<string, CheckIn[]>();
  for (const r of (rows ?? []) as CheckIn[]) {
    (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(r);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email]));

  let sent = 0;
  for (const [userId, entries] of byUser) {
    const email = emailById.get(userId);
    if (!email || !resendKey) continue;
    if (await sendEmail(resendKey, email, summarize(entries))) sent++;
  }

  return json({ summaries_sent: sent, active_users: byUser.size }, 200);
});

function summarize(entries: CheckIn[]): string {
  const n = entries.length;
  const avg = (sel: (c: CheckIn) => number | null) => {
    const v = entries.map(sel).filter((x): x is number => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–";
  };
  const matches = entries.filter((e) => e.is_match_day).length;
  return `
    <h2>Your week in numbers</h2>
    <ul>
      <li>Check-ins logged: <b>${n}/7</b></li>
      <li>Average sleep: <b>${avg((c) => c.sleep_quality)}/10</b></li>
      <li>Average fatigue: <b>${avg((c) => c.fatigue_score)}/10</b></li>
      <li>Matches played: <b>${matches}</b></li>
    </ul>
    <p><a href="${APP_URL}/dashboard">See your full dashboard →</a></p>`;
}

async function sendEmail(apiKey: string, to: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: "Your weekly recovery summary 📊", html }),
  });
  return res.ok;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
