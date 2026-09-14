"""
Print the audio filter chain that makes a reel as loud as the rest of a feed.

"I can't hear the voice." Four reels had shipped at -21.7 to -22.3 LUFS while a
feed normalises to about -14 — roughly half as loud as everything around them,
on a phone, usually in public.

WHY IT IS A CHAIN AND NOT A GAIN. lib/wav.ts normalises to -1 dBFS PEAK, so the
loudest single sample sits on the ceiling while the speech sits twenty
decibels below it. Crest factor measured 21 dB against the 12-15 that speech
normally runs. You cannot fix that with gain: +7.7 dB would put the peak at
+6.9 dBTP.

Measured, in order, on a real reel that started at -21.7:

  loudnorm alone, one pass        -17.4    (a dynamic filter cannot know the
                                            file's loudness before reading it)
  loudnorm alone, two passes      -16.6
  ... with linear=true            -16.6    (one gain for the whole file has
                                            nowhere to go under the ceiling)
  ... isolating filter from AAC   -16.5 at exactly -1.5 dBTP — so the filter
                                            is not falling short, it is ON the
                                            true-peak ceiling and cannot go up
  compressor then two passes      -15.9

The transients are the limit: plosives set the true peak while the sustained
speech sits far below, so the peaks have to come down before the body can come
up.

─────────────────────────────────────────────────────────────────────────
"A GENTLE 4:1 DOES THAT WITHOUT FLATTENING THE READ" — MEASURED, AND FALSE.

That sentence stood here unmeasured. lib/speech-prosody.ts deliberately builds
7.3 dB of phrase-to-phrase loudness contrast, on the argument that "the point
of a sentence is habitually several decibels above the clause that set it up,
and that contrast is most of what excitement is". Measuring the same phrases
either side of this chain:

  intended, as the prosody lays it        2.85 dB SD    7.3 dB range
  after this chain                        1.17 dB SD    3.4 dB range

More than half of it is gone before anybody hears it, and 3.4 dB is under the
4-6 dB that file cites for ordinary read speech.

AND IT IS NOT MOSTLY THE COMPRESSOR. loudnorm reports normalization_type
"dynamic" and takes the loudness range from 7.20 LU to 4.50. It falls back to
dynamic because linear is impossible here: lib/wav.ts normalises to -1 dBFS
PEAK, so the true peak arrives at -1.0 dBTP and a single gain toward -14 has
no headroom at all. LRA=20 and linear=true were both measured and change
almost nothing for the same reason.

What does recover contrast is taking the peaks down with a gentler compressor
and then applying ONE measured gain with a limiter for strays, rather than
letting loudnorm ride the level:

  compressor 2:1 @ -16dB, +11.2dB, ceiling -3dBFS   -16.6 LUFS  5.0 dB range
  compressor 3:1 @ -18dB, +12.2dB, ceiling -3dBFS   -16.3 LUFS  4.6 dB range
  this chain, as it ships                           -15.3 LUFS  3.4 dB range

That is 1.6 dB more contrast for 1.3 dB less loudness, both inside the band
check-loudness.sh allows. It is left UNCHANGED deliberately: the defect that
built this chain was "I can't hear the voice" at -21.7 LUFS, and trading
measured loudness for measured contrast is a judgement about which the ear
prefers that nobody has made by listening. The numbers are here so that it can
be made rather than guessed.

-15 IS THE ANSWER, NOT -14. Reaching exactly -14 needs 6:1 at -24 dB, which
takes the loudness range to 4.0 LU — speech sits at 5-8, and past that it
stops sounding like somebody talking and starts sounding like a tannoy. The
defect was -21.7. Anything in the mid-teens is in the band platforms deliver,
and they normalise up as well as down.

  ffmpeg -af "$(python3 scripts/loudnorm-args.py voice.wav)" ...

A SCRIPT RATHER THAN A LINE IN THE WORKFLOW because the first attempt was a
python -c inside a shell $() inside a YAML block scalar, and the quoting ate
itself before it ever ran.
"""
import json
import subprocess
import sys

I, TP, LRA = "-14", "-1.5", "7"
# Gentle, and ahead of the normaliser so the normaliser measures what it will
# actually be given. 4:1 from -20 dB catches the plosives and leaves the read.
PRE = "acompressor=threshold=-20dB:ratio=4:attack=5:release=120"

path = sys.argv[1]
out = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", path, "-af",
     f"{PRE},loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json", "-f", "null", "-"],
    capture_output=True, text=True,
).stderr

start, end = out.rfind("{"), out.rfind("}")
if start < 0 or end < start:
    print(f"could not measure the loudness of {path}", file=sys.stderr)
    sys.exit(1)
m = json.loads(out[start:end + 1])

print(
    f"{PRE},loudnorm=I={I}:TP={TP}:LRA={LRA}"
    f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
    f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
    f":offset={m['target_offset']}"
)
