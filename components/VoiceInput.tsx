"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_RESTARTS,
  mergeTranscript,
  endSession,
  readResults,
  shouldRestart,
  speechSupport,
  voiceErrorMessage,
  type SpeechResultLike,
  type VoiceSupport,
} from "@/lib/voice-input";

/**
 * A microphone that types for you.
 *
 * It fills a text box; it does not submit anything. See lib/voice-input.ts for
 * why that matters — "chickpea" heard as "chicken" is the same protein and a
 * different meal, and the only defence is that a person reads it first.
 */
/**
 * Only the parts of SpeechRecognition this uses.
 *
 * There is no lib.dom type for it — the API is still a draft and TypeScript
 * ships no definition — so it is described here rather than cast to `any`,
 * which would silently accept a typo in an event field name.
 */
interface RecognitionEventLike {
  results: ArrayLike<SpeechResultLike> & { length: number };
}
interface RecognitionErrorLike {
  error?: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  /** Ends immediately and discards anything still in flight. */
  abort?: () => void;
}
type RecognitionCtor = new () => Recognition;

interface SpeechWindow extends Window {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
}

interface Props {
  /** The current field value, so speech adds to it rather than replacing it. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** What is being described, for the button's accessible name. */
  label?: string;
}

export function VoiceInput({ value, onChange, disabled, label = "what you ate" }: Props) {
  const [support, setSupport] = useState<VoiceSupport>("unsupported");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [interim, setInterim] = useState("");

  const recognition = useRef<Recognition | null>(null);
  const wantsToListen = useRef(false);
  const restarts = useRef(0);
  const startedAt = useRef(0);
  /** The field's contents when the microphone was pressed. */
  const base = useRef("");
  /** How far through this session's results we have already read. */
  const readTo = useRef(0);

  // Detected in an effect, not in render: `window` does not exist during the
  // static export, and a button that appears on the server and vanishes on
  // hydration is a layout jump on the first paint.
  useEffect(() => setSupport(speechSupport()), []);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * STOP HAS TO BE UNCONDITIONAL, AND THE FIRST VERSION WAS NOT.
   *
   * Two ways it could carry on listening after the button was pressed.
   *
   * `stop()` does not stop. It asks the engine to finish and deliver a final
   * result, which can take a moment and keeps the microphone open meanwhile —
   * so the indicator stays lit and the athlete presses it again. `abort()` is
   * the one that ends now. Nothing is lost by it: interim words are already
   * written into the field as they are spoken, so what is on screen when they
   * press Stop is what they keep.
   *
   * And a session ending on its own restarts itself, by design, so somebody
   * pausing mid-sentence is not cut off. If Stop lands while a restart is
   * already queued, clearing a flag is not enough — the handler is still
   * attached and will start it again. So the handlers come off first and the
   * ref is cleared, which makes a late event from a dying session inert.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const stop = useCallback(() => {
    wantsToListen.current = false;
    setListening(false);
    setInterim("");

    const rec = recognition.current;
    recognition.current = null;
    if (!rec) return;

    // endSession detaches the handlers before ending it — see lib/voice-input.ts.
    endSession(rec);
  }, []);

  // Leaving the page with the microphone open is a bug you cannot see and can
  // hear — the browser keeps showing the recording indicator.
  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    const win = window as SpeechWindow;
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = navigator.language || "en-GB";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: RecognitionEventLike) => {
      const { final, interim: live } = readResults(event.results, readTo.current);
      setInterim(live);
      if (final) {
        // Bank the finished words and never read them again — the event carries
        // every result since the session started, not only the new one.
        readTo.current = event.results.length;
        base.current = mergeTranscript(base.current, final);
        onChange(base.current);
        setInterim("");
      } else {
        // Show it building. A field that does not move while somebody talks
        // reads as broken, and they say the whole thing again.
        onChange(mergeTranscript(base.current, live));
      }
    };

    rec.onerror = (event: RecognitionErrorLike) => {
      const message = voiceErrorMessage(event.error ?? "");
      if (message) setError(message);
      // A permission refusal will not fix itself on a retry.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantsToListen.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      const ok = shouldRestart({
        wantsToListen: wantsToListen.current,
        restarts: restarts.current,
        msSinceStart: Date.now() - startedAt.current,
      });
      if (!ok) {
        wantsToListen.current = false;
        setListening(false);
        setInterim("");
        return;
      }
      // Belt and braces with the handler detach in stop(): if this fires from
      // a session that was already abandoned, the ref no longer points at it.
      if (recognition.current !== rec) return;
      restarts.current++;
      startedAt.current = Date.now();
      readTo.current = 0;
      try { rec.start(); } catch { stop(); }
    };

    recognition.current = rec;
    restarts.current = 0;
    readTo.current = 0;
    startedAt.current = Date.now();
    base.current = value;
    wantsToListen.current = true;
    setError("");
    setInterim("");
    setListening(true);
    try { rec.start(); } catch { stop(); }
  }, [onChange, stop, value]);

  if (support === "unsupported") return null;

  if (support === "insecure") {
    return (
      <p className="mt-2 text-xs text-slate-500">
        Speaking your meal needs a secure connection — open the app over https and the
        microphone appears here.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={listening ? stop : begin}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? "Stop dictating" : `Say ${label} out loud`}
          className={`tap-target flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
            listening
              ? "border-readiness-red/50 bg-readiness-red/10 text-readiness-red"
              : "border-white/10 text-slate-300 hover:border-white/25"
          }`}
        >
          <span aria-hidden="true">{listening ? "■" : "🎤"}</span>
          {listening ? "Stop" : "Say it instead"}
        </button>

        {listening && (
          // aria-live, because the visible cue for "it is listening" is a colour
          // change on a button somebody may not be looking at.
          <span role="status" aria-live="polite" className="text-xs text-slate-400">
            Listening… {interim ? <span className="text-slate-500">{interim}</span> : "say what you ate"}
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}

      {listening && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Your browser is doing the listening, not us — no recording is made or sent to this app.
          Check the words before you save them.
        </p>
      )}
    </div>
  );
}
