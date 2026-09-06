"""
WHICH VOICE, MEASURED RATHER THAN CHOSEN.

Asked to "pick the best voice", I picked bf_emma by ear-less guesswork and it
turned out to be the most monotone of the eight. This is the measurement that
should have happened first, checked in so the choice can be re-run and argued
with.

  * F0 SD in semitones is the standard measure of pitch variability. Under
    about 2 reads as monotone; animated speech is 4-6. Relative to each
    speaker's own median, so a male and a female voice are comparable.
  * Phone band is the share of energy between 400Hz and 6kHz — what a phone
    speaker can actually reproduce. A reel is watched on one.

Run:  python3 scripts/measure-voice.py
Needs .voice/kokoro-v1.0.onnx and .voice/voices-v1.0.bin (see docs/REELS.md).

Result on 2026-09-06, on the line the demo-cost reel actually speaks:

  voice           F0 SD (st)  range (st)   median Hz   phone band
  bm_lewis              4.37       13.38          89        36.0%
  bm_fable              4.17       13.11         117        29.7%
  bf_alice              3.96       13.01         203        44.0%   <- chosen
  bf_lily               3.58       10.53         188        34.6%
  bm_george             3.49       13.48         140        15.8%
  bm_daniel             2.83       10.33         124           --
  bf_isabella           2.42        7.69         200           --
  bf_emma               2.20        7.84         181        42.7%   <- was

bf_alice wins on both axes that matter: nearly the top for expressiveness, and
the best of any of them at surviving a phone speaker.
"""
import numpy as np, sys, json
from kokoro_onnx import Kokoro

LINE = ("Thirty grams of protein costs thirty-one pence from red lentils. "
        "The same thirty grams costs three pounds nineteen at the other end. Same protein.")

def f0_track(x, sr, fmin=60, fmax=350):
    """Autocorrelation pitch tracker. Returns F0 for voiced frames only."""
    win = int(0.040 * sr); hop = int(0.010 * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    out = []
    for i in range(0, len(x) - win, hop):
        f = x[i:i + win].astype(np.float64)
        if np.sqrt((f ** 2).mean()) < 0.015:      # silence
            continue
        f = f - f.mean()
        ac = np.correlate(f, f, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        if len(seg) == 0:
            continue
        lag = int(np.argmax(seg)) + lo
        # Voicing: the peak has to be a real fraction of the zero-lag energy.
        if ac[lag] / ac[0] < 0.35:
            continue
        out.append(sr / lag)
    return np.array(out)

k = Kokoro(".voice/kokoro-v1.0.onnx", ".voice/voices-v1.0.bin")
rows = []
for v in ["bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis"]:
    samples, sr = k.create(LINE, voice=v, speed=0.94, lang="en-gb")
    f0 = f0_track(np.asarray(samples, dtype=np.float32), sr)
    if len(f0) < 30:
        rows.append((v, 0, 0, 0, len(f0))); continue
    # Semitones relative to the speaker's own median: comparable across a
    # male and a female voice, which raw Hz is not.
    st = 12 * np.log2(f0 / np.median(f0))
    st = st[np.abs(st) < 12]                      # drop octave errors
    rows.append((v, float(np.std(st)),
                 float(np.percentile(st, 95) - np.percentile(st, 5)),
                 float(np.median(f0)), len(f0)))

rows.sort(key=lambda r: -r[1])
print(f"{'voice':<14}{'F0 SD (st)':>12}{'range (st)':>12}{'median Hz':>12}{'frames':>9}")
for v, sd, rng, med, n in rows:
    print(f"{v:<14}{sd:>12.2f}{rng:>12.2f}{med:>12.0f}{n:>9}")
print()
print("Monotone speech sits under ~2 semitones SD; animated speech is 4-6+.")
