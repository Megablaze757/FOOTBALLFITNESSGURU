/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEAKING A MEAL INSTEAD OF TYPING IT.
 *
 * "200g chicken, rice, two eggs" is nine words and about forty taps on a phone
 * keyboard, usually one-handed, usually in a kitchen. Saying it takes four
 * seconds.
 *
 * This is dictation, not a second estimator. The words land in the same text
 * box typing fills and go to the same food estimator — which already reads
 * "chicken, rice and broccoli", because that is literally its placeholder. So
 * the whole feature is: get speech into that box, correctly, and let the
 * athlete fix it before it counts.
 *
 * THE TRANSCRIPT IS ALWAYS EDITABLE, and that is not a nicety. Recognition
 * mishears "chickpea" as "chicken", which is 20g of protein either way and a
 * completely different meal. It writes into the field rather than submitting,
 * so a wrong word is a wrong word somebody can see and fix rather than a wrong
 * number in their day.
 *
 * NOTHING IS RECORDED OR UPLOADED BY US. This is the browser's own dictation.
 * No audio reaches this app, there is no file, and there is no new server
 * endpoint — which is also why it needs no key and costs nothing per use. On
 * some browsers the OS does this on the device and on others it goes to the
 * browser vendor; either way it is their microphone permission and their
 * transcription, and the UI says so rather than implying we handle it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Meals are a sentence. This is a guard against a stuck microphone, not a limit anyone meets. */
export const MAX_TRANSCRIPT = 400;

export type VoiceSupport = "ok" | "insecure" | "unsupported";

interface SpeechWindow {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  isSecureContext?: boolean;
}

/**
 * Whether dictation can work here, and if not, which of the two reasons.
 *
 * They need different words. "Your browser doesn't support this" is wrong and
 * infuriating when the real problem is that someone opened the app over plain
 * HTTP — the API exists, it just refuses outside a secure context.
 *
 * Firefox is the honest `unsupported` case: it has no implementation, so the
 * microphone button must not be drawn at all. A button that does nothing is
 * worse than no button.
 */
export function speechSupport(win: SpeechWindow | undefined = typeof window === "undefined" ? undefined : window as SpeechWindow): VoiceSupport {
  if (!win) return "unsupported";
  const api = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!api) return "unsupported";
  // isSecureContext is undefined in older engines; absent is not insecure.
  if (win.isSecureContext === false) return "insecure";
  return "ok";
}

/**
 * What went wrong, in words that say what to do about it.
 *
 * The spec's codes are for programmers: "not-allowed" is the one an athlete
 * will actually hit, by tapping "Don't allow" once months ago, and it needs to
 * point at the browser's settings rather than apologise.
 */
export function voiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Your browser is blocking the microphone. Allow it for this site in your browser settings, then try again.";
    case "no-speech":
      return "I didn't hear anything. Tap the microphone and speak as you would to a person.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Dictation needs a connection and there isn't one right now. Type it instead.";
    case "aborted":
      return "";
    default:
      return "Dictation stopped unexpectedly. Type it instead — it reads the same.";
  }
}

/**
 * What the text box should say while somebody is talking.
 *
 * `base` is whatever was in the field when they pressed the microphone, kept so
 * that speaking ADDS to a half-typed note instead of wiping it — somebody who
 * types "leftovers from" then speaks the rest should get both.
 *
 * Interim results are included so the field fills in as they speak. Without
 * that a person says a sentence into a box that does not visibly change and
 * reasonably concludes it is not working, then says it again.
 */
export function mergeTranscript(base: string, spoken: string): string {
  const left = base.trim();
  const right = spoken.trim().replace(/\s+/g, " ");
  if (!right) return left;
  if (!left) return capTranscript(right);
  // A comma reads as another item on the list, which is what a second burst of
  // speech nearly always is. A trailing separator is left alone.
  const joiner = /[,;:.\-—]$/.test(left) ? " " : ", ";
  return capTranscript(`${left}${joiner}${right}`);
}

/** Cut at a word boundary rather than mid-word, so what is left still reads. */
export function capTranscript(s: string): string {
  if (s.length <= MAX_TRANSCRIPT) return s;
  const cut = s.slice(0, MAX_TRANSCRIPT);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_TRANSCRIPT * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Flatten one SpeechRecognitionEvent into finished text and in-flight text.
 *
 * The event carries every result since the session began, not only the new
 * one, and each is flagged final or not. Concatenating the lot on every event
 * is how the same phrase ends up in the box three times.
 */
export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

export function readResults(
  results: ArrayLike<SpeechResultLike>,
  fromIndex = 0,
): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = fromIndex; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  return { final: final.trim(), interim: interim.trim() };
}

/**
 * Whether a session that ended by itself should be restarted.
 *
 * Recognition stops on its own after a pause — on iOS quickly, and `continuous`
 * is not honoured everywhere — so a person pausing to think mid-sentence gets
 * cut off. Restarting while they still have the button held down is what makes
 * it behave the way they expect.
 *
 * Bounded, because a recognition that ends instantly and forever would restart
 * instantly and forever, holding the microphone open and flattening the
 * battery. After a few immediate ends in a row, it is broken, not paused.
 */
export const MAX_RESTARTS = 4;

export function shouldRestart(opts: {
  wantsToListen: boolean;
  restarts: number;
  msSinceStart: number;
}): boolean {
  if (!opts.wantsToListen) return false;
  if (opts.restarts >= MAX_RESTARTS) return false;
  // A session that ran for a while then ended is a natural pause. One that
  // ended in under a second never really started.
  return opts.msSinceStart >= 1000 || opts.restarts < 2;
}
