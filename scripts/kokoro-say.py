"""
Synthesise phrases to wav files with Kokoro.

Reads a JSON job on stdin: {"model": ..., "voices": ..., "voice": ..., "speeds": [...],
"out": dir, "phrases": ["...", ...]} and writes <out>/<n>.wav for each, printing
one JSON line per phrase with its measured duration.

MEASURED, NOT ESTIMATED. lib/narration.ts sizes every shot from the audio that
actually came out, because the beats in lib/reel-script.ts are sized at roughly
340 words a minute and nobody speaks at 340 words a minute.

Kokoro rather than Piper: Piper is faster and smaller and sounds it. Both are
free, offline and need no key; this one is 325MB of model in exchange for
sounding like a person.
"""
import json
import os
import subprocess
import sys
import wave

import soundfile as sf
from kokoro_onnx import Kokoro

job = json.load(sys.stdin)
kokoro = Kokoro(job["model"], job["voices"])
# A British voice, because the app is British throughout — pounds, "programme",
# stone and pounds for bodyweight. A US voice reading £0.31 is a small wrongness
# on every single reel.
voice = job.get("voice", "bm_fable")
lang = "en-gb" if voice.startswith(("b",)) else "en-us"

for index, text in enumerate(job["phrases"]):
    # ─────────────────────────────────────────────────────────────────────
    # A RATE PER PHRASE.
    #
    # This took one `speed` for the whole reel, and a constant rate is heard as
    # flat however good the voice — tempo is the other half of prosody. The
    # rates are decided in lib/speech-prosody.ts by what each phrase is doing.
    #
    # `speed` is still read as a fallback so an older caller keeps working.
    # ─────────────────────────────────────────────────────────────────────
    speeds = job.get("speeds") or []
    speed = speeds[index] if index < len(speeds) else job.get("speed", 1.30)
    samples, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    path = f"{job['out']}/{index}.wav"
    sf.write(path, samples, rate)

    # ─────────────────────────────────────────────────────────────────────
    # LOWER, AND NOT THINNER. "Too high pitched... I want voice to feel
    # relatable."
    #
    # bm_fable was chosen on pace and dead air and sits at 125Hz, the top of
    # the male range. Shifting it down with formants preserved is a lower
    # voice rather than a slowed tape — and it costs nothing that matters:
    # measured drift is 0.0ms, so the durations printed below, and the caption
    # sync built on them, are exactly as true as before.
    #
    # THE SHELF PUTS BACK WHAT THE SHIFT TOOK. Moving everything down four
    # semitones moves energy out of the 400Hz-6kHz band a phone can reproduce
    # (41.1% to 34.9%, measured); the shelf restores it to 41.4%. A reel is
    # watched on a phone, and lower-and-thinner would have traded one
    # complaint for another.
    #
    # BEFORE THE DURATION IS READ, deliberately. A processing step that runs
    # after the measurement is a step the rest of the pipeline does not know
    # about. See lib/speech-prosody.ts; a test keeps these in step with it.
    # ─────────────────────────────────────────────────────────────────────
    pitch = job.get("pitch", 0.7937)
    shelf_hz = job.get("shelf_hz", 1000)
    shelf_db = job.get("shelf_db", 5)
    if pitch and pitch != 1:
        shifted = f"{job['out']}/{index}-shifted.wav"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-af",
             f"rubberband=pitch={pitch}:formant=preserved,highshelf=f={shelf_hz}:g={shelf_db}",
             shifted],
            check=True,
        )
        os.replace(shifted, path)

    with wave.open(path) as handle:
        ms = handle.getnframes() / handle.getframerate() * 1000
    print(json.dumps({"index": index, "path": path, "ms": ms}), flush=True)
