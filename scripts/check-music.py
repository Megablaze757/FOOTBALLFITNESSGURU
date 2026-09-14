"""
IS THIS TRACK THE RIGHT KIND OF MUSIC FOR THIS AUDIENCE?

"Make sure music is actually trendy with our target niche." Nothing in a
repository can know what is trending this week, and nothing here may ship a
commercial record: a copyrighted pump-up song under a brand's video is the
documented way to get it claimed or muted. The genuinely trending route is the
platform's own licensed library, chosen by a person at posting time.

What CAN be done is refuse a track that is the wrong kind of music. Gym and UK
football short-form runs on phonk, hard trap, UK drill and hip-hop: bass-led,
120-155bpm, aggressive. An acoustic ballad at 80bpm under a reel about a 100kg
bench is wrong in a way nobody notices until it is posted.

  python3 scripts/check-music.py TRACK.mp3
  python3 scripts/check-music.py --self-test

Exits non-zero if the track does not fit, naming what is wrong.

─────────────────────────────────────────────────────────────────────────
A BROKEN INSTRUMENT IS WORSE THAN NONE.

Three audio metrics in this project have been confidently wrong, so --self-test
builds tracks whose tempo and bass content are known in advance — a 140bpm
bass-led pulse and an 80bpm treble-only one — and fails if the measurement does
not tell them apart.
"""
import sys
import numpy as np
import soundfile as sf

# Kept in step with lib/reel-music.ts by a test.
BPM_MIN = 120
BPM_MAX = 155
MIN_BASS_SHARE = 0.25

#: Where the bass ends, for the share above. 808s and kick fundamentals live
#: under this; the narration lives above it.
BASS_HZ = 250


def load(path):
    x, sr = sf.read(path)
    x = np.asarray(x, dtype=np.float64)
    if x.ndim > 1:
        x = x.mean(1)
    return x, sr


def bass_share(x, sr):
    """Share of energy under BASS_HZ. The niche's sound is 808-led."""
    window = np.hanning(len(x))
    spectrum = np.abs(np.fft.rfft(x * window)) ** 2
    freq = np.fft.rfftfreq(len(x), 1 / sr)
    total = spectrum.sum()
    if total <= 0:
        return 0.0
    return float(spectrum[freq < BASS_HZ].sum() / total)


def tempo(x, sr):
    """
    Beats per minute, from the autocorrelation of an onset envelope.

    librosa has beat_track and this does not use it, for one reason: the
    envelope and its autocorrelation are what the self-test can build a known
    answer for. A number this file cannot explain is a number that gets
    believed.
    """
    hop = 512
    frames = max(1, (len(x) - 1024) // hop)
    env = np.empty(frames)
    prev = np.zeros(513)
    for i in range(frames):
        seg = x[i * hop:i * hop + 1024]
        if len(seg) < 1024:
            break
        mag = np.abs(np.fft.rfft(seg * np.hanning(1024)))
        # Spectral flux: only INCREASES in energy are onsets.
        env[i] = np.maximum(mag - prev, 0).sum()
        prev = mag
    env = env - env.mean()
    if not env.any():
        return 0.0
    ac = np.correlate(env, env, "full")[len(env) - 1:]
    rate = sr / hop                      # envelope frames per second
    lo = int(rate * 60 / BPM_MAX / 2)    # allow half and double time
    hi = int(rate * 60 / (BPM_MIN / 2))
    seg = ac[lo:hi]
    if len(seg) == 0:
        return 0.0
    lag = int(np.argmax(seg)) + lo
    bpm = 60 * rate / lag
    # Fold into the band the niche actually occupies: a tracker that locks to
    # half or double time is not wrong about the music, only about the lag.
    while bpm < BPM_MIN and bpm > 0:
        bpm *= 2
    while bpm > BPM_MAX * 1.35:
        bpm /= 2
    return float(bpm)


def inspect(path):
    x, sr = load(path)
    return {"seconds": len(x) / sr, "bpm": tempo(x, sr), "bass": bass_share(x, sr)}


def problems(m):
    out = []
    if not (BPM_MIN <= m["bpm"] <= BPM_MAX):
        out.append(
            f"{m['bpm']:.0f}bpm is outside the {BPM_MIN}-{BPM_MAX} this audience listens to "
            "(phonk, hard trap, UK drill)")
    if m["bass"] < MIN_BASS_SHARE:
        out.append(
            f"{m['bass'] * 100:.0f}% of its energy is under {BASS_HZ}Hz, against "
            f"{MIN_BASS_SHARE * 100:.0f}% — this niche's sound is 808-led")
    if m["seconds"] < 5:
        out.append(f"{m['seconds']:.1f}s is too short to sit under a reel, even looped")
    return out


def click_track(bpm, sr=24000, seconds=12, bassy=True):
    """A pulse at a known tempo, with or without low end."""
    t = np.arange(int(sr * seconds)) / sr
    out = np.zeros_like(t)
    period = 60.0 / bpm
    for beat in np.arange(0, seconds, period):
        i = int(beat * sr)
        n = int(sr * 0.12)
        if i + n > len(out):
            break
        env = np.exp(-np.linspace(0, 12, n))
        tone = 55 if bassy else 2000
        out[i:i + n] += np.sin(2 * np.pi * tone * np.arange(n) / sr) * env
    return out / max(1e-9, np.abs(out).max()) * 0.8


def self_test():
    import tempfile, os
    tmp = tempfile.mkdtemp()
    right = os.path.join(tmp, "right.wav")
    slow = os.path.join(tmp, "slow.wav")
    thin = os.path.join(tmp, "thin.wav")
    sf.write(right, click_track(140, bassy=True), 24000)
    sf.write(slow, click_track(80, bassy=True), 24000)
    sf.write(thin, click_track(140, bassy=False), 24000)

    r, s, t = inspect(right), inspect(slow), inspect(thin)
    print(f"{'track':22}{'bpm':>7}{'bass':>8}")
    for name, m in [("140bpm, bass-led", r), ("80bpm, bass-led", s), ("140bpm, treble only", t)]:
        print(f"{name:22}{m['bpm']:>7.0f}{m['bass'] * 100:>7.0f}%")
    print()

    checks = [
        ("a 140bpm track measures near 140", abs(r["bpm"] - 140) < 8),
        ("an 80bpm track is not read as in-band", not (BPM_MIN <= s["bpm"] <= BPM_MAX)),
        ("a bass-led track reads as bass-led", r["bass"] >= MIN_BASS_SHARE),
        ("a treble-only track does not", t["bass"] < MIN_BASS_SHARE),
        ("the right track is accepted", not problems(r)),
        ("the slow one is refused", bool(problems(s))),
        ("the thin one is refused", bool(problems(t))),
    ]
    ok = True
    for name, passed in checks:
        print(("  PASS  " if passed else "  FAIL  ") + name)
        ok = ok and passed
    return ok


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--self-test":
        sys.exit(0 if self_test() else 1)
    measured = inspect(args[0])
    print(f"{args[0]}: {measured['bpm']:.0f}bpm, {measured['bass'] * 100:.0f}% bass, "
          f"{measured['seconds']:.1f}s")
    found = problems(measured)
    for p in found:
        print(f"  {p}", file=sys.stderr)
    if found:
        print("\nThis niche runs on phonk, hard trap, UK drill and hip-hop. Pick a track you have "
              "the right to use commercially — a chart record under a brand's video gets claimed.",
              file=sys.stderr)
    sys.exit(1 if found else 0)
