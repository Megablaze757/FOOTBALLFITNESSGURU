"""
Make the reference clip Chatterbox clones, once, so it can be committed.

WHY A FILE IN THE REPO RATHER THAN A BUILD STEP. The reference is Kokoro
speaking one fixed passage in one fixed voice: it is deterministic, it is about
half a megabyte, and it never changes unless somebody decides the voice should.
Generating it on every run bought nothing and cost a dependency conflict —
kokoro-onnx 0.6.1 and chatterbox-tts cannot be installed into one environment
(pkuseg fails to build), and unpinned they resolve to a Kokoro that reads the
voices .bin as JSON.

Committing it also makes the voice reviewable. Anybody can play the file and
hear exactly what the reels are cloning, which is not true of a decision that
only exists as a model name in a config.

Regenerate with:  python3 scripts/make-voice-reference.py

Needs kokoro-onnx and the model files in .voice — see docs/REELS.md. It is not
part of recording, and nothing in CI runs it.
"""
import sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# Kept in step with lib/speech-prosody.ts by a test, so the file on disk and
# the decision written down next to the measurements cannot drift apart.
VOICE = "bm_lewis"
LINE = ("Every other training app hands you the session it planned on Sunday. "
        "PocketAthlete asks how you slept first. Two taps: bad night, wrecked legs. "
        "It scores you out of a hundred, and then it rebuilds today to match.")
OUT = "assets/reel-voice-reference.wav"

kokoro = Kokoro(".voice/kokoro-v1.0.onnx", ".voice/voices-v1.0.bin")
samples, rate = kokoro.create(LINE, voice=VOICE, speed=0.94, lang="en-gb")
x = np.asarray(samples, dtype=np.float32)
x = x / max(1e-9, float(np.abs(x).max())) * 0.891  # -1 dBFS, as lib/wav.ts does
sf.write(OUT, x, rate)
print(f"{OUT}  {len(x)/rate:.1f}s  {VOICE}", file=sys.stderr)
