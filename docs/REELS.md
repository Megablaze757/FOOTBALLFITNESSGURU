# Reels

Four scripts and three studio cards become 1080x1920 MP4s with a synthesised
voiceover, karaoke captions and an optional music bed. Everything is generated:
there is no footage, no presenter and no editing step.

This file exists because `scripts/record-reel.mts`, `scripts/measure-reel.mts`,
`scripts/measure-voice.py` and `scripts/make-voice-reference.py` all tell you to
read it. It is the operator's page. The reasoning behind each decision lives in
the code, in comments written at the point the decision is made — those are the
authority, and this is the map.

## Running one

The workflow does it: **Actions → Record reels**, pick a script and an engine.
It builds the static export, serves it, records, muxes with ffmpeg and uploads
the MP4 as an artefact.

Locally, you need the site built and served first:

```bash
npm run build
python3 -m http.server 8899 --directory out &
node --import tsx scripts/record-reel.mts standards --voice --out reels
```

A run takes about three minutes. Without `--voice` it records silent and fast,
which is the right way to check framing.

### What it reads

| Variable | What it does |
| --- | --- |
| `REEL_VOICE` | `chatterbox` (default) or `kokoro` |
| `KOKORO_MODEL` / `KOKORO_VOICES` | paths to `kokoro-v1.0.onnx` and `voices-v1.0.bin`, required for `kokoro` |
| `REEL_EMAIL` / `REEL_PASSWORD` | the demo account. Unset films the public pages — a worse reel, not a broken one |
| `PW_CHROMIUM` | a Chromium binary, when Playwright's own download is not the pinned one |

`REEL_MUSIC` is not read by the recorder. It belongs to the workflow, which
resolves it to a file (or a known track id, via `scripts/fetch-music.mts`) and
mixes the bed in at the ffmpeg step, after the voice is already muxed.

Never a real athlete's account: no real training, food or body data goes near a
video.

### The voice models

Chatterbox installs from pip (`chatterbox-tts`) and downloads its own weights.

Kokoro needs two files fetched by hand into `.voice/` — about 325MB:

```bash
mkdir -p .voice
base=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
curl -sSfL -o .voice/kokoro-v1.0.onnx "$base/kokoro-v1.0.onnx"
curl -sSfL -o .voice/voices-v1.0.bin  "$base/voices-v1.0.bin"
pip install "kokoro-onnx==0.6.1" soundfile
```

**Pinned deliberately.** An unpinned resolve alongside `chatterbox-tts` picked a
version whose `Kokoro()` reads the voices argument as JSON, and the voices file
is a `.bin` — so a three-minute recording died on a `UnicodeDecodeError`.

## Checking one without recording it

Recording is the slowest way to find out something is wrong. These are not:

| Command | What it answers |
| --- | --- |
| `npm run check:captions` | does every caption fit the frame, and stay inside three rendered lines |
| `node --import tsx scripts/measure-reel.mts` | how long the reel will be, and what share each route takes |
| `node --import tsx scripts/check-sync.mts` | do the captions line up with the audio |
| `python3 scripts/check-voice.py` | is there a voice in the file at all |
| `python3 scripts/check-music.py` | is the bed under the voice rather than over it |
| `bash scripts/check-loudness.sh` | is it at the level the platforms expect |
| `python3 scripts/measure-excitement.py` | is the delivery flat |

`check-captions.mts`, `check-music.py` and `measure-excitement.py` take
`--self-test`. That is not decoration: three audio metrics in this project were
confidently wrong before they were controlled, and a measurement you cannot
check is worse than none. Run the self-test when a reading surprises you, before
believing it — the caption one caught its own control on the first run.

`npm run check:captions` also runs in CI, in the e2e job, before the build.

## The frame

`lib/safe-zone.ts` holds the numbers, with the check that uses them.

```
1080 x 1920
  top    140px   sound credit and the top gradient
  bottom 400px   Instagram's caption, handle and buttons (TikTok's is ~320)
  left    60px
  right  180px   the action rail — profile, like, comment, share
```

Anything of ours underneath is invisible to everyone, and the file has already
been rendered. Two things make that easy to get wrong:

- **The overlay is written in CSS pixels and the frame is in frame pixels.**
  Playwright records 540x960 at `deviceScaleFactor` 2, so every clearance in
  this table is *half* as many CSS pixels. `padding: 0 28px` reads generous and
  is 56px of frame against a 180px rail.
- **The glyph outline is not layout.** The captions carry a heavy black ring so
  they are legible on any background, and `getBoundingClientRect()` does not
  report a pixel of it. Each element declares its own `dataset.bleed`, and the
  recorder grows the measured box by it before judging.

## The captions

`lib/caption-lines.ts` cuts text at 42 characters. That is a *caption* width and
not a *line* width: one character of the caption font averages 26.4 CSS px, so
the 412px band fits about fifteen, and 42 characters is three rendered lines.

So the ceiling is on what is drawn, not on what is counted — `MAX_CAPTION_LINES`
in `lib/safe-zone.ts`, measured on the page. Four lines is 45% of the frame in
text, over an app demo, which is the thing the reel is for.

When a caption is too tall, shorten the spoken line or give it a comma:
`captionLines` cuts at punctuation, so a comma splits one wall of text into two
readable captions. Length and duration have to come out right *together* — a
caption that fits on one line may then hold the screen too long and fail the
retention check. There is a worked example in the `standards` script's payoff
beat.

## The loop

Five of the seven scripts end on the screen they opened on. Replay rate is the
signal: above 1.2, distribution is reported as substantially stronger, and a
reel that loops plays again before the viewer decides to replay it.

Two reels deliberately go without it, because returning would push them past
`MAX_ONE_ROUTE_SHARE` — a reel that never leaves one screen is a screenshot
with captions over it, and that is the better rule.

The loop is a *picture*, not a URL: the closing beat glides the page back to the
top so the last frame is framed like the first. `closingDrift` in
`lib/reel-scroll.ts`.

## When a run fails

The recorder refuses rather than publishing something wrong, and each refusal
names what it wanted:

- **a move missed** — the label belongs to a view the reel never opens. A reel
  whose claim is "watch this happen", showing nothing happening, is worse than
  no reel.
- **a focus found nothing** — the beat is built around pointing at something
  that is not there, so the shot would contradict the line.
- **captions under the chrome, or over the line ceiling** — reported after the
  files are written, so there is a `.webm` to open and see it in.
- **retention problems** — refused before the browser launches, so it costs
  seconds rather than minutes.
