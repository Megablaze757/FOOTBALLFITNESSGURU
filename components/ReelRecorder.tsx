"use client";

import { useEffect, useRef, useState } from "react";
import {
  SCRIPTS, reelScript, scriptProblems, readTimeMs, type ReelScript, type ScriptId,
} from "@/lib/reel-script";
import { pickMimeType, inspectRecording, isPostable, fileExtension } from "@/lib/reel";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILM THE APP, NOT A SLIDESHOW OF FACTS ABOUT IT.
 *
 * The reel studio next door draws SVG cards onto a canvas and records the
 * canvas. Every figure on them is true and the result is text sliding over a
 * gradient — which is the format people scroll past fastest, because nothing on
 * screen could not have been a screenshot.
 *
 * This records the SCREEN. A readiness score dropping after a bad night, a
 * shopping list pricing itself, a program rebuilding around a missed session:
 * those are moving pictures of something happening, and they are the only
 * footage the app can offer that a competitor cannot fake.
 *
 * WHAT IT CANNOT DO, said plainly because the alternative is somebody expecting
 * it to. It cannot start recording on its own — getDisplayMedia needs a click
 * and then a human choosing what to share, by design, and no amount of code
 * gets around that. It cannot drive the app for you: the recording is of
 * whatever you do. What it CAN do is hold the shot list on screen, count you
 * through the beats at the pace the narration needs, and hand you a file the
 * platforms will accept.
 *
 * THE VOICE IS YOURS. Browser speech synthesis cannot be captured into a
 * MediaStream in any browser this would ship to, so a generated voiceover
 * cannot be recorded — and an AI voice on a reel about doing the work properly
 * would be the wrong instinct anyway. The microphone is mixed into the
 * recording live, and the line to say is on screen when it is due.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ReelRecorder() {
  const [scriptId, setScriptId] = useState<ScriptId>("demo-readiness");
  const [withVoice, setWithVoice] = useState(true);
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; postable: boolean; note: string } | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStreamTrack[]>([]);
  const started = useRef(0);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * iOS CANNOT DO THIS AT ALL, AND SAYING SO BEFOREHAND IS THE FEATURE.
   *
   * `navigator.mediaDevices.getDisplayMedia is not a function` — which is what
   * an iPhone gives you, because Safari on iOS does not implement screen
   * capture from a web page for any origin, secure or not. There is no flag and
   * no permission to grant.
   *
   * Shipped without this check, the button looked available, was tapped, and
   * threw a stack trace at somebody. A capability that does not exist has to be
   * absent from the UI, not discovered by pressing it — and the message has to
   * name the way out, because there is one: iOS records the screen perfectly
   * well from Control Centre, and the shot list below is the whole value of
   * this screen anyway.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const [canRecord, setCanRecord] = useState<boolean | null>(null);
  useEffect(() => {
    setCanRecord(
      typeof navigator !== "undefined"
      && typeof navigator.mediaDevices?.getDisplayMedia === "function"
      && typeof MediaRecorder !== "undefined",
    );
  }, []);

  const script = reelScript(scriptId);
  const problems = script ? scriptProblems(script) : [];
  const beat = script ? currentBeat(script, elapsed) : null;

  // The clock that drives the teleprompter. requestAnimationFrame rather than
  // an interval: it is a readout, and one that stutters is one nobody can
  // follow to the beat.
  useEffect(() => {
    if (state !== "recording") return;
    let raf = 0;
    const tick = () => {
      setElapsed(Date.now() - started.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  // Every track has to be stopped, or the browser keeps the "sharing" bar up
  // and the microphone light on after the page is closed.
  useEffect(() => () => { for (const t of tracks.current) t.stop(); }, []);

  async function start() {
    if (!script) return;
    setError(null);
    setResult(null);

    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
      setError("This browser cannot record the screen. Use Chrome or Edge on a computer, "
        + "or record from Control Centre on iOS and follow the shot list.");
      return;
    }

    const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      setError("This browser cannot record video. Chrome or Edge can.");
      return;
    }

    try {
      /**
       * THE TAB, NOT THE WHOLE SCREEN, is what to choose in the dialog — a
       * shared tab is cropped to the page and carries its audio. There is no
       * way to preselect it: the choice is the permission.
       */
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      let mic: MediaStream | null = null;
      if (withVoice) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            // Echo cancellation off: it is tuned for a call and it treats the
            // app's own audio as an echo to remove, which quietly guts the
            // recording. Noise suppression stays on — a room is not a booth.
            audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
          });
        } catch {
          // A refused microphone is a silent reel, not a failed one. Carrying
          // on beats throwing away a screen share they just granted.
          setError("No microphone — recording the screen without a voice track.");
        }
      }

      /**
       * MIXED THROUGH AN AudioContext, because a MediaStream may hold only one
       * audio track and passing two silently drops one. Which one it drops is
       * not documented, so the failure is a recording that is missing either
       * the voice or the app — discovered after filming.
       */
      const audioTracks = [...display.getAudioTracks(), ...(mic?.getAudioTracks() ?? [])];
      const stream = new MediaStream(display.getVideoTracks());
      if (audioTracks.length === 1) {
        stream.addTrack(audioTracks[0]);
      } else if (audioTracks.length > 1) {
        const ctx = new AudioContext();
        const merger = ctx.createMediaStreamDestination();
        for (const track of audioTracks) {
          ctx.createMediaStreamSource(new MediaStream([track])).connect(merger);
        }
        stream.addTrack(merger.stream.getAudioTracks()[0]);
      }

      tracks.current = [...display.getTracks(), ...(mic?.getTracks() ?? [])];

      // Stopping the share from the browser's own bar must end the recording,
      // or it runs on over a black frame until somebody notices.
      display.getVideoTracks()[0].addEventListener("ended", () => stop());

      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, { mimeType: mime.type, videoBitsPerSecond: 6_000_000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        for (const t of tracks.current) t.stop();
        const blob = new Blob(chunks, { type: mime.type });
        const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
        // What actually came out, read from the bytes. The requested mime type
        // is a request: asking for H.264 in an .mp4 and being handed VP9 is a
        // file the platforms reject, and nothing about the download says so.
        const info = inspectRecording(head);
        const ok = isPostable(info);
        setResult({
          url: URL.createObjectURL(blob),
          name: `${script.id}.${fileExtension(mime.type)}`,
          postable: ok,
          note: ok
            ? `${info.container.toUpperCase()}, H.264 — ready to upload.`
            : `${info.container.toUpperCase()}${info.h264 ? "" : ", VP9"} — some platforms refuse this. `
              + "Convert to H.264 MP4 before posting.",
        });
        setState("done");
      };

      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      rec.start(1000);
      setState("recording");
    } catch (e) {
      // A cancelled share dialog is not an error worth shouting about.
      const message = e instanceof Error ? e.message : String(e);
      if (!/permission|denied|abort/i.test(message)) setError(message);
      setState("idle");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  if (!script) return <p className="text-sm text-slate-500">No script.</p>;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div>
          <span className="field-label">What to film</span>
          <div className="flex flex-wrap gap-2">
            {SCRIPTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScriptId(s.id)}
                disabled={state === "recording"}
                aria-pressed={scriptId === s.id}
                className={`tap-target rounded-full border px-3 py-1.5 text-sm transition ${
                  scriptId === s.id ? "border-pitch-400/50 bg-pitch-400/10 text-accent-400" : "border-white/10 text-slate-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {SCRIPTS.find((s) => s.id === scriptId)?.note}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={withVoice}
            onChange={(e) => setWithVoice(e.target.checked)}
            disabled={state === "recording"}
            className="h-5 w-5 accent-pitch-500"
          />
          Record my voice over it
        </label>

        <p className="text-xs text-slate-500">
          {Math.round(script.totalMs / 1000)}s of film · {script.words} words to say
          {" "}(about {Math.round(readTimeMs(script) / 1000)}s). Share <b>this tab</b> when the
          browser asks — a shared tab is cropped to the page and brings its own audio.
        </p>

        {problems.length > 0 && (
          <ul className="rounded-2xl border border-readiness-yellow/25 bg-readiness-yellow/[0.04] p-3 text-sm text-slate-300">
            {problems.map((p) => <li key={`${p.beat}-${p.problem}`}>Beat {p.beat + 1}: {p.problem}</li>)}
          </ul>
        )}

        {canRecord === false ? (
          /* The shot list still works, and on a phone it is arguably the better
             half: iOS records the screen from Control Centre with the mic on,
             which produces exactly the footage this was for. */
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">This browser cannot record the screen.</p>
            <p className="mt-1 text-slate-400">
              Safari on iOS has no screen capture for web pages — there is no setting that turns it
              on. Record from <b>Control Centre</b> instead (long-press the record button to switch
              the microphone on), and follow the shot list below as you go. On a computer, Chrome or
              Edge will record from here.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state !== "recording" ? (
              <button onClick={start} disabled={canRecord === null} className="btn-primary">
                Share a tab and record
              </button>
            ) : (
              <button onClick={stop} className="btn-primary">Stop ({Math.round(elapsed / 1000)}s)</button>
            )}
          </div>
        )}
        {error && <p className="text-sm text-readiness-yellow">{error}</p>}
      </div>

      {/* THE TELEPROMPTER. On screen while recording, and readable at a glance
          from across a desk — you are looking at the app, not at this. */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-extrabold text-accent-400">
            {state === "recording" ? `Beat ${(beat?.index ?? 0) + 1} of ${script.beats.length}` : "The shot list"}
          </h4>
          <span className="text-xs text-slate-500">Hook: “{script.hook}”</span>
        </div>

        {state === "recording" && beat ? (
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Go to {beat.beat.route}</p>
            <p className="mt-1 text-lg font-bold text-slate-100">{beat.beat.action}</p>
            {beat.beat.say && <p className="mt-3 text-2xl font-extrabold leading-snug">“{beat.beat.say}”</p>}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-pitch-400 transition-[width] duration-100"
                style={{ width: `${Math.round(beat.progress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <ol className="mt-3 space-y-2">
            {script.beats.map((b, i) => (
              <li key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-400">{b.route}</span>
                  <span className="text-xs text-slate-500">{(b.ms / 1000).toFixed(1)}s</span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{b.action}</p>
                {b.say && <p className="mt-1 text-sm italic text-slate-400">“{b.say}”</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      {result && (
        <div className="card p-5">
          <video src={result.url} controls className="w-full rounded-xl" />
          <p className={`mt-2 text-sm ${result.postable ? "text-slate-400" : "text-readiness-yellow"}`}>
            {result.note}
          </p>
          <a
            href={result.url}
            download={result.name}
            className="tap-target mt-3 inline-block rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Download {result.name}
          </a>
        </div>
      )}
    </div>
  );
}

/** Which beat the clock is inside, and how far through it. */
function currentBeat(script: ReelScript, ms: number) {
  for (const [index, b] of script.beats.entries()) {
    if (ms < b.at + b.ms) return { beat: b, index, progress: Math.min(1, (ms - b.at) / b.ms) };
  }
  const last = script.beats[script.beats.length - 1];
  return { beat: last, index: script.beats.length - 1, progress: 1 };
}
