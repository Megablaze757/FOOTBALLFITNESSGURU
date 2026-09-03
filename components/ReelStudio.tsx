"use client";

import { useMemo, useState } from "react";
import {
  reelDuration, reelFrameSvg, pickMimeType, fileExtension, REEL_FPS,
  inspectRecording, isPostable, type Scene,
} from "@/lib/reel";
import { REEL_KINDS, reelSubjects, type ReelKind } from "@/lib/reel-kinds";
import { captionProblems } from "@/lib/caption";

/**
 * Record a storyboard as a vertical video, in the browser, with no dependency.
 *
 * A canvas is drawn frame by frame and captured with MediaRecorder. The SVG for
 * each frame is rasterised once per SCENE rather than once per frame — a scene
 * is a held card, so redrawing it thirty times a second is thirty times the
 * work for identical pixels. Only the progress bar moves, and it is drawn
 * straight onto the canvas.
 */
async function recordReel(
  scenes: Scene[],
  handle: string,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; postable: boolean; type: string; container: string; h264: boolean }> {
  const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error("This browser cannot record video. Chrome or Safari can.");

  const total = reelDuration(scenes);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d")!;

  // Decoded up front: decoding mid-recording drops frames, and the drop lands
  // exactly on a cut, which is where it is most visible.
  const frames: HTMLImageElement[] = [];
  let at = 0;
  for (const scene of scenes) {
    const img = new Image();
    img.src = "data:image/svg+xml;base64,"
      + btoa(unescape(encodeURIComponent(reelFrameSvg(scenes, at, { handle }))));
    await img.decode();
    frames.push(img);
    at += scene.ms;
  }

  const recorder = new MediaRecorder(canvas.captureStream(REEL_FPS), {
    mimeType: mime.type,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.type }));
  });

  recorder.start();
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = performance.now() - started;
      if (t >= total) return resolve();
      // Which scene, from the storyboard — never from a frame counter, which
      // drifts the moment the tab is throttled.
      let elapsed = 0, index = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (t < elapsed + scenes[i].ms) { index = i; break; }
        elapsed += scenes[i].ms;
      }
      ctx.drawImage(frames[index], 0, 0);
      ctx.fillStyle = "#e3b53f";
      ctx.fillRect(88, 1920 - 190, Math.round((1080 - 176) * (t / total)), 6);
      onProgress(t / total);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  onProgress(1);

  const blob = await done;
  /**
   * Judged on the FILE, not on what was requested. Asking for "video/mp4" and
   * getting one is not the same as getting something Instagram will take:
   * Chromium answers that request with VP9 in an MP4 container.
   */
  const info = inspectRecording(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  return { blob, postable: isPostable(info), type: mime.type, container: info.container, h264: info.h264 };
}

export function ReelStudio() {
  const [kind, setKind] = useState<ReelKind>("drill");
  const [query, setQuery] = useState("");
  const [handle, setHandle] = useState("pocketathlete.com");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const subjects = useMemo(() => reelSubjects(kind), [kind]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? subjects.filter((s) => `${s.label} ${s.note}`.toLowerCase().includes(q))
      : subjects;
    // Capped: 335 recipe rows each rendering a preview is a slow screen for no
    // benefit — the search box is how you reach the rest.
    return list.slice(0, 40);
  }, [subjects, query]);

  async function record(id: string, scenes: Scene[]) {
    setBusy(id); setProgress(0); setError(null); setWarning(null);
    try {
      const { blob, postable, type, container, h264 } = await recordReel(scenes, handle, setProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}-reel.${fileExtension(type)}`;
      a.click();
      URL.revokeObjectURL(url);
      if (!postable) {
        setWarning(container === "mp4" && !h264
          ? "Your browser put VP9 inside the MP4 rather than H.264, which Instagram will not process. "
            + "The file downloaded — convert it to H.264, or record this in Safari."
          : "Your browser recorded WebM, which Instagram will not accept. Convert it to MP4 (H.264), "
            + "or record this in Safari.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <div>
          <span className="field-label">What kind of reel</span>
          <div className="flex flex-wrap gap-2">
            {REEL_KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => { setKind(k.id); setQuery(""); setPreview(null); }}
                aria-pressed={kind === k.id}
                className={`tap-target rounded-full border px-3.5 py-2 text-sm transition ${
                  kind === k.id ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400" : "border-white/10 text-slate-300"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {REEL_KINDS.find((k) => k.id === kind)!.note} · {subjects.length} available
          </p>
        </div>

        <label className="block">
          <span className="field-label">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, sport, muscle, cost…"
            className="field"
          />
        </label>

        <label className="block">
          <span className="field-label">Footer link</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className="field" />
        </label>

        <p className="text-xs text-slate-500">
          1080×1920, cut between held cards. Recorded on this device — nothing is uploaded.
        </p>
        {warning && <p className="text-sm text-readiness-yellow">{warning}</p>}
        {error && <p className="text-sm text-readiness-red">{error}</p>}
      </div>

      {preview && (
        <div className="card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(preview)}`}
            alt="First frame"
            className="mx-auto w-48 rounded-xl border border-white/10"
          />
          <button onClick={() => setPreview(null)} className="tap-target mt-2 w-full py-2 text-xs text-slate-400">
            Close preview
          </button>
        </div>
      )}

      <div className="space-y-3">
        {shown.map((s) => {
          const seconds = Math.round(reelDuration(s.scenes) / 1000);
          const caption = [
            s.scenes[0]?.text,
            "",
            ...s.scenes.slice(1).map((sc) => sc.text),
            "",
            `${handle} — free, and no account needed to look.`,
            "",
            "#pocketathlete #traindeliberately",
          ].join("\n");
          const problems = captionProblems(caption);
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-100">{s.label}</div>
                  <div className="text-xs text-slate-500">{s.note} · {seconds}s · {s.scenes.length} cards</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setPreview(reelFrameSvg(s.scenes, 200, { handle }))}
                    className="tap-target rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => record(s.id, s.scenes)}
                    disabled={!!busy}
                    className="tap-target rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50"
                  >
                    {busy === s.id ? `${Math.round(progress * 100)}%` : "Record"}
                  </button>
                </div>
              </div>
              <details className="mt-2">
                <summary className="tap-target cursor-pointer py-2 text-xs text-slate-500">Caption</summary>
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">{caption}</pre>
                {problems.length > 0 && (
                  <ul className="mt-1 text-xs text-readiness-red">
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(caption)}
                  className="tap-target mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300"
                >
                  Copy caption
                </button>
              </details>
            </div>
          );
        })}
        {subjects.length > shown.length && (
          <p className="text-center text-xs text-slate-500">
            Showing {shown.length} of {subjects.length}. Search to narrow it.
          </p>
        )}
      </div>
    </div>
  );
}
