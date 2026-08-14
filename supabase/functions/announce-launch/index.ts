// =============================================================================
// Supabase Edge Function: announce-launch (Deno)
//
// Emails the waitlist, once, that the app is live. This is the only function in
// the project that sends bulk mail to people who do not have accounts, so it is
// built around the ways that goes wrong rather than around the happy path.
//
//   ADMIN ONLY, VERIFIED SERVER-SIDE. The button is in the admin page, but a
//   button is not a permission check — anyone can POST to a function URL with
//   their own token. The caller's role is read with the service key, from
//   profiles, not from anything the caller can set.
//
//   IDEMPOTENT. Each row is stamped `launch_emailed_at` as it goes, and the
//   query only ever picks rows where that is null. Press the button twice and
//   the second press finds nobody. This matters most on the first press, which
//   is exactly when someone reloads because nothing visibly happened.
//
//   RESUMABLE, because it has to be. Edge Functions have a wall clock and
//   Resend has a rate limit, so a long list cannot go out in one invocation.
//   Each call sends up to `limit` and reports how many remain; the admin page
//   shows that and you press it again. The stamping is what makes repeating it
//   safe.
//
//   DRY RUN FIRST. `{"dryRun": true}` reports exactly who WOULD be mailed and
//   sends nothing. A bulk send you cannot rehearse is one you find out about
//   from the replies.
//
//   NEVER MAILS AN UNSUBSCRIBE. Filtered in the query, not after.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          RESEND_API_KEY, LAUNCH_FROM (or REMINDER_FROM), APP_URL
// Deploy:  supabase functions deploy announce-launch
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { launchEmail } from "./email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/**
 * Default batch size. Resend's lowest paid tier allows well above this per
 * second, but the constraint that actually bites is the function's wall clock
 * — 100 sequential sends is comfortably inside it, 2,000 is not.
 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "not configured" }, 500);

  // --- who is asking -------------------------------------------------------
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "sign in" }, 401);

  const whoRes = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anonKey } });
  if (!whoRes.ok) return json({ error: "sign in" }, 401);
  const who = await whoRes.json() as { id?: string };
  if (!who?.id) return json({ error: "sign in" }, 401);

  const admin = createClient(url, serviceKey);

  // Read with the service key. A caller cannot influence their own row here,
  // and `role` is guarded against self-promotion by 0037 besides.
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", who.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }

  // --- what they asked for -------------------------------------------------
  let body: { dryRun?: boolean; limit?: number; testTo?: string } = {};
  try { body = await req.json(); } catch { /* empty body means defaults */ }
  const dryRun = body.dryRun === true;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));

  /**
   * A TEST SEND, to one address, touching nothing.
   *
   * Reading the copy in a browser is not the same as receiving it. Dark mode,
   * Gmail's CSS stripping, whether the button survives Outlook, whether the
   * subject line gets truncated on a phone — none of that is visible until it
   * lands in an inbox, and the launch send is a bad time to find out.
   *
   * Deliberately BEFORE the waitlist query and returning early: a test must not
   * select anybody, must not stamp anybody, and must not consume a place in the
   * batch. The only thing it shares with the real send is the email itself.
   */
  const testTo = typeof body.testTo === "string" ? body.testTo.trim() : "";
  if (testTo) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) return json({ error: "that is not an email address" }, 400);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY is not set" }, 500);
    const testFrom = Deno.env.get("LAUNCH_FROM") ?? Deno.env.get("REMINDER_FROM");
    if (!testFrom) return json({ error: "LAUNCH_FROM is not set" }, 500);
    const base = Deno.env.get("APP_URL") ?? "https://pocketathlete.com";

    // If this address is on the waitlist, use its real token so the unsubscribe
    // link is genuinely clickable — but DO NOT mark them as emailed, or testing
    // the copy would quietly remove someone from the real send.
    const { data: own } = await admin
      .from("waitlist").select("unsub_token, referral_code, source")
      .eq("email", testTo.toLowerCase()).maybeSingle();
    const row = own as { unsub_token?: string; referral_code?: string | null; source?: string | null } | null;

    const mail = launchEmail({
      appUrl: base,
      ref: row?.referral_code ?? row?.source ?? null,
      unsubscribeUrl: `${base}/unsubscribe?t=${encodeURIComponent(row?.unsub_token ?? crypto.randomUUID())}`,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: testFrom,
        to: testTo,
        subject: `[TEST] ${mail.subject}`,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) return json({ error: `Resend refused it: ${await res.text()}` }, 502);
    return json({
      test: true,
      to: testTo,
      onWaitlist: Boolean(row),
      // Said plainly, because a dead link in a test read as a bug otherwise.
      note: row
        ? "Sent. You are on the waitlist, so the unsubscribe link in it is real — clicking it will unsubscribe you."
        : "Sent. You are not on the waitlist, so the unsubscribe link is a placeholder and will say the link didn't work.",
    }, 200);
  }

  // Only people who have not unsubscribed and have not already been told.
  const { data: rows, error } = await admin
    .from("waitlist")
    .select("id, email, referral_code, source, unsub_token")
    .is("unsubscribed_at", null)
    .is("launch_emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  const { count: remainingBefore } = await admin
    .from("waitlist").select("id", { count: "exact", head: true })
    .is("unsubscribed_at", null).is("launch_emailed_at", null);

  const pending = (rows ?? []) as {
    id: string; email: string; referral_code: string | null; source: string | null; unsub_token: string;
  }[];

  if (dryRun) {
    return json({
      dryRun: true,
      wouldSend: pending.length,
      remaining: remainingBefore ?? 0,
      sample: pending.slice(0, 3).map((r) => ({
        email: maskEmail(r.email),
        ref: r.referral_code ?? r.source ?? null,
      })),
    }, 200);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "RESEND_API_KEY is not set" }, 500);
  const from = Deno.env.get("LAUNCH_FROM") ?? Deno.env.get("REMINDER_FROM");
  if (!from) return json({ error: "LAUNCH_FROM is not set" }, 500);
  const appUrl = Deno.env.get("APP_URL") ?? "https://pocketathlete.com";

  let sent = 0;
  const failed: string[] = [];
  for (const row of pending) {
    // The code that brought them in. Attribution does not actually depend on
    // this — 0057 binds the email to its referrer and signup reads that ledger
    // — but it covers the person who signs up with a different address.
    const ref = row.referral_code ?? row.source ?? null;
    const mail = launchEmail({
      appUrl,
      ref,
      unsubscribeUrl: `${appUrl}/unsubscribe?t=${encodeURIComponent(row.unsub_token)}`,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: row.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        // One-click unsubscribe. Gmail and Yahoo require this on bulk mail, and
        // without it a launch send is a deliverability problem for every email
        // the app sends afterwards — including password resets.
        headers: {
          "List-Unsubscribe": `<${appUrl}/unsubscribe?t=${encodeURIComponent(row.unsub_token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    if (!res.ok) { failed.push(row.email); continue; }

    // Stamp AFTER a confirmed send, one row at a time. Stamping the batch up
    // front would silently drop anyone whose send failed; stamping at the end
    // would re-send everyone if the function is killed mid-batch. Per-row, after
    // the fact, is the only version where a crash costs at most one duplicate.
    const { error: markErr } = await admin
      .from("waitlist").update({ launch_emailed_at: new Date().toISOString() }).eq("id", row.id);
    if (markErr) console.error("sent but not marked:", row.id, markErr.message);
    sent++;
  }

  const { count: remainingAfter } = await admin
    .from("waitlist").select("id", { count: "exact", head: true })
    .is("unsubscribed_at", null).is("launch_emailed_at", null);

  return json({ sent, failed: failed.length, remaining: remainingAfter ?? 0 }, 200);
});

/** Enough to recognise an address in a dry run, not enough to harvest a list. */
function maskEmail(email: string): string {
  const [name, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
