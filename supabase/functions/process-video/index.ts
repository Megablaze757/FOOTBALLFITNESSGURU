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
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CV_WORKER_URL, WORKER_API_KEY
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

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: VideoRow | null;
}

Deno.serve(async (req: Request) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const video = payload.record;
  if (!video || payload.type === "DELETE") return json({ skipped: "no record" }, 200);
  // Only process freshly-uploaded videos awaiting analysis.
  if (!["uploading", "processing"].includes(video.status)) {
    return json({ skipped: `status ${video.status}` }, 200);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
