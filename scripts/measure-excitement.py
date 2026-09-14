"""
WHY A READ SOUNDS SLEEPY, MEASURED RATHER THAN ARGUED ABOUT.

"The voice is putting me to sleep, it needs to be exciting."

scripts/measure-voice.py already measures PITCH VARIABILITY, and that measure
chose the voices this project has been using. It is necessary and it is not
sufficient: a voice can move its pitch about freely and still sound like a
bedtime story, because pitch is one of four things going on and the other
three had never been looked at.

  * PACE. Words per minute over the whole clip. Audiobook and explainer
    narration sits around 150-160; energetic short-form sits 180-220. This is
    the number that was wrong — the committed reference clip read at 161.
  * ARTICULATION RATE. Words per minute of SPEAKING time, pauses removed.
    Separates a voice that talks quickly from one that simply pauses less,
    which are different problems with different fixes.
  * DEAD AIR. The share of the clip under a silence floor set 35dB below the
    clip's own loud frames — relative, so it does not move when the level
    does. Dead air is most of what "slow" actually is.
  * DYNAMIC CONTRAST. Standard deviation of frame loudness across speaking
    frames. See lib/speech-prosody.ts: the thing that reads as excitement is
    largely the point of a sentence being several decibels above the clause
    that set it up.

And two supporting ones: median F0, because a deep voice reads calmer than a
bright one and also survives a phone speaker worse, and the rate of upward
pitch movement, because excitement rises.

─────────────────────────────────────────────────────────────────────────
A BROKEN INSTRUMENT IS WORSE THAN NONE, BECAUSE ITS OUTPUT GETS BELIEVED.

This project has already shipped three audio metrics that were confidently
wrong. So `python3 scripts/measure-excitement.py --self-test` builds clips
that differ in ways that are known in advance — silence appended, the whole
thing resampled faster, the dynamics squashed — and fails if the measurement
does not see each change in the right direction and roughly the right size.
Run that before believing a table this prints.

Note the ROBUST pitch range: 5th to 95th percentile, not min to max. An
autocorrelation tracker halves and doubles on the odd frame, and min-to-max
reports those octave errors as expression. The committed reference measures
30.6 semitones of range that way and 13.8 honestly.

Usage:
  python3 scripts/measure-excitement.py --self-test
  python3 scripts/measure-excitement.py FILE.wav ["the words that were said"]
"""
import sys
import numpy as np
import soundfile as sf

#: Frame size for the loudness envelope. 25ms is about one syllable nucleus.
FRAME_MS = 25

#: How far under a clip's loud frames counts as silence. Relative, so the
#: measure does not move when the level does.
SILENCE_FLOOR_DB = 35

#: How far under the 95th-percentile frame a frame may be and still be asked
#: for a pitch. Deeper is not more thorough: at 25dB the quiet frames admitted
#: are ones autocorrelation cannot read, and they come back as octave errors
#: that inflate a reel's measured range to 25 semitones — over two octaves,
#: which no speaker does. Relative to the audio, so it does not move with level.
VOICED_FLOOR_DB = 15

#: How periodic a frame must be to count as voiced, as a fraction of its own
#: zero-lag energy. 0.35 is the usual textbook bar; 0.45 costs a few genuine
#: frames and refuses considerably more nonsense.
VOICED_AC = 0.45


def f0_track(x, sr, fmin=60, fmax=350):
    """
    Autocorrelation pitch tracker. Voiced frames only.

    ─────────────────────────────────────────────────────────────────────
    THE VOICING THRESHOLD IS RELATIVE, AND IN measure-voice.py IT IS NOT.
    IT ALSO HAS TO BE HIGH ENOUGH, WHICH TOOK A SECOND GO TO GET RIGHT.

    That one is 0.015 of full scale, which is a threshold only if every file
    is at the same level. Run it either side of the mastering chain — which
    raises a reel about 8dB and cannot touch pitch — and it reports F0 SD
    going from 5.03 to 9.49 semitones and the median from 126Hz to 157Hz.
    None of that happened. The louder file simply pushed low-energy frames
    and breath noise over a fixed bar, and noise autocorrelates to nonsense.

    So the bar is set from the audio: 32dB under the loud frames, the same
    way the dead-air floor is. The self-test has a control for it now — the
    same clip at half amplitude must measure the same pitch.
    ─────────────────────────────────────────────────────────────────────
    """
    win = int(0.040 * sr)
    hop = int(0.010 * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    starts = range(0, len(x) - win, hop)
    rms = np.array([np.sqrt((x[i:i + win].astype(np.float64) ** 2).mean()) for i in starts])
    if not len(rms):
        return np.array([])
    floor = np.percentile(rms, 95) * (10 ** (-VOICED_FLOOR_DB / 20))
    out = []
    for n, i in enumerate(starts):
        if rms[n] < floor:
            continue
        f = x[i:i + win].astype(np.float64)
        f = f - f.mean()
        ac = np.correlate(f, f, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        if len(seg) == 0:
            continue
        lag = int(np.argmax(seg)) + lo
        if ac[lag] / ac[0] < VOICED_AC:
            continue
        out.append(sr / lag)
    return np.array(out)


def frame_db(x, sr):
    """Loudness envelope, one value per FRAME_MS."""
    win = int(FRAME_MS / 1000 * sr)
    n = len(x) // win
    if n == 0:
        return np.array([])
    frames = x[:n * win].reshape(n, win)
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(1))
    return 20 * np.log10(np.maximum(rms, 1e-10))


def score(path, text=None):
    """Every number this file is about, for one wav."""
    x, sr = sf.read(path)
    if x.ndim > 1:
        x = x.mean(1)
    x = np.asarray(x, dtype=np.float64)
    dur = len(x) / sr

    db = frame_db(x, sr)
    loud = db > (np.percentile(db, 95) - SILENCE_FLOOR_DB) if len(db) else np.array([], bool)
    speaking = loud.sum() * FRAME_MS / 1000
    silence = 1 - (speaking / dur) if dur else 0.0

    f0 = f0_track(x, sr)
    words = len(text.split()) if text else 0
    out = dict(
        dur=dur,
        silence=silence,
        wpm=words / dur * 60 if dur and words else 0.0,
        artic=words / speaking * 60 if speaking and words else 0.0,
        dyn=float(db[loud].std()) if loud.any() else 0.0,
        f0sd=0.0, range=0.0, med=0.0, rise=0.0,
    )
    if len(f0) >= 10:
        st = 12 * np.log2(f0 / np.median(f0))
        out["f0sd"] = float(st.std())
        # 5th-95th, not min-max: an octave error is not expression.
        out["range"] = float(np.percentile(st, 95) - np.percentile(st, 5))
        out["med"] = float(np.median(f0))
        out["rise"] = float((np.diff(st) > 0.5).sum()) / max(1e-9, len(st) * 0.010)
    return out


HEAD = (f"{'label':<28}{'dur':>6}{'dead%':>7}{'wpm':>6}{'artic':>7}"
        f"{'F0SD':>6}{'range':>7}{'Hz':>5}{'rise/s':>7}{'dyn':>6}")


def row(label, s):
    return (f"{label:<28}{s['dur']:>6.2f}{s['silence'] * 100:>7.0f}{s['wpm']:>6.0f}{s['artic']:>7.0f}"
            f"{s['f0sd']:>6.2f}{s['range']:>7.2f}{s['med']:>5.0f}{s['rise']:>7.1f}{s['dyn']:>6.1f}")


def self_test():
    """Controls that differ in known ways. Fails if the measurement disagrees."""
    src = "assets/reel-voice-reference.wav"
    text = ("Every other training app hands you the session it planned on Sunday. "
            "PocketAthlete asks how you slept first. Two taps: bad night, wrecked legs. "
            "It scores you out of a hundred, and then it rebuilds today to match.")
    x, sr = sf.read(src)
    if x.ndim > 1:
        x = x.mean(1)
    import tempfile, os
    tmp = tempfile.mkdtemp()

    def write(name, y):
        p = os.path.join(tmp, name)
        sf.write(p, y, sr)
        return p

    quiet = write("silence.wav", np.concatenate([x, np.zeros(int(3 * sr))]))
    idx = np.arange(0, len(x) - 1, 1.25)
    fast = write("fast.wav", np.interp(idx, np.arange(len(x)), x))
    flat = write("flat.wav", np.sign(x) * np.abs(x) ** 0.25 * 0.5)

    base, a, b, c = score(src, text), score(quiet, text), score(fast, text), score(flat, text)
    print(HEAD)
    for label, s in [("reference (baseline)", base), ("+3s silence", a),
                     ("1.25x faster", b), ("dynamics flattened", c)]:
        print(row(label, s))
    print()

    quiet_copy = write("quiet-copy.wav", x * 0.12)
    d = score(quiet_copy, text)
    checks = [
        # Mastering raises a reel about 8dB and cannot change its pitch. A
        # fixed voicing threshold reported 5.03 -> 9.49 semitones across it.
        # At 0.12 of full scale a fixed 0.015 bar rejects most of the speech
        # and reports 2.92 semitones against the true 4.97.
        ("pitch stats do not move when the level does", abs(d["f0sd"] - base["f0sd"]) < 0.25),
        ("median pitch does not move when the level does", abs(d["med"] - base["med"]) < 3),
        ("dead air rises when silence is added", a["silence"] > base["silence"] + 0.05),
        ("pace falls when silence is added", a["wpm"] < base["wpm"]),
        ("pace rises ~25% when sped up", 1.20 < b["wpm"] / base["wpm"] < 1.30),
        ("median F0 rises when sped up", b["med"] > base["med"] * 1.15),
        ("contrast falls when dynamics are squashed", c["dyn"] < base["dyn"] - 1.0),
        ("articulation rate ignores added silence",
         abs(a["artic"] - base["artic"]) < base["artic"] * 0.08),
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
    print(HEAD)
    print(row(args[0].split("/")[-1], score(args[0], args[1] if len(args) > 1 else None)))
