"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOVEMENTS, type MovementType } from "@/lib/movement";
import { sportTerms } from "@/lib/sport-terms";
import { MAX_CLIP_SECONDS } from "@/components/InBrowserAnalysis";

// Must match the bucket's file_size_limit in migration 0036 — this copy exists
// only to give a useful message before the upload starts.
export const MAX_UPLOAD_MB = 60;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Accepted, but worth a word first. Analysis runs on the phone, and the two
// clips that never finished were 21MB and 42MB against 1.7MB for the two that
// worked — file size is the single best predictor of whether pose tracking
// completes. Advice, not a block: a big clip still analyses, just slower and
// with more chance of falling back to an estimate.
const HEAVY_UPLOAD_BYTES = 15 * 1024 * 1024;

type SessionType = "training" | "match" | "recovery";

// Poster frame for the clip list, grabbed locally before upload. Small enough
// to live in a text column and avoids a second signed-URL round trip per card.
const THUMB_W = 240;

async function makeThumb(file: File): Promise<{ url: string; seconds: number } | null> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = blobUrl;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), 10_000);
      video.onloadeddata = () => { clearTimeout(t); res(); };
      video.onerror = () => { clearTimeout(t); rej(new Error("decode")); };
    });
    // A frame slightly in, so we don't capture a black first frame.
    await new Promise<void>((res) => {
      const t = setTimeout(res, 3_000);
      video.onseeked = () => { clearTimeout(t); res(); };
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4);
    });
    const scale = THUMB_W / (video.videoWidth || THUMB_W);
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = Math.round((video.videoHeight || THUMB_W) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL("image/jpeg", 0.6), seconds: video.duration || 0 };
  } catch {
    return null; // HEVC and friends — the upload still works, just without a poster.
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function VideoUploader({ sport, onUploaded }: { sport?: string; onUploaded?: () => void }) {
  // A runner filming a stride-out shouldn't be offered "Match".
  const terms = sportTerms(sport);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("training");
  const [movement, setMovement] = useState<MovementType>("general");
  const [isInSeason, setIsInSeason] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; seconds: number } | null>(null);
  const [done, setDone] = useState(false);
  const thumbFor = useRef<File | null>(null);

  // Build the preview as soon as a file is picked — that's the confirmation
  // that it actually landed, rather than just a filename.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    let live = true;
    thumbFor.current = file;
    setPreview(null);
    void makeThumb(file).then((t) => { if (live && thumbFor.current === file) setPreview(t); });
    return () => { live = false; };
  }, [file]);

  function defaultTitle(): string {
    const m = MOVEMENTS.find((x) => x.id === movement);
    const base = movement === "general" ? cap(sessionType) : m?.label ?? cap(sessionType);
    return `${base} — ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setBusy(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: checkIn } = await supabase
      .from("daily_check_ins").select("id").eq("user_id", user.id).eq("check_in_date", today).maybeSingle();

    // The bucket enforces this too, but its rejection is an opaque 413 — say
    // what's wrong while the athlete still has the file in front of them.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That clip is ${(file.size / 1048576).toFixed(0)}MB — the limit is ${MAX_UPLOAD_MB}MB. Only the first ${MAX_CLIP_SECONDS}s is analysed, so a short clip of the movement works better anyway.`);
      setBusy(false);
      return;
    }

    const ext = file.name.split(".").pop() || "mp4";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type || "video/mp4" });
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }

    // Analysis happens in the browser when the clip is opened, so an uploaded
    // clip is immediately ready to view/analyse.
    const core = {
      user_id: user.id,
      check_in_id: checkIn?.id ?? null,
      storage_path: path,
      session_type: sessionType,
      is_in_season: isInSeason,
      status: "ready" as const,
    };
    // Recorded so storage cost is attributable per user, and so the admin panel
    // can see who is actually consuming the bucket.
    const extras = {
      size_bytes: file.size,
      title: title.trim() || defaultTitle(),
      thumb_data_url: preview?.url ?? null,
      movement,
    };

    let { error: rowErr } = await supabase.from("videos").insert({ ...core, ...extras });
    // PostgREST caches the table schema, so a freshly-added column can be
    // rejected until it reloads. Losing the poster and name beats losing the
    // upload entirely — save the clip and let the analysis proceed.
    if (rowErr && /schema cache|column/i.test(rowErr.message)) {
      console.warn("videos insert rejected extras, retrying core:", rowErr.message);
      ({ error: rowErr } = await supabase.from("videos").insert(core));
    }
    if (rowErr) {
      // THE ORPHAN LEAK. The file is already in storage by this point, and this
      // path used to return without touching it — so every failed insert left a
      // video nobody could see, in a bucket somebody pays for. There are
      // currently 12 such objects totalling 217MB, and they can never be reached
      // from the app because "visible" means "has a row".
      //
      // Best-effort and deliberately not surfaced: the athlete's problem is that
      // their upload failed, and a second error about cleaning up after it tells
      // them nothing they can act on.
      const { error: cleanupErr } = await supabase.storage.from("videos").remove([path]);
      if (cleanupErr) console.warn("orphaned upload left in storage:", path, cleanupErr.message);

      setError(`Upload failed: ${rowErr.message}`);
      setBusy(false);
      return;
    }

    setFile(null);
    setTitle("");
    setBusy(false);
    setDone(true);
    onUploaded?.();
  }

  return (
    <form onSubmit={handleUpload} className="card space-y-4 p-5">
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-2xl border border-pitch-400/30 bg-pitch-400/[0.05] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-100">{file.name}</div>
            <div className="text-xs text-pitch-400">
              ✓ Ready to upload{preview.seconds ? ` · ${preview.seconds.toFixed(1)}s` : ""} · {(file.size / 1048576).toFixed(1)}MB
            </div>
          </div>
          <button type="button" onClick={() => setFile(null)} className="shrink-0 text-xs text-slate-400 hover:text-slate-200">Change</button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 px-4 py-8 text-center transition hover:border-pitch-400/50 hover:bg-white/[0.03]">
          <span className="text-3xl">🎬</span>
          <span className="mt-2 text-sm font-medium text-slate-200">{file ? `Reading ${file.name}…` : "Choose or drop a video"}</span>
          <span className="mt-1 text-xs text-slate-500">MP4 / MOV — up to 30s. Short clips of one or two reps read best.</span>
          <input type="file" accept="video/*" className="hidden" onChange={(e) => { setDone(false); setFile(e.target.files?.[0] ?? null); }} />
        </label>
      )}

      {file && file.size > HEAVY_UPLOAD_BYTES && (
        <p className="rounded-2xl bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200">
          <span className="font-semibold">This one&apos;s big.</span> Analysis runs on your phone, so a{" "}
          {(file.size / 1048576).toFixed(0)}MB clip is slow and more likely to fall back to an estimate. Trimming
          to just the movement — a couple of seconds — gives a better reading, not a worse one.
        </p>
      )}

      {file && (
        <>
          <label className="block">
            <span className="field-label">Name this clip</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle()}
              maxLength={60}
              className="field"
            />
          </label>

          {/* What the clip shows drives which checks we can actually run. */}
          <label className="block">
            <span className="field-label">What&apos;s in this clip?</span>
            <select value={movement} onChange={(e) => setMovement(e.target.value as MovementType)} className="field [color-scheme:dark]">
              {MOVEMENTS.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.label} — {m.blurb}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Session</span>
              <select value={sessionType} onChange={(e) => setSessionType(e.target.value as SessionType)} className="field [color-scheme:dark]">
                <option value="training">Training</option>
                <option value="match">{terms.eventLabel}</option>
                <option value="recovery">Recovery</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-3">
              <input type="checkbox" checked={isInSeason} onChange={(e) => setIsInSeason(e.target.checked)} className="h-5 w-5 accent-pitch-500" />
              <span className="text-sm text-slate-300">In-season</span>
            </label>
          </div>
        </>
      )}

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      {done && !file && (
        <p className="rounded-xl border border-readiness-green/30 bg-readiness-green/[0.06] px-3 py-2 text-sm text-readiness-green">
          ✓ Uploaded — tap it below to analyse.
        </p>
      )}

      {file && <button type="submit" disabled={busy} className="btn-primary">{busy ? "Uploading…" : "Upload & analyse"}</button>}
    </form>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
