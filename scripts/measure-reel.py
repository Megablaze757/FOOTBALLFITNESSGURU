"""
The synthesis half of scripts/measure-reel.mts. Not run directly.

Speaks each phrase with the real voice at the rate lib/speech-prosody.ts gives
it, then does the same arithmetic lib/narration.ts does, so the numbers here
are the ones the recorder will refuse or accept on.
"""
import json, sys
from kokoro_onnx import Kokoro

job = json.load(open(sys.argv[1]))
k = Kokoro(job["model"], job["voices"])
bad = False

for script in job["plan"]:
    beats = []
    for b in script["beats"]:
        if not b["phrases"]:
            beats.append((b["route"], job["silent"]))
            continue
        # b["after"] is the end card's room (lib/reel-script.ts Beat.tail);
        # job["tail"] is the silence on every synthesised clip. Different things.
        ms = job["lead"] + b["hold"] + b.get("after", 0) + job["tail"]
        for ph in b["phrases"]:
            samples, rate = k.create(ph["text"], voice=job["voice"], speed=ph["rate"], lang="en-gb")
            ms += len(samples) / rate * 1000 + ph["gap"]
        # retime() takes the longer of the speech and the time to READ the
        # captions, which is what lib/caption-lines.ts calls beatFloorMs.
        # THE SAME ARITHMETIC AS retime IN lib/narration.ts, and it changed.
        #
        # This took max(speech, caption reading time). retime stopped padding
        # narrated beats to a reading time — a narrated caption is paced by the
        # sweep, not read cold, and the pad became slack that left one caption
        # sitting on screen for six seconds. So the estimate was over-counting
        # every reel against a rule the recorder no longer applies, and three
        # of four looked within a second of the ceiling when they were not.
        #
        # MIN_SCENE_MS is the floor that survives: a shot too short for the eye
        # to land on is a shot whether or not anybody is talking over it.
        beats.append((b["route"], max(job["minScene"], ms)))

    total = sum(ms for _, ms in beats)
    share = {}
    for route, ms in beats:
        share[route] = share.get(route, 0) + ms
    route, busiest = max(share.items(), key=lambda kv: kv[1])
    pct = busiest / total

    notes = []
    if total > job["maxMs"]:
        notes.append(f"OVER {job['maxMs']/1000:.0f}s")
    if pct > job["maxShare"]:
        notes.append(f"OVER {job['maxShare']:.0%} on one route")
    if notes:
        bad = True
    flag = ("  <-- WOULD BE REFUSED: " + ", ".join(notes)) if notes else ""
    # The band this length is graded against, so the number that matters is on
    # screen next to the length rather than in a document. See RETENTION_BANDS
    # in lib/reel-retention.ts for the figures and where they come from.
    aim = next(b["aim"] for b in job["bands"] if total < (b["underMs"] or float("inf")))
    # KOKORO'S TIMING, AND THE PIPELINE RECORDS WITH KOKORO TOO. These were
    # different engines for a while, and an unlabelled number from the wrong
    # one is how a reel passes here and is refused on the runner.
    print(f"{script['id']:<16} {total/1000:5.1f}s   busiest {route} {pct:.0%}"
          f"   needs {aim:.0%} completion{flag}")

print("\nTimed with Kokoro, which is what records these now — so this is no"
      "\nlonger an estimate across two engines. The estimator was refitted for"
      "\nit over all twenty beats of all four reels and lands within 0.7% in"
      "\ntotal, but up to 1.8s out on a single beat: treat anything within a"
      "\nsecond of the ceiling as over it.")

sys.exit(1 if bad else 0)
