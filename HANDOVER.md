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

## Audit findings not yet acted on

**The music never plays.** `lib/reel-music.ts` builds a full sidechain-ducking
chain, it is tested, and `lib/stock-audio.ts` holds two licensed tracks. The
workflow's `music` input defaults to `""` and the comment says it plainly:
*"NOTHING PICKS THE MUSIC."* Every reel ever made has shipped with voice only.
Whether that is right is a taste-and-licensing call; that it is an accident is
not in doubt.

**The carousel has one guard to the reel's dozen.** 220 lines against 1588. Its
only check is "did the screenshot cut something off". Most reel guards do not
apply to static slides — but the caption one did, and now does.

**49 exported names in the social engine are referenced by nothing outside
their own file.** Most are types used internally and harmless. The list is worth
a pass; it is how `DATA_ROUTE_PAINT_MS` was found.

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
2. **Rotate the demo-account password** and update `REEL_PASSWORD`.
   `TESTACCOUNT123` went into a test fixture earlier in this session and is in
   pushed git history.
3. **Add a branch ruleset on `main`** requiring the `test` and `e2e` checks.
   Nothing enforces them on merge today.
4. **Decide the blank-frame trade** from the three options above.
5. **Decide whether reels get a music bed.**

Migrations 0113 and 0114 are written and **not applied**.
