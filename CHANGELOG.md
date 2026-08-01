# Changelog

Notable changes, newest first. Dates rather than version numbers — the app ships
continuously from `main` and there is nothing to pin a semver to.

Each entry says what changed **and what an operator has to do about it**. A
change that needs a migration applied or the Worker re-pasted is not done when
it merges, and a changelog that doesn't say so is how a feature sits dark for a
fortnight while everyone assumes it shipped.

---

## 2026-08-01 — Running, meal photos, connected wearables

Sixteen commits, 39 files, ~4,900 lines. Merged to `main` as `fb9cca5`.

### Requires action before this fully works

| Step | Status |
|---|---|
| Apply migrations `0064` + `0065` | **done** — verified against the live project |
| Paste the Worker bundle (`2026-08-01.1`) into Cloudflare | **outstanding** — live still reports `2026-07-29.1` |
| Set the `NEXT_PUBLIC_API_URL` repo Variable, then re-run the Pages deploy | **outstanding** |

Until the last two are done the site runs on its on-device fallbacks: the AI
coach uses the local engine, meal photos can't reach a vision model, and the
Apple Health screen correctly reports there is nowhere to push to. Nothing is
broken; it is degraded on purpose and says so.

### Added

**Running, as an actual sport.** `lib/running.ts` — five training zones defined
against both heart rate and pace, threshold pace derived from any race the
athlete has logged, the fourteen run types, and the rules that stop a week
hurting someone (the 80/20 easy/hard split, hard days never adjacent, a ceiling
on how fast weekly volume may grow).

**Runs in every sport's programme, not just a runner's.** Nine runs are ordinary
library exercises with no sport restriction, so a footballer's conditioning or
any sport's recovery day can be a run. Recovery runs included.

**Zones everywhere they're prescribed.** Every run in a programme reads
`45 min · Zone 2 (Easy)` with the talk test on the cue, because a zone number
coaches nobody without a heart-rate strap. A zone reference lives on the
exercise library, showing the athlete's own paces once they've logged a race.

**Runner inputs on `/coach`.** Race goal, current weekly mileage and experience
level, so a block is built from where someone actually is. Paces are shown
before the block is generated, not only inside it.

**Run logging on the check-in.** Which of the fourteen run types it was, which
zone it *actually* was (not the one you meant), distance, and average heart rate.
The easy-vs-hard split then appears on Progress.

**Meal photos.** Photograph a plate and get an estimate. A separate vision model
chain on the Worker; the image is downscaled to 768px on the phone first.

**Connected wearables.** Oura via a personal access token, verified against Oura
before storing and re-pulled nightly. Apple Health via a Shortcut posting to a
per-user ingest endpoint, with a five-step setup guide. Whoop and Garmin are
shown as blocked, with the reason — both need a developer application approved,
which no amount of code fixes.

**Biometric trends on Progress.** HRV, resting heart rate and sleep against the
athlete's own rolling baseline.

### Changed

**The nutrition page has one card for today instead of five.** The calorie figure
used to appear four times on one screen, twice at the same size, and the two
headline numbers disagreed whenever anyone used both. Nothing was removed — the
rationale, the metabolic working and the manual overrides moved into a closed
disclosure.

**Meal estimates are editable before you accept them.** Identifying the food is
what a model is good at; deciding whether that was 200g of rice or 90g is not,
and portions are most of the error in a calorie count.

**Estimating runs in the background.** Leave the tab, come back, get told when it
lands — the same job runner the programme builder uses.

**A much better portion prompt.** Real scale references for photos (a dinner
plate is 27cm, a fork 19cm, a mug 300ml, a fist 150–200g) and UK household
measures for text, plus cooked-vs-dry weights, cooking fat nobody mentions, and
round numbers instead of a false-precision `187g`.

**"Training load", not "ACWR".** The acronym was still showing on the logged-out
landing page — the one audience guaranteed not to know what an acute:chronic
workload ratio is — and on the weekly report, the page whose whole purpose is
being handed to a coach or physio.

### Fixed

**Runs were being prescribed on badly injured limbs.** The engine refuses a
movement when pain is 7+ and its load on that joint is 2+, and the runs' joint
loads were set too low — so a torn hamstring at 8/10 was still handed a
75-minute long run, and an 8/10 knee got strides, which are near-maximal
sprinting. Running is the classic hamstring re-injury mechanism. No run now
survives severe lower-limb pain; the bike, rower and pool still fill the slot.

**Runs were dosed like lifts.** A two-set floor made a long run read `sets: 2`;
an RPE floor of 5 clamped a recovery run's RPE 2 up to 5, which stops it being a
recovery run; and rep-scaling took a 75-minute long run to 105 by week 3 — about
four times what a runner should add. Runs progress in duration only, capped, and
their effort never moves.

**The floating nav on an installed iPhone app.** Scrolling past the end of the
document rubber-bands the page, and in a standalone PWA that bounce drags
`position: fixed` elements with it. `overscroll-behavior-y: none` removes the
bounce. Also: `background-attachment: fixed` was forcing Safari to repaint the
page gradient on every frame of every scroll, and dropped frames are exactly when
a browser starts mishandling everything else that's fixed.

**The page scrolled underneath the open More sheet**, which reads as the nav
coming loose.

**Tab labels collided.** Six tabs on a 320px phone gave each 45px with no gutter,
so the bar read as "Check in Progress" — one phrase.

**The nutrition tabs disagreed about calories.** `planTargets` was a second,
simpler calculation with no resting-rate floor, no under-18 guard and different
protein-per-kg, so the meal plan was built to a different number from the one on
the daily card. One calculation now.

**`applyTargets` wrote target macros into the field that holds intake.** One
field, two meanings depending on which control you last touched — which as
progress bars meant tapping it filled all three to 100% and claimed you'd eaten
a day's food you hadn't touched.

**The Apple Health screen showed an unusable address** on revisit — it
interpolated an empty `NEXT_PUBLIC_API_URL` into a relative path that sends a
Shortcut's data nowhere, silently.

**The nutrition card ignored the manual calorie target**, filling towards the
computed one instead.

**The tab bar's `bottom` had no fallback.** It was an inline
`max(1rem, env(safe-area-inset-bottom))`, and any engine not understanding
`env()` drops the whole declaration — leaving `bottom: auto`, which is precisely
the "nav at the bottom of the page instead of the screen" failure.

**The `biometrics.source` constraint would have broken CSV imports.** The CSV
parser has always written `'import'`; the constraint listed what the values were
*supposed* to be called.

### Notes

- `npm run lint` is still unconfigured — it drops into an interactive setup
  prompt, so nothing has ever been linted. Pre-existing.
- The Supabase database password is in git history and wants rotating.
