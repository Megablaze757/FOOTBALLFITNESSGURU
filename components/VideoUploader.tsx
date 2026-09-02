"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MOVEMENTS, type MovementType } from "@/lib/movement";
import { sportTerms } from "@/lib/sport-terms";
import { MAX_CLIP_SECONDS } from "@/components/InBrowserAnalysis";
import { todayLocal } from "@/lib/day";
import { VIDEO_QUOTA, PAID_TIER, planFor } from "@/lib/subscription";
import type { Tier } from "@/lib/types";

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
  /**
   * A PLAYABLE preview of the chosen clip, which is a different job from the
   * poster frame above.
   *
   * `preview` is a canvas grab, used as the stored thumbnail for the clip list.
   * It is also asynchronous, takes up to 13 seconds before it gives up, and
   * returns null outright for codecs the browser cannot decode. The confirmation
   * card used to be gated on it — so while it worked, or whenever it failed, the
   * box still read "Choose or drop a video" as though nothing had been picked,
   * with a name field and an Upload button underneath it.
   *
   * A phone camera roll is full of near-identical clips of the same lift. The
   * only reliable way to know you picked the right one is to watch it.
   */
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  /** From the <video> itself, which knows better than the canvas grab does. */
  const [duration, setDuration] = useState<number | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [done, setDone] = useState(false);
  // Turns the error into an upgrade route rather than a dead end. "locked" and
  // "used up" are different sentences: one is a price, the other is a wait.
  const [atCap, setAtCap] = useState<null | "locked" | "used-up">(null);
  const thumbFor = useRef<File | null>(null);
  // Held so the label's hidden input can be reached if we ever need to open the
  // picker programmatically. The tiles deliberately do NOT do that any more —
  // a file dialog appearing when you tap "Squat / lift" is a surprise when
  // there is a visible upload box directly below.
  const fileInput = useRef<HTMLInputElement>(null);

  // Build the poster frame as soon as a file is picked. This is for the clip
  // list later — the athlete's confirmation is the player below, which does not
  // wait on this.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    let live = true;
    thumbFor.current = file;
    setPreview(null);
    void makeThumb(file).then((t) => { if (live && thumbFor.current === file) setPreview(t); });
    return () => { live = false; };
  }, [file]);

  /**
   * The playable preview. Synchronous — the URL exists the instant a file is
   * chosen, so the card appears immediately rather than after a decode.
   *
   * Revoked on every change and on unmount: a 60MB blob held after the picker
   * has moved on is 60MB of memory on a phone, and this component is mounted on
   * a page people revisit.
   */
  useEffect(() => {
    if (!file) { setObjectUrl(null); setDuration(null); setPreviewBroken(false); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setDuration(null);
    setPreviewBroken(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /**
   * Clearing has to reset the input too, not just the state.
   *
   * <input type="file"> fires `change` only when the value CHANGES, so after
   * "Change" the picker would open, you would tap the same clip again to check
   * it, and nothing at all would happen — the one interaction most likely to
   * follow "is this the right video?".
   */
  function clearFile() {
    setFile(null);
    setDone(false);
    if (fileInput.current) fileInput.current.value = "";
  }

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

    const today = todayLocal();
    const { data: checkIn } = await supabase
      .from("daily_check_ins").select("id").eq("user_id", user.id).eq("check_in_date", today).maybeSingle();

    // The bucket enforces this too, but its rejection is an opaque 413 — say
    // what's wrong while the athlete still has the file in front of them.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That clip is ${(file.size / 1048576).toFixed(0)}MB — the limit is ${MAX_UPLOAD_MB}MB. Only the first ${MAX_CLIP_SECONDS}s is analysed, so a short clip of the movement works better anyway.`);
      setBusy(false);
      return;
    }

    /**
     * THE MONTHLY CAP, CHECKED BEFORE THE BYTES MOVE.
     *
     * `videos: insert own` (migration 0036) counts this month's rows inside the
     * RLS policy, against `video_quota()` — 40 on Pro and 0 on free, since
     * video analysis is a paid feature (0073). That is the right place to
     * enforce it, because a client-side check only stops honest users.
     *
     * But the ORDER here was wrong, and it is why "upload not working" had no
     * useful symptom. The file went to storage first and the row second, so
     * someone at their cap waited out a full 60MB upload on mobile data, then
     * got `new row violates row-level security policy for table "videos"`,
     * then had the upload silently deleted again. A database sentence about a
     * policy, after a two-minute wait, for a limit nothing had mentioned.
     *
     * One cheap count first. It cannot replace the policy — a race or a direct
     * REST call still hits the real check below — but it turns the common case
     * into an instant, honest answer instead of a slow, cryptic one.
     */
    const monthStart = `${todayLocal().slice(0, 7)}-01T00:00:00.000Z`;
    const [{ count: usedThisMonth }, { data: subRow }] = await Promise.all([
      supabase.from("videos").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", monthStart),
      supabase.from("subscriptions").select("tier, status").eq("user_id", user.id).maybeSingle(),
    ]);
    const tier: Tier = subRow?.status === "active" && subRow.tier ? subRow.tier : "bronze";
    const quota = VIDEO_QUOTA[tier];
    /**
     * A QUOTA OF ZERO IS NOT A QUOTA, IT IS A PAYWALL, and it has to say so.
     *
     * Free used to get three clips and now gets none, which sends it down this
     * branch — where the copy read "you've used all 0 of this month's uploads",
     * a sentence that is true, absurd, and tells someone who has never uploaded
     * anything that they are out of something. The two states need different
     * words: "you've run out" is a wait, "this is Pro" is a price.
     */
    if (quota === 0) {
      setError(
        `Video analysis is part of ${planFor(PAID_TIER).name}. Film a lift on your phone and ` +
        `it's scored on your phone — tempo, depth, bar path — with the drills to fix what it finds.`
      );
      setAtCap("locked");
      setBusy(false);
      return;
    }
    if ((usedThisMonth ?? 0) >= quota) {
      setError(
        `You've used all ${quota} of this month's uploads on ${planFor(tier).name}. ` +
        `The cap resets on the 1st. Clips you've already uploaded still analyse as ` +
        `many times as you like.`
      );
      setAtCap("used-up");
      setBusy(false);
      return;
    }

    const ext = file.name.split(".").pop() || "mp4";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type || "video/mp4" });
    if (upErr) {
      // The bucket's own limits speak in HTTP, not English. Both of these are
      // things the athlete can act on, so say which one it was.
      const m = upErr.message || "";
      setError(
        /mime|content type/i.test(m)
          ? `That file type isn't supported — MP4, MOV, WebM or MKV. (${m})`
          : /size|413|too large|exceeded/i.test(m)
            ? `That clip is over the ${MAX_UPLOAD_MB}MB limit. Trim it to the movement itself and it'll go straight through.`
            : `Upload failed: ${m}`
      );
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

      // The quota lives in the RLS policy, so hitting it arrives here as a
      // generic row-level-security violation. Untranslated, that is the message
      // an athlete was being shown for the entirely ordinary event of reaching
      // a documented limit. The pre-flight count above catches this first
      // almost always; this is the race and the direct-API case.
      const isQuota = /row-level security|violates.*policy/i.test(rowErr.message);
      // Which sentence depends on whether they have an allowance at all — a
      // free account reaching this path was never near a limit, it has none.
      if (isQuota) setAtCap(quota === 0 ? "locked" : "used-up");
      setError(
        isQuota
          ? quota === 0
            ? `Video analysis is part of ${planFor(PAID_TIER).name}.`
            : "That's this month's upload limit reached. It resets on the 1st."
          : `Upload failed: ${rowErr.message}`
      );
      setBusy(false);
      return;
    }

    clearFile();
    setTitle("");
    setBusy(false);
    setDone(true);
    onUploaded?.();
  }

  return (
    <form onSubmit={handleUpload} className="card space-y-4 p-5">
      {file ? (
        /* Gated on `file` alone. It used to require the poster frame as well,
           which meant the picker could return a clip and the screen would carry
           on showing an empty dropzone for up to thirteen seconds — or forever,
           if the codec would not decode. */
        <div className="rounded-2xl border border-pitch-400/30 bg-pitch-400/[0.05] p-3">
          {objectUrl && !previewBroken ? (
            <video
              key={objectUrl}
              src={objectUrl}
              controls
              playsInline
              muted
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
              onError={() => setPreviewBroken(true)}
              className="mb-3 max-h-64 w-full rounded-xl bg-black object-contain"
            />
          ) : (
            /* Some phone codecs (HEVC in particular) will not play back in every
               browser. That is not a reason to hide the fact that a file is
               selected — it uploads and analyses regardless, so say so rather
               than leaving a blank space that reads as a failure. */
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-black text-2xl" aria-hidden>🎬</span>
              )}
              <p className="text-xs leading-snug text-slate-400">
                This clip won&apos;t play back in your browser, but it will still upload and analyse
                normally. Check the name and size below.
              </p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-100">{file.name}</div>
              <div className="text-xs text-accent-400">
                ✓ Ready to upload{(duration ?? preview?.seconds) ? ` · ${(duration ?? preview!.seconds).toFixed(1)}s` : ""} · {(file.size / 1048576).toFixed(1)}MB
              </div>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="tap-target shrink-0 text-xs text-slate-400 hover:text-slate-200"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* WHAT DO YOU WANT CHECKED, NOT "CHOOSE A FILE".
              The first thing here was a dashed box and nothing else, for a
              feature that runs pose tracking on your own phone and can tell you
              your knee is collapsing. Nobody uploads a video to find out what an
              app might do with it — and the one control that decides which
              checks can actually run was a <select> further down, after the
              file was already picked.

              The tiles ARE the explanation: nine things it can read, each
              saying what it looks at. Tapping one sets the movement and opens
              the picker, so choosing what you want checked and choosing the
              clip is one gesture. */}
          <span className="field-label">What do you want checked?</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MOVEMENTS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMovement(m.id); setDone(false); }}
                className={`rounded-2xl border p-3 text-left transition ${
                  movement === m.id
                    ? "border-pitch-400/50 bg-pitch-400/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="text-lg" aria-hidden>{m.icon}</span>
                <span className={`mt-1 block text-xs font-bold ${movement === m.id ? "text-accent-400" : "text-slate-200"}`}>
                  {m.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{m.blurb}</span>
              </button>
            ))}
          </div>

          {/* THE UPLOAD BOX STAYS. My first pass replaced it with the tiles
              alone — tapping one opened the picker, which is neat and entirely
              invisible. Nothing on the screen said "this is where you put a
              video", so the page went from under-explained to unusable.

              The tiles refine WHAT gets checked; this is the thing you came to
              do. Both, in that order. */}
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 px-4 py-7 text-center transition hover:border-pitch-400/50 hover:bg-white/[0.03]">
            <span className="text-3xl" aria-hidden>🎬</span>
            <span className="mt-2 text-sm font-semibold text-slate-100">Choose or drop a video</span>
            <span className="mt-1 text-xs text-slate-500">
              MP4 / MOV, up to 30s — one or two reps reads best.
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Analysed on your phone; the clip is never uploaded for processing.
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { setDone(false); setFile(e.target.files?.[0] ?? null); }}
            />
          </label>
        </div>
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

          {/* The movement is already chosen — it's how you got here. Shown as a
              fact with a way back, not asked again. */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span aria-hidden>{MOVEMENTS.find((m) => m.id === movement)?.icon}</span>
            Checking <span className="font-semibold text-slate-200">{MOVEMENTS.find((m) => m.id === movement)?.label}</span>
            <button type="button" onClick={clearFile} className="tap-target text-slate-500 hover:text-accent-400">change</button>
          </div>

          {/* Session type and in-season are for the training-load record, not
              for the analysis. They were two of the four things asked before
              you could press upload; they're one tap away instead. */}
          <details className="group rounded-2xl border border-white/[0.08]">
            <summary className="min-h-[44px] flex cursor-pointer list-none items-center justify-between p-3 text-xs font-semibold text-slate-400">
              <span>Details <span className="font-normal text-slate-600">session type, in-season</span></span>
              <span className="text-slate-600 transition group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] p-3">
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
          </details>
        </>
      )}

      {/* A limit reached is not an error. Red says "you did something wrong,
          try again", and trying again is precisely what cannot work here — so
          the cap gets amber, a plain explanation, and the one thing that
          actually resolves it. */}
      {error && (
        atCap
          ? <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
              <p className="text-sm font-bold text-amber-300">
                {atCap === "locked" ? "Video analysis is a Pro feature" : "Monthly upload limit reached"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{error}</p>
              <Link href="/pricing" className="chip-option chip-option-sm mt-2 border-pitch-400/40 text-accent-400">
                {atCap === "locked" ? `See ${planFor(PAID_TIER).name}` : "See plans"}
              </Link>
            </div>
          : <p className="text-sm text-readiness-red">{error}</p>
      )}
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
