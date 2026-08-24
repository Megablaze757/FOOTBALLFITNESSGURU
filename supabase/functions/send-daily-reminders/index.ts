// =============================================================================
// Supabase Edge Function: send-daily-reminders (Deno)
//
// Invoked by pg_cron each morning. Emails athletes who have gone quiet.
//
// NOT "everybody who has not checked in today", which is what this used to do.
// That is a fine in-app nudge and a bad email: somebody who checks in most days
// got mail for being an hour late, and somebody who had stopped using the app
// got one every single morning, forever — at exactly the person least likely to
// want it. Now it waits for three days of silence, then at most one every three
// days, then gives up after a month.
//
// THE RULE IS lib/checkin-reminder.ts AND THIS IS A COPY OF IT. Deno cannot
// import from lib/, and the Cloudflare Worker — which queues the same reminder
// through the notifications table — does import it. Two senders disagreeing
// about who gets mail is the kind of bug nobody notices from inside the app, so
// lib/checkin-reminder.test.ts reads this file and fails if the numbers drift.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM
// Deploy:  supabase functions deploy send-daily-reminders
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendAndLog } from "../_shared/email.ts";

const FROM = Deno.env.get("REMINDER_FROM") ?? "AI Coach <noreply@example.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

/** Days of silence before the first email, and the gap between repeats. */
const GAP_DAYS = 3;
/** After this long, stop — see lib/checkin-reminder.ts for why. */
const STOP_DAYS = 30;

const day = 86_400_000;
const dateOnly = (iso: string) => iso.slice(0, 10);

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / day);
}

function checkinReminderDue(lastCheckIn: string | null, joined: string, today: string): boolean {
  const gap = daysBetween(lastCheckIn ?? joined, today);
  if (gap < GAP_DAYS) return false;
  if (gap > STOP_DAYS) return false;
  return gap % GAP_DAYS === 0;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const today = dateOnly(new Date().toISOString());
  const since = dateOnly(new Date(Date.parse(`${today}T00:00:00Z`) - STOP_DAYS * day).toISOString());

  // The whole window the rule can read. Through a one-day query a lapsed
  // athlete and one who has never checked in look identical, and they are owed
  // different things.
  const { data: recent } = await supabase
    .from("daily_check_ins")
    .select("user_id, check_in_date")
    .gte("check_in_date", since);
  const lastCheckIn = new Map<string, string>();
  for (const row of recent ?? []) {
    const held = lastCheckIn.get(row.user_id);
    if (!held || row.check_in_date > held) lastCheckIn.set(row.user_id, row.check_in_date);
  }

  // Email addresses come from auth.users (service role only).
  const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return json({ error: error.message }, 500);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, created_at, email_checkin_reminders");
  const joinedById = new Map(
    (profiles ?? [])
      .filter((profile) => profile.email_checkin_reminders !== false)
      .map((profile) => [profile.id, dateOnly(profile.created_at)]),
  );

  let sent = 0;
  let quiet = 0;
  for (const u of list.users) {
    const joined = joinedById.get(u.id);
    if (!u.email || !joined) continue;
    if (!checkinReminderDue(lastCheckIn.get(u.id) ?? null, joined, today)) { quiet++; continue; }
    const away = daysBetween(lastCheckIn.get(u.id) ?? joined, today);
    const ok = await sendAndLog({
      supabase, userId: u.id, type: "checkin_reminder", apiKey: resendKey,
      from: FROM, to: u.email, subject: "Your check-in is waiting 🏃",
      // Says how long it has been, because "log your check-in" to somebody who
      // has been away a fortnight reads like the app has not noticed.
      html: `<p>It has been ${away} days since your last check-in.</p>
             <p>A minute on sleep, fatigue and soreness gets your readiness score back, and your coach stops guessing.</p>
             <p><a href="${APP_URL}/journal">Open today's check-in →</a></p>`,
    });
    if (ok) sent++;
  }

  return json({ reminded: sent, not_due: quiet }, 200);
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
