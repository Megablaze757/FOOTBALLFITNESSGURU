"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOVEMENTS, type MovementType } from "@/lib/movement";

type SessionType = "training" | "match" | "recovery";

export function VideoUploader({ onUploaded }: { onUploaded?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("training");
  const [movement, setMovement] = useState<MovementType>("general");
  const [isInSeason, setIsInSeason] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);

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

    const ext = file.name.split(".").pop() || "mp4";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type || "video/mp4" });
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }

    const { error: rowErr } = await supabase.from("videos").insert({
      user_id: user.id,
      check_in_id: checkIn?.id ?? null,
      storage_path: path,
      session_type: sessionType,
      movement,
      is_in_season: isInSeason,
      // Analysis happens in the browser when the clip is opened, so an uploaded
      // clip is immediately ready to view/analyse.
      status: "ready",
    });
    if (rowErr) {
      setError(rowErr.message);
      setBusy(false);
      return;
    }

    setFile(null);
    setBusy(false);
    onUploaded?.();
  }

  return (
    <form onSubmit={handleUpload} className="card space-y-4 p-5">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 px-4 py-8 text-center transition hover:border-pitch-400/50 hover:bg-white/[0.03]">
        <span className="text-3xl">🎬</span>
        <span className="mt-2 text-sm font-medium text-slate-200">{file ? file.name : "Choose or drop a video"}</span>
        <span className="mt-1 text-xs text-slate-500">MP4 / MOV — a few seconds of a drill or sprint</span>
        <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
            <option value="match">Match</option>
            <option value="recovery">Recovery</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-3">
          <input type="checkbox" checked={isInSeason} onChange={(e) => setIsInSeason(e.target.checked)} className="h-5 w-5 accent-pitch-500" />
          <span className="text-sm text-slate-300">In-season</span>
        </label>
      </div>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <button type="submit" disabled={!file || busy} className="btn-primary">{busy ? "Uploading…" : "Upload & analyse"}</button>
    </form>
  );
}
