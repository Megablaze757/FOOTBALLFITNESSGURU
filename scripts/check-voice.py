"""
IS THE NARRATION ACTUALLY THE LOUDEST THING IN THE REEL?

"Now we have no voice just bad music."

The bed was fetched to reels/bed.wav and the narration was read as
`reels/*.wav` — a glob that matches both, with bed.wav sorting first. So
ffmpeg's input 1 became the MUSIC: the loudness chain normalised the music to
-14 LUFS and the voice was mixed in 18dB below it and ducked against itself.

EVERY EXISTING CHECK PASSED. check-loudness measured -14.3 LUFS and was
satisfied, because the music really was at -14.3. check-sync measured 0.000s,
because the captions really did line up with where the voice was scheduled to
be — nobody had asked whether it could be heard there. A whole-file loudness
measurement cannot tell a voice from a drum loop.

So this asks the one question those two cannot: the recorder wrote down exactly
where every phrase starts and how long it lasts, so compare the level THERE
against the level everywhere else. A reel whose narration is not clearly the
loudest thing in its own speech is broken however good its other numbers look.

  python3 scripts/check-voice.py REEL.mp4 REEL.sync.json
"""
import json
import subprocess
import sys
import wave
import numpy as np

#: How far the narration must stand above the rest of the mix, in dB.
#:
#: With a bed 18dB down and ducked under speech the real figure is around 18;
#: with no bed at all it is past 30. The swapped mix that prompted this measured
#: 0.0. This sits low enough to allow a loud, legitimate bed and high enough
#: that a voice buried under one cannot pass.
MIN_LEAD_DB = 8.0


def audio_of(path):
    out = "/tmp/check-voice.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path,
                    "-vn", "-ac", "1", "-ar", "24000", out], check=True)
    with wave.open(out) as w:
        frames = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return frames.astype(np.float64) / 32768.0, 24000


def spans_of(sync):
    doc = json.load(open(sync))
    out = []
    for step in doc["steps"]:
        for clip in (step.get("clips") or []):
            start = step["at"] + clip["atMs"]
            out.append((start / 1000, (start + clip["ms"]) / 1000))
    return out


def db(signal):
    if not len(signal):
        return -120.0
    return 20 * np.log10(max(1e-10, float(np.sqrt((signal ** 2).mean()))))


def main(mp4, sync):
    x, sr = audio_of(mp4)
    spans = spans_of(sync)
    if not spans:
        print(f"::error::{sync} records no phrases, so nothing can be checked")
        return 1

    speaking = np.zeros(len(x), bool)
    for a, b in spans:
        speaking[int(a * sr):min(len(x), int(b * sr))] = True
    if not speaking.any():
        print(f"::error::{mp4} is shorter than the phrases {sync} says it contains")
        return 1

    voiced, rest = db(x[speaking]), db(x[~speaking])
    lead = voiced - rest
    print(f"{mp4}: narration {voiced:.1f}dB, everything else {rest:.1f}dB, "
          f"lead {lead:.1f}dB")
    if lead < MIN_LEAD_DB:
        print(f"::error::the narration is only {lead:.1f}dB above the rest of the mix "
              f"(needs {MIN_LEAD_DB}). Either the bed is too loud or the voice and the "
              "music have been swapped — check which input the loudness chain was applied to.")
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
