"""
Synthesise phrases to wav files with Kokoro.

Reads a JSON job on stdin: {"model": ..., "voices": ..., "voice": ..., "speed": ...,
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
import sys
import wave

import soundfile as sf
from kokoro_onnx import Kokoro

job = json.load(sys.stdin)
kokoro = Kokoro(job["model"], job["voices"])
# A British voice, because the app is British throughout — pounds, "programme",
# stone and pounds for bodyweight. A US voice reading £0.31 is a small wrongness
# on every single reel.
voice = job.get("voice", "bf_emma")
lang = "en-gb" if voice.startswith(("b",)) else "en-us"

for index, text in enumerate(job["phrases"]):
    samples, rate = kokoro.create(text, voice=voice, speed=job.get("speed", 0.94), lang=lang)
    path = f"{job['out']}/{index}.wav"
    sf.write(path, samples, rate)
    with wave.open(path) as handle:
        ms = handle.getnframes() / handle.getframerate() * 1000
    print(json.dumps({"index": index, "path": path, "ms": ms}), flush=True)
