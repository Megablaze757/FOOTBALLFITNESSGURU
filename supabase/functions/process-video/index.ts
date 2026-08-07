// =============================================================================
// Supabase Edge Function: process-video (Deno)
//
// Triggered by a Database Webhook on INSERT of public.videos. Creates a signed
// URL for the uploaded object, calls the Python CV worker, writes ai_plans, and
// flips videos.status to 'ready' (or 'failed').
//
// (We trigger off the videos row, not a Storage webhook, so the analysis can map
// cleanly back to a row and we control ret/status — Storage webhooks can't.)
//
// THE PAYLOAD IS A HINT, NOT A SOURCE OF TRUTH.
//
// This function runs with the SERVICE ROLE — it bypasses RLS entirely — and it
// used to take `user_id`, `storage_path` and `check_in_id` straight out of the
// request body. It is deployed with ordinary JWT verification, so "the caller
// is signed in" was the only check standing between any account and a forged
// webhook. Being authenticated is not being authorised, and the record in the
// body was never verified to be a record at all.
//
// What that allowed, for any signed-in user who could guess a row id:
//
//   * upsert into `ai_plans` with somebody else's `user_id` — a fabricated
//     biomechanics analysis and drill program appearing in another athlete's
//     account, in an app whose whole purpose is managing injury risk;
//   * flip any `videos` row to processing/ready/failed, breaking other people's
//     uploads;
//   * mint a signed URL for any path in the videos bucket, and read any
//     check-in's pain map, by naming them.
//
// The fix is to use the payload for ONE thing — which row to look at — and read
// every field that matters back from the table with the service role. A forged
// body can then at most re-trigger processing of a video that genuinely exists
// and is genuinely pending, which is a rate-limit problem, not a data-integrity
// one. WEBHOOK_SECRET closes that last gap when it is configured.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CV_WORKER_URL, WORKER_API_KEY
// Optional: WEBHOOK_SECRET — when set, the caller must send it as x-webhook-secret.
//           Configure the same value on the Database Webhook's headers.
// Deploy:  supabase functions deploy process-video
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

interface VideoRow {
  id: string;
  user_id: string;
  check_in_id: string | null;
  storage_path: string;
  session_type: string | null;
  is_in_season: boolean;
  status: string;
}

/**
 * Only `record.id` is read from this. The rest of the row is deliberately typed
 * as unknown-ish so nothing downstream can quietly start trusting it again.
 */
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: { id?: string } | null;
}

Deno.serve(async (req: Request) => {
  // When a secret is configured, the caller must present it. Left unset this is
  // skipped rather than failing every existing webhook on deploy — the row
  // re-read below is what actually protects the data, and this is the layer
  // that stops strangers spending our CV worker budget.
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Only the row ID is taken from the caller. Everything else is read back.
  const recordId = payload.record?.id;
  if (!recordId || payload.type === "DELETE") return json({ skipped: "no record" }, 200);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // THE ROW AS THE DATABASE HAS IT, not as the caller described it. This single
  // read is what makes a forged payload harmless: user_id, storage_path and
  // check_in_id below are now facts, and cannot name another athlete's data.
  const { data: video, error: readErr } = await supabase
    .from("videos")
    .select("id, user_id, check_in_id, storage_path, session_type, is_in_season, status")
    .eq("id", recordId)
    .maybeSingle<VideoRow>();
  if (readErr) return json({ error: `read video: ${readErr.message}` }, 500);
  if (!video) return json({ skipped: "no such video" }, 200);

  // Only process freshly-uploaded videos awaiting analysis. Checked against the
  // stored status, so a payload claiming "uploading" cannot reopen a finished
  // one.
  if (!["uploading", "processing"].includes(video.status)) {
    return json({ skipped: `status ${video.status}` }, 200);
  }

  try {
    await supabase.from("videos").update({ status: "processing" }).eq("id", video.id);

    // Signed URL the worker can download.
    const { data: signed, error: signErr } = await supabase.storage
      .from("videos")
      .createSignedUrl(video.storage_path, 600);
    if (signErr || !signed) throw new Error(`sign url: ${signErr?.message}`);

    // Pull pain data from the linked check-in (if any) for root-cause correlation.
    let painMap: Record<string, number> = {};
    if (video.check_in_id) {
      const { data: ci } = await supabase
        .from("daily_check_ins")
        .select("pain_map")
        .eq("id", video.check_in_id)
        .maybeSingle();
      painMap = ci?.pain_map ?? {};
    }

    const res = await fetch(`${Deno.env.get("CV_WORKER_URL")}/process_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-key": Deno.env.get("WORKER_API_KEY") ?? "",
      },
      body: JSON.stringify({
        video_id: video.id,
        user_id: video.user_id,
        video_url: signed.signedUrl,
        session_type: video.session_type,
        is_in_season: video.is_in_season,
        pain_map: painMap,
      }),
    });
    if (!res.ok) throw new Error(`worker ${res.status}: ${await res.text()}`);
    const analysis = await res.json();

    const { error: planErr } = await supabase.from("ai_plans").upsert(
      {
        user_id: video.user_id,
        video_id: video.id,
        analysis_json: analysis, // full result: heatmap, symmetry, biomechanics, alert
        drill_program: analysis.drills,
        focus_area: analysis.focus_area,
      },
      { onConflict: "video_id" },
    );
    if (planErr) throw new Error(`ai_plans: ${planErr.message}`);

    await supabase.from("videos").update({ status: "ready" }).eq("id", video.id);
    return json({ ok: true }, 200);
  } catch (e) {
    await supabase.from("videos").update({ status: "failed" }).eq("id", video.id);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
