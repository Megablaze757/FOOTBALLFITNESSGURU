"""
WHICH KOKORO VOICE MAKES THE BEST CHATTERBOX REFERENCE — MEASURED AT BOTH LAYERS.

  python3 scripts/try-reference-voices.py            # the reference layer only
  python3 scripts/try-reference-voices.py --shipping # and through Chatterbox

The reels are a hybrid: Kokoro speaks a fixed passage, Chatterbox clones that
clip and performs the script. lib/speech-prosody.ts explains why. This script
exists because of what that hybrid does to a voice comparison.

─────────────────────────────────────────────────────────────────────────
THE RANKING AT THE REFERENCE LAYER DOES NOT SURVIVE THE PERFORMANCE LAYER.

lib/speech-prosody.ts already records the same mistake three times: a voice
chosen on ONE LINE, and the order reversing when a whole narration is measured.
The rule it settled on — "a voice is chosen on whole narrations or it is not
chosen" — is necessary and, it turns out, still not sufficient.

Measured on whole narrations, all four reels, at the 0.94 the committed
reference is made at, the American voices beat the incumbent on expression:

                 dead%   wpm  artic   F0SD  range    Hz
  bm_lewis          20   146    182   4.00  11.86    94   <- what ships
  am_puck           10   167    186   4.61  15.08   108
  am_fenrir         12   164    185   4.56  15.26   134

am_puck leads on pitch variability by 15%, on range by 27%, halves the dead
air, and lands at 108Hz — inside PITCH_DEADBAND_ST of VOICE_TARGET_HZ, so it
would need no pitch correction and would pay none of its cost.

On that table the answer is obvious and it is WRONG. Run the same two
references through Chatterbox, which is what actually ships:

                        dead%   wpm  artic   F0SD  range    Hz  rise/s   dyn
  chatterbox <- lewis      34   143    216   5.11  17.71   125    20.8   9.5
  chatterbox <- puck       22   161    208   4.07  13.18   115    15.2   8.6

The order reverses on every expression axis. The incumbent gains 25% pitch
variability, 34% range, more upward movement and more dynamic contrast — and
the candidate that led as a reference trails as a performance.

WHY, honestly: unknown. Chatterbox is doing the expressing, and what it does
with a clip is not a function of how expressive that clip was. The useful
conclusion is not a theory, it is that THE REFERENCE LAYER IS NOT THE THING TO
MEASURE. Only the shipping path counts, and it costs about eight minutes on a
CPU rather than eight seconds, which is exactly why it had not been done.

WHAT IS STILL OPEN. am_puck does cut dead air — 34% to 22% — and dead air is
the complaint that started this whole thread. That is a pacing lever, and
pacing levers that do not cost expression are worth having; CHATTERBOX_TEMPO
and the exaggeration/cfg tables are where to look, not the reference voice.

A NOTE ON THE ABSOLUTE DEAD-AIR FIGURES. This script joins the phrases with a
fixed 280ms gap, where the pipeline uses lib/narration.ts's LEAD_MS and
TAIL_MS. Both sides get the same treatment so the COMPARISON is sound; the
absolute percentage is inflated for both and should not be quoted on its own.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

REELS = {
    "demo-readiness": (
        "Every other app decided your week on Sunday. PocketAthlete asks first. "
        "So — slept badly, legs like concrete. Two taps. "
        "And there's your score. Brutal, but fair. "
        "Which is why today's session changed. Not a warning — lighter sets. "
        "PocketAthlete, free, link in the bio."),
    "demo-cost": (
        "£0.31 or £3.19, same 30 grams. The cheap one's red lentils. "
        "The dear one? Cooked king prawns. Hope they were nice. "
        "Every recipe in PocketAthlete is costed like that, before you buy. "
        "Build a week and it prices your whole shop. "
        "PocketAthlete, free, link in the bio."),
    "drill": (
        "Not fitness. Not effort. One detail, and it happens before you pass. "
        "Here's the drill. A wall and a ball. "
        "Your first touch decides the pass — set the ball outside your body, not under it. "
        "That's it. Log it in PocketAthlete and next week builds on what you did, "
        "not what you meant to. PocketAthlete, free, link in the bio."),
    "standards": (
        "Not until you say what you weigh. 100kg at 60kg bodyweight is exceptional. "
        "At 120kg, novice. Same bar. So log it. Takes one tap. "
        "And there it is, the rank PocketAthlete gives that lift. "
        "PocketAthlete, free, link in the bio."),
}

#: The incumbent, the American-energetic register the Instagram default sits
#: in, and the other British males as controls.
CANDIDATES = [
    ("bm_lewis", "en-gb"), ("bm_fable", "en-gb"), ("bm_george", "en-gb"), ("bm_daniel", "en-gb"),
    ("am_michael", "en-us"), ("am_adam", "en-us"), ("am_eric", "en-us"),
    ("am_fenrir", "en-us"), ("am_puck", "en-us"),
    ("af_heart", "en-us"), ("af_bella", "en-us"), ("af_nova", "en-us"),
]

#: The speed scripts/make-voice-reference.py builds the committed clip at, so
#: the only thing differing between a candidate and the incumbent is the voice.
REFERENCE_SPEED = 0.94

#: The passage the committed reference says. Kept the same so a candidate clip
#: is comparable to assets/reel-voice-reference.wav in every other respect.
REFERENCE_LINE = (
    "Every other training app hands you the session it planned on Sunday. "
    "PocketAthlete asks how you slept first. Two taps: bad night, wrecked legs. "
    "It scores you out of a hundred, and then it rebuilds today to match.")

OUT = os.environ.get("TRY_VOICES_DIR", ".voice-trial")
GAP_S = 0.28


def norm(x):
    """-1 dBFS, the way lib/wav.ts does it."""
    x = np.asarray(x, dtype=np.float32)
    return x / max(1e-9, float(np.abs(x).max())) * 0.891


def measure(path, words):
    out = subprocess.run(["python3", "scripts/measure-excitement.py", path, words],
                         capture_output=True, text=True)
    rows = [l for l in out.stdout.splitlines() if l.strip() and not l.startswith("label")]
    return rows[0].split() if rows else None


def reference_layer(kokoro):
    """Every candidate, every reel, as raw Kokoro. Fast, and not decisive."""
    print(f"{'voice':12s} {'dead%':>6} {'wpm':>6} {'artic':>7} {'F0SD':>6} {'range':>6} {'Hz':>6}")
    print("-" * 52)
    for name, lang in CANDIDATES:
        got = []
        for reel, text in REELS.items():
            path = os.path.join(OUT, f"{name}-{reel}.wav")
            if not os.path.exists(path):
                samples, rate = kokoro.create(text, voice=name, speed=REFERENCE_SPEED, lang=lang)
                sf.write(path, norm(samples), rate)
            row = measure(path, text)
            if row:
                got.append([float(v) for v in row[1:]])
        if not got:
            continue
        m = [sum(c) / len(c) for c in zip(*got)]
        print(f"{name:12s} {m[1]:6.0f} {m[2]:6.0f} {m[3]:7.0f} {m[4]:6.2f} {m[5]:6.2f} {m[6]:6.0f}")


def shipping_layer(kokoro, voices):
    """
    The same references, performed by Chatterbox. This is the one that counts.

    Slow — minutes per voice on a CPU — which is the whole reason the reference
    layer got measured instead and the wrong answer came out of it.
    """
    phrases = [p.strip() for p in REELS["demo-readiness"].split(". ") if p.strip()]
    words = REELS["demo-readiness"]
    print(f"{'reference':14s} {'dead%':>6} {'wpm':>6} {'artic':>7} {'F0SD':>6} {'range':>6} {'Hz':>6} {'rise/s':>7} {'dyn':>5}")
    print("-" * 70)
    for name in voices:
        if name == "committed":
            ref = "assets/reel-voice-reference.wav"
        else:
            ref = os.path.join(OUT, f"ref-{name}.wav")
            if not os.path.exists(ref):
                lang = dict(CANDIDATES).get(name, "en-us")
                samples, rate = kokoro.create(REFERENCE_LINE, voice=name, speed=REFERENCE_SPEED, lang=lang)
                sf.write(ref, norm(samples), rate)

        into = os.path.join(OUT, f"say-{name}")
        os.makedirs(into, exist_ok=True)
        if not os.path.exists(os.path.join(into, f"{len(phrases) - 1}.wav")):
            job = {"out": into, "phrases": phrases, "prompt": ref, "device": "cpu",
                   "exaggerations": [0.7] * len(phrases), "cfgs": [0.45] * len(phrases)}
            subprocess.run(["python3", "scripts/chatterbox-say.py"],
                           input=json.dumps(job), capture_output=True, text=True)

        parts, rate = [], None
        for i in range(len(phrases)):
            x, r = sf.read(os.path.join(into, f"{i}.wav"), dtype="float32")
            rate = rate or r
            parts += [np.asarray(x, np.float32), np.zeros(int(r * GAP_S), np.float32)]
        joined = os.path.join(OUT, f"ship-{name}.wav")
        sf.write(joined, norm(np.concatenate(parts)), rate)
        row = measure(joined, words)
        if row:
            v = [float(x) for x in row[1:]]
            print(f"{name:14s} {v[1]:6.0f} {v[2]:6.0f} {v[3]:7.0f} {v[4]:6.2f} {v[5]:6.2f} {v[6]:6.0f} {v[7]:7.1f} {v[8]:5.1f}")


def main():
    os.makedirs(OUT, exist_ok=True)
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(".voice/kokoro-v1.0.onnx", ".voice/voices-v1.0.bin")

    if "--shipping" in sys.argv:
        picked = [a for a in sys.argv[1:] if not a.startswith("--")] or ["committed", "am_puck"]
        shipping_layer(kokoro, picked)
        print("\nThe reference layer disagrees with this table. This one is the product.")
        return
    reference_layer(kokoro)
    print("\nINDICATIVE ONLY. Re-run with --shipping before believing any of it;")
    print("the ranking above reverses once Chatterbox performs the clip.")


if __name__ == "__main__":
    main()
