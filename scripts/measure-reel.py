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
        ms = job["lead"] + b["hold"] + job["tail"]
        for ph in b["phrases"]:
            samples, rate = k.create(ph["text"], voice=job["voice"], speed=ph["rate"], lang="en-gb")
            ms += len(samples) / rate * 1000 + ph["gap"]
        # retime() takes the longer of the speech and the time to READ the
        # captions, which is what lib/caption-lines.ts calls beatFloorMs.
        beats.append((b["route"], max(ms, b["floor"])))

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
    print(f"{script['id']:<16} {total/1000:5.1f}s   busiest {route} {pct:.0%}{flag}")

sys.exit(1 if bad else 0)
