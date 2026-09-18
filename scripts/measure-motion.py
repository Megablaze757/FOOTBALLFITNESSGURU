"""
HOW MUCH A FINISHED REEL MOVES, AND HOW OFTEN IT CUTS.

  python3 scripts/measure-motion.py FILE.mp4
  python3 scripts/measure-motion.py --self-test

─────────────────────────────────────────────────────────────────────────
WHY THIS EXISTS. THE AUDIO HALF HAS HAD AN INSTRUMENT FOR MONTHS.

scripts/measure-excitement.py measures pace, dead air, pitch and dynamics, and
every voice decision in lib/speech-prosody.ts was made with it — including the
one that reversed a choice made three times on the wrong evidence.

The picture had nothing. "Cut rate" appears in this project's research notes
and in the reasoning behind MIN_SCENE_MS, and no finished file has ever been
measured for it. A reel could hold one still frame for nine seconds and pass
every check in the pipeline, which is the same shape as the blank frame that
shipped for months because nothing read DATA_ROUTE_PAINT_MS.

WHAT IT MEASURES

  * CUTS PER SECOND. A cut is a frame that differs from the one before it by
    more than CUT_THRESHOLD of full scale. Short-form is edited fast and a
    reel that never cuts reads as a screen recording, which is what these are.
  * MOTION. Mean absolute frame-to-frame difference over the whole clip,
    ignoring the cut frames themselves — a cut is not movement, it is a new
    shot, and counting it as movement makes a slideshow look kinetic.
  * STILL SHARE. The share of frames that barely change at all. This is the
    picture's equivalent of dead air, and it is the number most likely to be
    bad here: these reels are a slow drift down a page.
  * LONGEST STILL RUN, in seconds. A mean hides one nine-second hold among
    twenty lively seconds, and the hold is the thing a viewer leaves during.

─────────────────────────────────────────────────────────────────────────
A BROKEN INSTRUMENT IS WORSE THAN NONE, BECAUSE ITS OUTPUT GETS BELIEVED.

This project has shipped three audio metrics that were confidently wrong, and
one of them — a "mean pixel change" for exactly this job — rewarded a single
big fade over sustained activity and had to be replaced. So --self-test builds
clips whose answers are known in advance: a still one, one that cuts every
second, one that cuts twice as often, and one that pans continuously without
ever cutting. It fails if the measurement does not separate them.

The pan is the important control. Motion and cuts are different things, and a
measure that cannot tell a moving camera from an edit will call a slow drift
down a page "fast cutting" and congratulate the reel that is putting people to
sleep.
"""
import subprocess
import sys
import tempfile
import os

import numpy as np

#: Frames per second to sample. Not the file's rate — 10 is plenty to find
#: cuts and keeps a 30-second reel to 300 frames of arithmetic.
SAMPLE_FPS = 10

#: Downscale before comparing. Detail is noise for this: a 64x114 thumbnail
#: keeps every cut and drops the compression artefacts that make two identical
#: frames differ by a percent.
W, H = 64, 114

#: Frame-to-frame difference, as a fraction of full scale, that counts as a
#: cut rather than as movement. A hard cut between two app screens lands far
#: above this; a page scrolling at reel speed lands far below.
CUT_THRESHOLD = 0.14

#: Below this, a frame is the same picture as the one before it. Compression
#: noise alone reaches about 0.002 on a still frame, so this is an order of
#: magnitude above the floor rather than a fine judgement.
STILL_THRESHOLD = 0.02


def frames(path):
    """Decode to a stack of small greyscale frames, (n, H, W) in 0..1."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path,
         "-vf", f"fps={SAMPLE_FPS},scale={W}:{H}:flags=bilinear,format=gray",
         "-f", "rawvideo", "-"],
        capture_output=True)
    if out.returncode != 0:
        print(out.stderr.decode()[-400:], file=sys.stderr)
        raise SystemExit(f"could not decode {path}")
    buf = np.frombuffer(out.stdout, dtype=np.uint8)
    n = len(buf) // (W * H)
    if n < 2:
        raise SystemExit(f"{path} gave {n} frames — too short to measure")
    return buf[: n * W * H].reshape(n, H, W).astype(np.float32) / 255.0


def measure(path):
    f = frames(path)
    # Mean absolute difference between consecutive frames.
    diff = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    seconds = len(f) / SAMPLE_FPS

    cuts = diff > CUT_THRESHOLD
    still = diff < STILL_THRESHOLD

    # A cut is a new shot, not movement. Averaging it into "motion" is what
    # makes a slideshow of stills look like the most kinetic thing on the feed.
    moving = diff[~cuts]
    motion = float(moving.mean()) if moving.size else 0.0

    # The longest unbroken run of near-identical frames, in seconds. The mean
    # hides one long hold among otherwise lively footage, and the hold is the
    # thing somebody leaves during.
    longest, run = 0, 0
    for s in still:
        run = run + 1 if s else 0
        longest = max(longest, run)

    return {
        "seconds": seconds,
        "cuts": int(cuts.sum()),
        "cuts_per_s": float(cuts.sum()) / max(1e-9, seconds),
        "motion": motion,
        "still_share": float(still.mean()),
        "longest_still_s": longest / SAMPLE_FPS,
    }


def show(path, m):
    print(f"{os.path.basename(path):28s} {m['seconds']:6.1f}s  "
          f"cuts {m['cuts']:3d} ({m['cuts_per_s']:.2f}/s)  "
          f"motion {m['motion']:.4f}  still {m['still_share']*100:4.0f}%  "
          f"longest still {m['longest_still_s']:4.1f}s")


# ─────────────────────────────────────────────────────────────────────────
# THE CHECK ON THE CHECK.
# ─────────────────────────────────────────────────────────────────────────

def _synth(path, kind, seconds=6):
    """Build a clip whose answer is known before it is measured."""
    if kind == "still":
        src = ["-f", "lavfi", "-i", f"color=c=gray:s=256x456:d={seconds}:r=30"]
        vf = "null"
    elif kind == "cuts-1hz":
        # A checkerboard that inverts once a second: one hard cut per second.
        src = ["-f", "lavfi", "-i", f"color=c=black:s=256x456:d={seconds}:r=30"]
        vf = "geq=lum='if(lt(mod(floor(T),2),1),255,0)':cb=128:cr=128"
    elif kind == "cuts-2hz":
        src = ["-f", "lavfi", "-i", f"color=c=black:s=256x456:d={seconds}:r=30"]
        vf = "geq=lum='if(lt(mod(floor(T*2),2),1),255,0)':cb=128:cr=128"
    elif kind == "pan":
        # A gradient sliding continuously: lots of movement, never a cut.
        src = ["-f", "lavfi", "-i", f"color=c=black:s=256x456:d={seconds}:r=30"]
        vf = "geq=lum='mod(X*2+T*120,256)':cb=128:cr=128"
    else:
        raise ValueError(kind)
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-vf", vf,
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
                    "-pix_fmt", "yuv420p", path], check=True)


def self_test():
    ok = True

    def check(name, passed):
        nonlocal ok
        print(f"  {'PASS' if passed else 'FAIL'}  {name}")
        ok = ok and passed

    with tempfile.TemporaryDirectory() as d:
        got = {}
        for kind in ("still", "cuts-1hz", "cuts-2hz", "pan"):
            path = os.path.join(d, f"{kind}.mp4")
            _synth(path, kind)
            got[kind] = measure(path)
            show(kind, got[kind])
        print()

        check("a still clip has no cuts", got["still"]["cuts"] == 0)
        check("a still clip is almost entirely still", got["still"]["still_share"] > 0.95)
        check("a still clip reports no motion", got["still"]["motion"] < 0.01)

        # ~1 and ~2 per second, allowing for sampling landing either side of
        # the change. What must hold is the ORDER and roughly the ratio.
        check("a clip cutting once a second measures about that",
              0.6 <= got["cuts-1hz"]["cuts_per_s"] <= 1.6)
        check("twice as many cuts measures as more cuts",
              got["cuts-2hz"]["cuts"] > got["cuts-1hz"]["cuts"])

        # THE ONE THAT MATTERS. A moving camera is not an edit.
        check("a continuous pan is not counted as cutting",
              got["pan"]["cuts_per_s"] < got["cuts-1hz"]["cuts_per_s"])
        check("a continuous pan does report motion",
              got["pan"]["motion"] > got["still"]["motion"] * 10)
        check("a cut-heavy clip is not called still",
              got["cuts-1hz"]["still_share"] < got["still"]["still_share"])
        check("the longest still run finds the hold",
              got["still"]["longest_still_s"] > 4)

    return 0 if ok else 1


def main():
    args = sys.argv[1:]
    if not args or "--self-test" in args:
        print("Building clips whose answers are known, then measuring them.\n")
        raise SystemExit(self_test())
    print(f"{'file':28s} {'dur':>7}  {'cuts':>14}  {'motion':>13}  {'still':>10}  longest still")
    for path in args:
        show(path, measure(path))


if __name__ == "__main__":
    main()
