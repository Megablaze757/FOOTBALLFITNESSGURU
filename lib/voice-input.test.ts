import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RESTARTS,
  MAX_TRANSCRIPT,
  capTranscript,
  mergeTranscript,
  readResults,
  shouldRestart,
  speechSupport,
  voiceErrorMessage,
  type SpeechResultLike,
} from "./voice-input";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "UNSUPPORTED" AND "NOT OVER HTTPS" ARE DIFFERENT PROBLEMS.
 *
 * Telling somebody on Chrome that their browser cannot do this, when the real
 * reason is that they opened the app over plain HTTP, sends them to change the
 * one thing that is fine. The API is there; it refuses outside a secure
 * context.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("support is detected, and the two ways it can fail are told apart", () => {
  assert.equal(speechSupport({ SpeechRecognition: class {}, isSecureContext: true }), "ok");
  assert.equal(speechSupport({ webkitSpeechRecognition: class {}, isSecureContext: true }), "ok",
    "Safari and Chrome expose it under the webkit prefix — that is most users");

  assert.equal(speechSupport({ isSecureContext: true }), "unsupported", "Firefox has no implementation");
  assert.equal(speechSupport({ webkitSpeechRecognition: class {}, isSecureContext: false }), "insecure");

  // Older engines have no isSecureContext at all. Absent is not insecure.
  assert.equal(speechSupport({ webkitSpeechRecognition: class {} }), "ok");
  assert.equal(speechSupport(undefined), "unsupported", "server-side render must not claim support");
});

test("every error says what to do, and a deliberate stop says nothing", () => {
  for (const code of ["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "network", "made-up"]) {
    const msg = voiceErrorMessage(code);
    assert.ok(msg.length > 10, `${code} has no usable message`);
    assert.ok(/[.!]$/.test(msg), `${code} message is not a sentence`);
  }
  assert.match(voiceErrorMessage("not-allowed"), /settings/i, "a blocked mic must point at where to unblock it");
  assert.match(voiceErrorMessage("network"), /[Tt]ype it/, "an offline athlete needs the way round it");

  // Pressing stop fires 'aborted'. Showing an error for a thing somebody just
  // chose to do is how a UI feels broken.
  assert.equal(voiceErrorMessage("aborted"), "");
});

/**
 * The event carries every result since the session began, not just the new one.
 * Concatenating all of them on each event is how one phrase lands three times.
 */
test("only the new results are read, and final is kept apart from in-flight", () => {
  const results = (...rows: [string, boolean][]): ArrayLike<SpeechResultLike> =>
    rows.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) as unknown as ArrayLike<SpeechResultLike>;

  const all = results(["200g chicken ", true], ["and rice ", true], ["and brocc", false]);
  assert.deepEqual(readResults(all), { final: "200g chicken and rice", interim: "and brocc" });

  // Continuing from where the last event stopped drops what was already banked.
  assert.deepEqual(readResults(all, 2), { final: "", interim: "and brocc" });
  assert.deepEqual(readResults(results()), { final: "", interim: "" });
});

test("a gap in the results array does not throw", () => {
  const sparse = { length: 3, 0: { isFinal: true, 0: { transcript: "eggs" } } } as unknown as ArrayLike<SpeechResultLike>;
  assert.deepEqual(readResults(sparse), { final: "eggs", interim: "" });
});

/**
 * Speaking has to ADD to a half-typed note, not replace it. Somebody who types
 * "leftovers from" and then speaks the rest should end up with both.
 */
test("spoken words join what was already there", () => {
  assert.equal(mergeTranscript("", "200g chicken"), "200g chicken");
  assert.equal(mergeTranscript("leftovers from", "sunday roast"), "leftovers from, sunday roast");
  assert.equal(mergeTranscript("chicken,", "rice"), "chicken, rice", "an existing separator is not doubled");
  assert.equal(mergeTranscript("chicken -", "rice"), "chicken - rice");
  assert.equal(mergeTranscript("chicken", ""), "chicken", "silence must not append a separator");
  assert.equal(mergeTranscript("", ""), "");
  assert.equal(mergeTranscript("chicken", "  and   rice  "), "chicken, and rice",
    "recognition returns ragged whitespace");
});

test("a stuck microphone cannot fill the field forever", () => {
  const long = "chicken ".repeat(200);
  const capped = capTranscript(long);
  assert.ok(capped.length <= MAX_TRANSCRIPT);
  // Cut at a word, so what survives still reads as food.
  assert.ok(!capped.endsWith("chick"), `cut mid-word: ${JSON.stringify(capped.slice(-12))}`);
  assert.equal(capTranscript("short"), "short");

  // A single word longer than the cap has no boundary to fall back on and is
  // still cut rather than let through.
  assert.equal(capTranscript("x".repeat(MAX_TRANSCRIPT + 50)).length, MAX_TRANSCRIPT);
  assert.ok(mergeTranscript("a".repeat(MAX_TRANSCRIPT - 2), "chicken and rice").length <= MAX_TRANSCRIPT);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECOGNITION STOPS ON ITS OWN, AND A PERSON PAUSING TO THINK IS NOT DONE.
 *
 * `continuous` is not honoured everywhere — iOS ends a session after a short
 * pause whatever you set. Restarting while the athlete still has it running is
 * what makes it behave the way they assume it does.
 *
 * Bounded, because a session that ends instantly and forever would restart
 * instantly and forever, holding the microphone open and eating the battery.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a pause restarts, a broken session gives up", () => {
  // Ran for a while, then ended: they paused mid-sentence.
  assert.equal(shouldRestart({ wantsToListen: true, restarts: 0, msSinceStart: 4000 }), true);
  assert.equal(shouldRestart({ wantsToListen: true, restarts: 3, msSinceStart: 4000 }), true);

  // Pressed stop. Never restart, whatever else is true.
  assert.equal(shouldRestart({ wantsToListen: false, restarts: 0, msSinceStart: 4000 }), false);

  // Ending instantly, over and over, is broken rather than paused.
  assert.equal(shouldRestart({ wantsToListen: true, restarts: 0, msSinceStart: 50 }), true,
    "the first couple of instant ends are tolerated — some engines warm up slowly");
  assert.equal(shouldRestart({ wantsToListen: true, restarts: 2, msSinceStart: 50 }), false);
  assert.equal(shouldRestart({ wantsToListen: true, restarts: MAX_RESTARTS, msSinceStart: 9000 }), false,
    "the ceiling holds even for long healthy sessions");
});

test("the restart ceiling is low enough to notice and high enough to be useful", () => {
  assert.ok(MAX_RESTARTS >= 2 && MAX_RESTARTS <= 10, `${MAX_RESTARTS} restarts is the wrong order of magnitude`);
  assert.ok(MAX_TRANSCRIPT >= 200, "a meal description has to fit");
});

// --- how the component is allowed to use it ------------------------------------

import { readFileSync } from "node:fs";

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const COMPONENT = strip(readFileSync(new URL("../components/VoiceInput.tsx", import.meta.url), "utf8"));
const MEALS = strip(readFileSync(new URL("../components/MealCheckIn.tsx", import.meta.url), "utf8"));

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DICTATION FILLS THE BOX. IT DOES NOT LOG THE MEAL.
 *
 * Recognition hears "chickpea" as "chicken". Same protein, different meal, and
 * nothing downstream can tell. The only thing that catches it is a person
 * reading the words, which only happens if the words wait in a field instead of
 * going straight to the estimator.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("speaking writes into the field and submits nothing", () => {
  assert.match(MEALS, /<VoiceInput\s/, "the meal form no longer offers dictation");
  assert.match(MEALS, /onChange=\{\(next\) => \{ setText\(next\); setEstimate\(null\); \}\}/,
    "dictation does not write into the same text the athlete can edit");

  // No path from the microphone to the estimator that skips the field.
  assert.ok(!/estimateFood|invokeAI|askAi|startJob/.test(COMPONENT),
    "the voice component calls the estimator itself, so nobody reads the words first");

  // Stale estimates must be cleared, exactly as typing does — otherwise the
  // macros on screen belong to the previous sentence.
  const call = MEALS.slice(MEALS.indexOf("<VoiceInput"), MEALS.indexOf("<VoiceInput") + 300);
  assert.match(call, /setEstimate\(null\)/, "speaking leaves the previous meal's numbers on screen");
});

test("no button is drawn where dictation cannot work", () => {
  assert.match(COMPONENT, /if \(support === "unsupported"\) return null;/,
    "Firefox users would get a microphone button that does nothing");
  assert.match(COMPONENT, /support === "insecure"/, "the http case is not told apart from no support");
});

/**
 * Detection has to happen after mount. `window` does not exist during the
 * static export, and a control that renders on the server then disappears on
 * hydration moves the page under somebody's thumb.
 */
test("support is detected after mount, not during render", () => {
  assert.match(COMPONENT, /useEffect\(\(\) => setSupport\(speechSupport\(\)\), \[\]\)/,
    "speechSupport is called during render, which breaks the static export");
  assert.match(COMPONENT, /useState<VoiceSupport>\("unsupported"\)/,
    "the first render must assume no support rather than flash a button away");
});

/** An open microphone that outlives the screen is inaudible to us and visible to them. */
test("leaving the page stops the microphone", () => {
  assert.match(COMPONENT, /useEffect\(\(\) => stop, \[stop\]\)/,
    "unmounting does not stop recognition — the recording indicator stays on");
});

/** The privacy claim on this page has to match what actually happens. */
test("it says whose microphone and whose transcription this is", () => {
  const visible = readFileSync(new URL("../components/VoiceInput.tsx", import.meta.url), "utf8");
  assert.match(visible, /Your browser is doing the listening, not us/,
    "the dictation notice is gone — this app makes privacy claims elsewhere and must not overclaim here");
  assert.ok(!/we (do not|don't) (record|store|send)/i.test(strip(visible)),
    "claiming WE do not send it implies we handle the audio at all, which we never see");
});
