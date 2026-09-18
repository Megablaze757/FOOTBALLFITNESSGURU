# Handover — the social engine, and what measuring it found

Written 2026-09-17. Everything below is either a measurement or a thing that is
still unknown, and it says which.

---

## The one number that governs everything

A reel went out and Instagram returned its retention curve. Digitised:

| at | still watching |
|---|---|
| 0.5s | 85% |
| 1.0s | **50%** |
| 2.0s | 21% |
| 3.0s | 11% |
| end (27s) | 2.4% |

Average watch **9.7%** — about 2.6 seconds of a 27-second reel. Roughly **133
views**, so this is one measurement of one reel, not a law. It is also the only
evidence this account has, and it beats a benchmark borrowed from someone
else's.

It is in the code as arithmetic now — `stillWatching(ms)` in
`lib/reel-retention.ts` — because the useful question is "given that something
happens at second N, how many people are there to see it?"

**The consequence nobody had drawn:** every reel's payoff is seen by under 11%
of the people who start it.

| reel | reveal at | still watching |
|---|---|---|
| demo-readiness | 11.4s | 7.9% |
| standards | 9.2s | 8.6% |
| card-cheapest-protein | 4.5s | 10.3% |
| demo-cost | 3.3s | 10.7% |

The **spread** is the finding, not the ranking. A reveal at 4 seconds and one at
12 reach almost the same tenth, so moving a payoff earlier buys very little.
What buys something is the reel being about its point *from the first frame* —
which is what the card formats already do, with the figure on screen before a
word is said.

The recorder prints this before it films. It is reported, not enforced: a rule
that failed every script would be switched off within a day, and the honest
reading is not "this script is broken" but "this format spends most of itself on
an audience that has gone". That is a decision about what to make.

---

## Fixed, with the measurement that found each one

| what was wrong | how it was found | now |
|---|---|---|
| Every spoken line landed ~150ms late | decoded the audio, compared each clip's first sound with its scheduled place | the model's own silence is trimmed off each clip before anything measures it |
| The hook destroyed every reel's first caption — drill's got **0ms** of a planned 1214ms | read the plan against the recorder's control flow | the hook holds on its own clock; captions run under it |
| `check-sync` reported `worst error 0.000s` on reels whose every word was late | it subtracts the schedule from itself | it now reads the finished MP4 for the first onset, and refuses two of the three old files |
| The caption file was written, uploaded nowhere, and filtered out on arrival | looked for it in the artefact and it was not there | in the artefact, in storage, and in the library — which also un-broke the **carousel's** caption link, dead since it was written |
| The carousel's caption had no claim checking at all | this audit | same `captionProblems` the reel uses, and the run fails rather than writing one |
| A test was rewriting the tracked `cloudflare/worker.js` mid-run | two sibling test files failing intermittently and passing in isolation | it works on a copy in a temp directory |

---

## The blank frame: known, measured, and still shipping

Every beat that arrives on an authenticated route opens on a loading screen.
Measured on finished files: `/home` **0.7s**, `/coach` 0.3s, `/nutrition` 0.2s.

**This was already known before I started.** `lib/reel-script.ts` has:

```
DATA_ROUTE_PAINT_MS = 2_300
```

with a comment measuring `/benchmarks` painting 2.09 seconds after navigation,
and ending: *"Nothing enforces this: a beat that needs it and does not have it
records a black screen and passes every check in the pipeline, which is exactly
how it shipped."*

**Nothing references that constant.** Exactly one beat in the project has the
hold it prescribes — `standards` on `/benchmarks`, set to literally `2300`.
Seven others arrive on a data route and start talking over a loading screen:

- demo-readiness beats 2 (`/home`, holds 900), 3 (`/coach`, 0), 4 (`/home`, 0)
- demo-cost beats 4 (`/nutrition`, 0), 5 (`/home`, 0)
- drill beat 3 (`/journal?log=training`, 0)
- standards beat 3 (`/dashboard`, 1980)

### What I tried, and why it failed

I made the recorder click the app's own link instead of reloading the document.
Every argument for it is true — the app does client-side routing, a marker on
`window` survives a click and dies on `page.goto`, and `lib/use-async.ts` holds
a module cache whose own comment says it exists to stop this exact skeleton
flash. **It made the reel worse**, and the check I had built two commits earlier
caught it:

```
caption drawn 2025ms after its moment, so 130ms of it is on screen
```

I then wrote a wrong explanation into the code, and the local timings refuted
it: soft navigation is **83ms cold, 40ms warm**, against 147ms for a full
reload. Clicking is *faster*.

**What actually happened:** 2025ms ≈ `DATA_ROUTE_PAINT_MS`. The soft navigation
waited for the page to genuinely be ready; `page.goto` returns at `load` and
films the black instead. My change was not slow — it was *honest*, and the
caption clock could not absorb the truth.

### Why the fix is not obvious

The slack before every route change is **0ms**, in all seven scripts — captions
run from one phrase's onset to the next by construction. The only window is the
`LEAD_MS + TAIL_MS` silence between beats, about **360ms**, against a paint that
takes up to 2300ms.

So the real options are all product decisions:

1. **Hold before speaking**, as the constant prescribes. Costs ~2.3s per data
   route; demo-readiness would exceed the 30s ceiling.
2. **Stop visiting data routes mid-reel.** Fewer screens, restructured scripts.
3. **Make the pages paint faster.** An app change, not a recorder change.

I did not pick one. Three attempts at this problem have now been made and two
were wrong, so the next step is one recording that prints how long each route
change actually took — not a fourth guess.

---

## The picture never moves, and nothing had ever measured it

The audio half has had an instrument since the "sleepy voice" thread, and every
voice decision was made with it. The picture had none. `scripts/measure-motion.py`
is that instrument; the first time it was pointed at a finished file:

| | dur | cuts/s | motion | still | longest hold |
|---|---|---|---|---|---|
| a reel this account admires | 12.9s | **1.94** | 0.0643 | **15%** | 0.8s |
| demo-cost | 27.1s | **0.00** | 0.0048 | 90% | 6.0s |
| demo-readiness | 27.8s | **0.00** | 0.0046 | 94% | 4.3s |
| drill | 28.4s | **0.00** | 0.0035 | 94% | 5.6s |
| standards | 27.7s | **0.00** | 0.0041 | 93% | **10.4s** |

**Zero cuts.** Not few — none, in any reel this project has ever made, against
roughly two a second in the one being compared against. 90–94% of frames are
near-identical to the one before, motion is 13–18x lower, and `standards` holds
one unchanging picture for **10.4 seconds** inside a 27.7-second reel.

Set against the measured retention curve at the top of this document — half the
audience gone inside one second — that is the most likely explanation sitting in
plain sight. What a viewer is given in that second is a still screenshot.

It is **reported, not enforced**: every reel the project owns would fail such a
check, and a rule that fails everything gets switched off within a day. The
instrument self-tests in the run before it is believed, and the self-test's
important case is that a continuous pan is *not* counted as cutting — a measure
that cannot tell a moving camera from an edit would call the slow drift down a
page "fast cutting" and congratulate the reel that is putting people to sleep.

**This is a decision, not a patch.** The recorder films one continuous slow
drift per screen by design. Cutting means either more camera positions per beat
or snapping the scroll instead of gliding it, and both change what the reels
look like.

### And the cheap version of that fix was measured and refuted

The obvious answer is "cut on every phrase boundary" — the phrase onsets are
already measured from the audio and already carried on each step, and the
captions are already cut there. `lib/reel-cuts.ts` is that arithmetic. Over all
seven real scripts it yields:

| | length | cuts | rate |
|---|---|---|---|
| demo-readiness | 26.0s | 4 | 0.15/s |
| demo-cost | 25.0s | 4 | 0.16/s |
| drill | 28.1s | 4 | 0.14/s |
| standards | 28.1s | 5 | 0.18/s |
| the three card formats | ~22s | 4 | 0.18/s |

Against 1.94/s. **An order of magnitude short**, and the reason is structural
rather than a setting: nearly every beat in every script aims a spotlight, a
spotlight is `position:fixed` and may not move under the shot, so nearly every
beat is excluded. What survives is the navigations the reels already had.

So closing this gap is not a parameter. It needs either scripts built from many
more, much shorter beats, or a recorder that can take more than one framing per
phrase — a different kind of video, not this one with cuts added.

`lib/reel-cuts.ts` is deliberately **not read by the recorder**, and a test
asserts that, because unverified arithmetic wired into the thing that makes the
videos is exactly how the blank frame shipped three times. It exists to make
the refutation reproducible.

## Audit findings not yet acted on

**The music never played, and now it does.** `lib/reel-music.ts` builds a full
sidechain-ducking chain, it is tested, and `lib/stock-audio.ts` holds two CC0
tracks. The workflow's `music` input defaulted to `""` and the comment said it
plainly: *"NOTHING PICKS THE MUSIC."* Every reel ever made shipped with voice
only — and the measurement above says that single fact is the whole gap between
these reels and the ones this account admires. Defaulted on. Note the dispatch
path needed its own fix: the admin panel starts recordings through
`repository_dispatch`, which never reads a `workflow_dispatch` input default,
so defaulting the input alone would have left every admin-triggered reel silent
while the form on GitHub looked correct.

**The carousel has one guard to the reel's dozen — now three.** 245 lines
against 1673. Its only check was "did the screenshot cut something off", plus
the caption checker once that was shared with it.

Checking *which* reel guards transfer mattered more than it sounds. The obvious
candidate was `outsideSafeZone`, which refuses anything under the 400px of
platform chrome — and it does **not** transfer. A reel is 1080×1920 played
full-screen with the app's caption and buttons drawn *on top*; a carousel is
1080×1350 in a feed with the caption *below* it. Nothing is drawn over a slide,
so borrowing that rule would have refused perfectly good layouts.

What does threaten a slide is different, and neither half was checked:

- **Contrast.** `lib/contrast.ts` had a full WCAG implementation and a
  `passesAA` that nothing called — it was on the unused-export list. Measured,
  every colour passes with room: the dimmest secondary text is 5.95:1 against a
  4.5:1 bar. Not a bug report — the thing that notices when a token is dimmed
  one step and the portion column stops being readable.
- **The size it is read at, which is not the size it is drawn at.** A slide is
  authored at 1080 wide and displayed at device width; on a 375pt phone that is
  a scale of 0.347, so 32px type is read at 11.1pt. Apple's HIG puts the body
  minimum at 11pt. The smallest type on a slide today is exactly 32px — it
  lands on the floor and fails the moment anything gets smaller. That matters
  more here than anywhere else in the project: a reel slightly too small is
  still a reel, but a reference table too small to read is nothing, and
  "reference material people save" is the entire argument for the format.

Three mutations each fail a test: dimming a colour, shrinking the body type,
shrinking the headline.

**The exported-name sweep has now been done.** 26 exported names in the social
engine are referenced by nothing outside their own file; 15 are types used
internally and harmless. Of the 11 values, ten are ordinary module constants
used inside their own file and merely over-exported. One was real:

`retentionBand(totalMs)` in `lib/reel-retention.ts` — exported, and called by
nothing in any language. It could not have been: the band depends on the reel's
finished length, and the length is not known until `scripts/measure-reel.py` has
estimated every beat, so the selection is made there. It is deleted, and
`lib/reel-retention.test.ts` now pins the Python's copy of the rule to the table
— the same arrangement `lib/win-back.test.ts` has with migration 0114's SQL.
Both duplications are forced by a process boundary; neither is allowed to be
silent. Two mutations of the Python (`<` to `<=`, and dropping the
infinity restore) each fail a test.

**The sweep was then run over the whole repository**, not just the social
engine: every exported *value* in `lib/`, `components/`, `app/` and `scripts/`
whose only appearance in tracked code is its own declaration. Ten, and they fall
into three groups.

*Built and never wired up — a product decision, not a tidy-up. Each one's own
doc comment describes a job it is not doing:*

| | |
|---|---|
| `components/FeatureLock.tsx` → `UpgradeNote` | "Inline nudge for a feature that degrades rather than disappears." Rendered nowhere, so no feature nudges. |
| `components/StrengthRanks.tsx` → `StrengthLadder` | "The ladder itself, so the ranks above are not unexplained words." Rendered nowhere, so the ranks *are* unexplained words. |
| `components/RankLadder.tsx` → `DivisionDots` | "The three divisions inside a tier, for the level card." The level card does not show them. |

These are working components sitting in the same files as the things that would
use them. Wiring them up is a change to what athletes see, so it is yours to
call, not mine.

*Dormant for a documented reason — now annotated so the next reader does not
mistake them for live:*

- `lib/native.ts` → `registerNativePush`. `ios/README.md` states the decision:
  *"Local notifications, not push: no device-token table, no APNs credentials,
  no scheduled job."* This is the client half of an architecture the project
  chose against. Calling it today would collect a device token with nowhere to
  put it. Left in place, with that written above it.
- `lib/session-shape.ts` → `orderWorkingBlock`. **The ordering it does is not
  missing from generated programmes** — `orderPlan` in `lib/program-validate.ts`
  runs on every plan and is a superset of it. Two implementations of one rule is
  a drift hazard whether or not both are called, and the dormant one is the copy
  nobody would notice breaking, so `lib/program-validate.test.ts` now pins it to
  the same answer the live one gives.

*Unused utilities, no stated promise broken:* `FIGURE_ZONES`
(`BodyStrengthFigure.tsx`), `regionOfDrill` (`lib/coach.ts`), `auditPlan`
(`lib/muscle-volume.ts`), and `REPLAY_RATE_TARGET` (`lib/reel-retention.ts`,
which documents itself as deliberately unenforced). **`passesAA` came off this
list** — it now guards the carousel's palette, which is the job it was written
for.

**A note on the sweep itself.** The first run reported `revealAudience` as
declared-and-never-used, which would have been a second `DATA_ROUTE_PAINT_MS`
and worse, because this session wrote it. It was wrong: the file-extension
filter did not include `.mts`, and `scripts/record-reel.mts` both imports and
calls it. Every `scripts/*.mts` in the project was invisible to the tool. A
sweep for unreferenced code is only as good as its idea of what a file is.

The pin written for `orderWorkingBlock` had the same disease in a different
form. It ran the function over a generated session and asserted the result was
in fatigue order — and it kept passing after the sort was deleted from the
function, because `buildProgram` already emits its working sets hardest-first.
The function was a no-op on that input, so the test was about `buildProgram`.
Found by mutating the function and watching nothing go red; the test now
reverses the session first, so restoring the order is work only a correct sort
can do. Both the Python pins and this one were mutation-tested before being
committed. **An assertion that cannot fail is worse than no assertion, because
it occupies the place where a real one would go.**

---

## Outside the social engine

Built this week, none of it deployed:

- `lib/proportions.ts` — Wilson intervals, Newcombe for differences, sample-size
  and minimum-detectable-effect arithmetic. Nothing returns a bare percentage.
- `lib/retention.ts` + migration **0113** — cohort retention from data already
  stored. No new table: an events table would have answered this for accounts
  created after the migration and left the existing ones unmeasurable.
- `lib/experiment.ts` — assignment and readout whose most useful answer is "do
  not run this".
- `lib/win-back.ts` + migration **0114** — the hole after day 30, where
  `CHECKIN_REMINDER_STOP_DAYS` stops all contact and nothing replaced it.
- `lib/funnel.ts` — `program_built` and `first_session` were recorded on every
  account and appeared in no report. They do now.

**The blocking fact:** the only sample size this project has ever written down
is migration 0045's *"22 users, 0 paying"*. At that size, 11 per arm can only
settle a difference of **more than 40 percentage points**. A five-point change
needs 1,377 per arm.

Simulating the worst case through the real modules: **the win-back sends zero
emails** — it refuses anyone without a statistic worth a sentence, and under the
worst reading that is everybody. It is correct code with no audience. Do not
deploy it yet.

---

## What needs a human

1. **Run `scripts/retention-report.mts`.** It takes the same env pair
   `db-verify.mjs` does, is read-only, needs neither 0113 nor 0114, and prints
   no identities — designed so the output is safe to paste back. It is the only
   thing that turns "assume the worst" into a fact, and it decides whether any
   of the experiment machinery is worth touching.
2. **Rotate the demo-account password** and update the `REEL_PASSWORD` secret.
   It is compromised twice over: once into a test fixture, and once into the
   sentence in this file that told you to rotate it. Both are in pushed git
   history, which keeps them whether or not the commit is reverted — so
   rotating is the only thing that closes it.

   The second one is a finding, not an apology. `lib/no-secrets.test.ts`
   compares tracked files against the secrets **in the environment it runs
   in**, and it skips only when it holds none of them. This machine had
   `GH_TOKEN` and nothing else — so the test ran, compared every tracked file
   against that one value, found nothing, and reported a green tick that reads
   like "no secret is committed" while seven of the eight it watches went
   unexamined. The file was pushed. CI has all eight and failed on the next
   run, which is after the push, which is the only part that matters.

   It now prints what it could not check: *compared against 1 of 8 watched
   secrets… NOT checked: REEL_EMAIL, REEL_PASSWORD, …*. Still a pass, because
   a developer machine legitimately has no production credentials and failing
   there would train people to set fake ones — but no longer a pass that looks
   like more than it is.

3. **Add a branch ruleset on `main`** requiring the `test` and `e2e` checks.
   Nothing enforces them on merge today.
4. **Decide the blank-frame trade** from the three options above.
5. ~~Decide whether reels get a music bed.~~ **Decided, by measuring.** A reel
   this account wanted to sound like was measured against ours on
   `scripts/measure-excitement.py`:

   |  | dead% | F0SD | range | Hz | dyn |
   |---|---|---|---|---|---|
   | the reel they liked | 2 | 4.10 | 13.32 | 119 | 4.3 |
   | ours, voice only | 34 | 5.11 | 17.71 | 125 | 9.5 |
   | ours + the bed | 4 | 5.39 | 18.36 | 123 | 9.4 |

   A third of our reel is **digital silence** — the floor measures -120dB
   between phrases, against a continuous 26dB floor in theirs. The voice was
   never the problem: ours carries more pitch variation and a wider range than
   the one being admired, before and after the bed. `record-reels.yml` now
   defaults to `dark-beat` on both entry points; `music: none` turns it off.

Migrations 0113 and 0114 are written and **not applied**. Both are in
`supabase/apply-0088-0114.sql`, which is safe to run twice — Actions -> "Apply
SQL to Supabase" -> Run workflow, or paste it into the SQL editor. That file was
also carrying 0111 as its last migration while three had landed past it, so
anybody who ran it since 0112 got a paste that stopped short; it is generated
from `supabase/migrations` now, header and contents list included.
