"""
Synthesise phrases to wav files with Chatterbox.

THE SAME CONTRACT AS kokoro-say.py, deliberately: a JSON job on stdin, one
JSON line per phrase on stdout, <out>/<n>.wav on disk. The recorder should not
have to know which engine it is talking to beyond building the job.

  {"out": dir, "phrases": [...], "exaggerations": [...], "cfgs": [...],
   "prompt": "reference.wav" | null}

WHY A SECOND ENGINE AT ALL. "The voice is still not good, feels robotic... it
needs to feel excited, grab the audience's attention, not just talking at you
like it's reading off a script."

Kokoro is fast, free, offline and 325MB, and it has no expression control. Its
pitch variability tops out around 4.35 semitones however it is tuned — see the
note in lib/speech-prosody.ts, and scripts/measure-voice.py for the
measurement. Excitement is not a knob it has. Chatterbox is also free (MIT)
and also offline once the weights are cached; it is bigger and slower, and it
has the knob.

  Kokoro, as it ships       F0 SD 4.13 st   range 14.65 st   7.84s
  Chatterbox ex0.5 cfg0.5   F0 SD 6.17 st   range 19.08 st   6.98s

RATE IS GONE AND THAT IS NOT A REGRESSION. Chatterbox has no speed parameter,
so the per-phrase rate shaping in lib/speech-prosody.ts does not apply here.
`cfg_weight` is the equivalent lever — lower is looser and quicker — and it is
shaped per phrase by the same Role table, so the tempo still changes four times
rather than never. Time-stretching afterwards was the alternative and it is a
phase vocoder smearing a voice to imitate a control the model already has.

A REFERENCE CLIP IS OPTIONAL AND IS THE BIGGEST LEVER. `prompt` clones the
speaker in a wav. It must be somebody who consented — the app's own owner
reading a hook is the intended case. Note that a reference of somebody READING
fights this: clone a calm reader and no exaggeration setting will make them
sound excited, because the thing being imitated is a person reading off a page.
"""
import json
import sys
import wave

# ─────────────────────────────────────────────────────────────────────────
# STDOUT IS THE CONTRACT AND THE LIBRARIES DO NOT KNOW THAT.
#
# The first Chatterbox run failed with:
#
#     SyntaxError: Unexpected token 'l', "loaded Per"... is not valid JSON
#
# Loading the model prints progress to stdout, and the recorder parses every
# stdout line as JSON because that is what this channel is for. One line of
# library chatter and a three-minute recording run is lost.
#
# The real stdout is taken here, before anything is imported, and everything
# else in the process writes to stderr — where it belongs, in the run log. A
# filter on the reader would have been the other option and it is the wrong
# one: it teaches the pipe to ignore output it cannot parse, which is how a
# real error becomes silence.
# ─────────────────────────────────────────────────────────────────────────
ANSWER = sys.stdout
sys.stdout = sys.stderr

import soundfile as sf  # noqa: E402
from chatterbox.tts import ChatterboxTTS  # noqa: E402

job = json.load(sys.stdin)

# ─────────────────────────────────────────────────────────────────────────
# THE REFERENCE IS BUILT HERE, NOT SUPPLIED.
#
# Chatterbox has one speaker and he is neither British nor young, and the
# audience for this app is UK football and barbells. Kokoro has four British
# male voices and no expression control. So Kokoro speaks a reference passage
# and Chatterbox performs it: the accent, gender and timbre come from one, the
# pitch range and emphasis from the other.
#
# Both are permissively licensed for commercial use and no human's voice is
# involved, so there is nobody to get consent from and nobody to impersonate.
# See the note in lib/speech-prosody.ts for the measurements that chose it.
#
# An explicit `prompt` still wins. If somebody records themselves and points
# this at the file, that is a better reference than anything synthesised, and
# the consent question answers itself.
# ─────────────────────────────────────────────────────────────────────────
prompt = job.get("prompt") or None
if not prompt and job.get("reference_voice") and job.get("reference_line"):
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(job["model"], job["voices"])
    samples, rate = kokoro.create(
        job["reference_line"], voice=job["reference_voice"], speed=0.94, lang="en-gb",
    )
    prompt = f"{job['out']}/_reference.wav"
    sf.write(prompt, samples, rate)

model = ChatterboxTTS.from_pretrained(device=job.get("device", "cpu"))

phrases = job["phrases"]
exaggerations = job.get("exaggerations") or []
cfgs = job.get("cfgs") or []
for index, text in enumerate(phrases):
    # Per phrase, or the job's single value, or Chatterbox's own defaults. A
    # caller that shapes nothing still gets a working reel.
    ex = exaggerations[index] if index < len(exaggerations) else job.get("exaggeration", 0.5)
    cfg = cfgs[index] if index < len(cfgs) else job.get("cfg", 0.5)
    wav = model.generate(text, exaggeration=ex, cfg_weight=cfg, audio_prompt_path=prompt)
    path = f"{job['out']}/{index}.wav"
    sf.write(path, wav.squeeze(0).numpy(), model.sr)
    with wave.open(path) as handle:
        ms = handle.getnframes() / handle.getframerate() * 1000
    print(json.dumps({"index": index, "path": path, "ms": ms}), file=ANSWER, flush=True)
