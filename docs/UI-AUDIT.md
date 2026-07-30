# UI v2 audit — every page, every menu

The goal, in the user's words: *"make it obvious what to do and what's
important"*, *"less of a commitment and more like a supplement and tool"*, and
*"different interfaces based on what sport you're doing so it feels more tailor
made"*.

Three rules fall out of that, and they're the standard everything below is
measured against.

1. **One obvious top.** Every page answers "what do I do here?" above the fold,
   once, with the rest of the page as supporting evidence. A screen where eight
   cards have equal weight has no top, and the reader bounces.
2. **Offer, don't demand.** Streaks, quests and checklists are a bonus for the
   people who like them, never a debt. If skipping something costs nothing, say
   so out loud.
3. **Say what you get.** Labels and headings use the athlete's words, and the
   heading you land on matches the label you tapped.

Status legend: **done** · **partial** — the frame is right, contents aren't ·
**todo**.

---

## Navigation — done

### Reachability audit

Mapped every route to everywhere it links from. One finding dominated: **/squad,
the entire coach product** — roster, readiness at a glance, assigning programs,
team exercises, per-athlete analytics — had **no navigation entry at all**. The
only way in was a link on the Profile page, so a coach set their role to Coach
and then had to guess where their squad lived. Ten athlete features had a front
door and the paid coach feature did not.

Fixed with a conditional `COACH_NAV`: "My squad" appears in the sidebar and the
mobile More sheet only for coaches and admins. Deliberately NOT added to
NAV_ITEMS — most users are athletes, and a permanent tab that opens onto a
"coaches only" wall is worse than a missing one. The role is cached per tab and
cleared when someone changes it on their own profile, so ticking "Coach" makes
the entry appear without a reload.

Also from the same audit:

- `/benchmarks` and `/body` are reachable only from Progress, which is the right
  home — but they were labelled **"PRs"** and **"Body"**. "PRs" is jargon a
  15-year-old may not know. Now "Benchmarks" and "Weight".
- `/history` links from nowhere and should: it is a deliberate redirect kept
  because the URL is in old emails and bookmarks. Correct as-is.
- `/train/view`, `/squad/view` and `/reset-password` also link from nowhere and
  should — they are opened with an id or from an email, never browsed to.

Five of ten labels were unguessable. "Train" opened video analysis while the
place you actually train was "Coach"; "Journal" was a check-in, not a diary;
"Playbook" and "Library" both sounded like reference material.

| Route | Was | Now |
|---|---|---|
| `/coach` | Coach | **My plan** |
| `/journal` | Journal | **Check in** |
| `/train` | Train | **Video analysis** |
| `/library` | Library | **Exercises** |
| `/essentials` | Playbook | **Guides** |

Routes are unchanged — they're bookmarked, emailed and baked into a static
export, and renaming buys nothing a label doesn't.

Mobile bar was Home / Coach / Journal / Playbook / Train: two of five primary
tabs spent on reference content and video analysis, with Progress buried in the
More sheet. Now the four things you'd touch on a normal day, everything else in
More. Pinned by `lib/nav.test.ts`.

## Home — done

Was: greeting with a streak, rank, XP bar, four-step checklist, readiness gauge,
coach paragraph, four links, biometrics card, three "daily quests". Nine
sections, all equal weight, every one of them a demand, and all of it before the
app had been useful once.

- **`NextUp`** leads: one derived action, naming the actual next session
  ("Week 2 · 6 exercises"), or "build a program" if there isn't one.
- Readiness moved **below** it — a score isn't a decision.
- Tools sit under "Anything else" as small uniform tiles.
- "Daily quests" → **"If you fancy it today"**, with a Hide that sticks.
- "Check-ins 3/7" → just the count. A denominator turns a record into a score
  out of seven you're failing.
- Soreness card appears at 4/10+ on any joint, escalating past 7/10.
- **Bug fixed:** the getting-started checklist asked whether you'd checked in
  *today*, not *ever*, so the first-run card resurrected every morning anyone
  skipped a day — nagging month-old users.

## Progress (`/dashboard`) — done

Twelve cards, zero primary actions. Injury risk, fatigue trend, sleep, weight,
acute:chronic ratio with a band chart, 14-day chart, weekly report, four links —
all the same size. Every number real; the page still didn't answer "so what?".

**`Verdict`** now leads with exactly one thing, in strict priority: load spike →
elevated risk → detraining → what's going well. That order is the sequence in
which these things injure you. Only one shows at a time.

## Guides (`/essentials`) — done (discoverability)

Injury and mobility were two levels down: nav → Guides → third tab. The worst
possible place for what people need when something hurts, because pain is the
moment they stop exploring.

Tabs are deep-linkable (`?tab=injury`), "Injury & mobility" is its own tool
tile, and home surfaces it on reported soreness.

**REVERSED: injury is now its own page.** I argued against splitting it, on the
grounds that the four blocks shared state with Guides and the deep link plus tool
tile plus soreness card were enough. They were not. The feedback came back twice:
"still not clear where the injury stuff is".

That argument was convenience dressed as design. A tab is not a location — nobody
in pain browses a page called "Guides" hoping the third tab is about them, and
pain is exactly when someone stops exploring and gives up. Cost of the split was
extracting ProtocolCard to a component and duplicating a body map; that was
always the real reason not to, and it was never a good one.

 is in the nav, named the same in all three places it appears, with the
rehab planner, the body map, matched protocols, the full guide library and the
mobility sequence. Mobility came too — the warm-up was stranded under "Your
position", equally unfindable for anyone trying not to get hurt. 
forwards, since that link is out in the wild.

## Rehab planner — done

Plans were held in React state and **never persisted**. Generate one, switch
tab, gone. Now saved to `rehab_plans` (migration 0061) from inside the job, so
leaving the page keeps the result, and reloaded on mount.

Not readable by coaches, unlike `body_logs` and `biometrics` — a description of
what hurts is the most sensitive thing anyone types here.

## My plan (`/coach`) — partial

806 lines, **three separate `<h1>`s**, three tabs (Today / Program / Ask coach).
The tab structure is sound and the heading now matches the nav.

The locked state now has a lead. Readiness on this page also accounts for
training load, which it silently didn't — a CRLF mismatch meant the parameter was
added and never used, so the page reported readiness that ignored load while
TypeScript accepted the unused argument.

The Today tab also called the next unticked session "Today's session"
unconditionally — so after you'd trained it presented the *following* session as
today's, which is how someone ends up doing two in a day or assumes the app lost
the first. It now reads "Next session" once anything is logged today, and says
there's no need to do it now.

**Todo:**
- Not sport-aware beyond the program contents. A weightlifter's plan page reads
  identically to a footballer's.

## Readiness consistency — done

The load-in-readiness fix had to be applied at **every** call site, and wasn't.
Auditing all seven found three still computing a verdict that ignored training
load, so the same engine gave different answers on different screens:

| Where | Was |
|---|---|
| Check-in result screen | the screen most people actually read their readiness on — could say "good day for a higher-intensity session" while Home said Yellow a tap later |
| Squad list | a coach's triage screen showed greens next to load spikes it couldn't see |
| Squad → athlete | a green gauge directly above a red training-load card, for the one screen where someone else's health is the decision |

All three now pass the ratio. The squad queries had to start selecting
`intensity` and `drills` too — without them `sessionLoad` is 0 and ACWR reads
"building" for the whole roster.

`lib/trends.ts` is deliberately left alone: it builds a historical day-by-day
series, and back-computing a rolling ratio per past day is a different job from
reconciling today's verdict.

## Nutrition — done

Seven cards plus tabs, and it never did the subtraction — a target, macros, a
water figure and a log form, with nothing saying whether you were on track.

`FuelVerdict` now leads above the tabs: the target when nothing is logged, "you're
600 kcal short" past a 250 tolerance, over-target said without moralising, or on
target. Tolerance is 250 because a calorie target is an estimate and treating a
100 kcal miss as failure is false precision. The macro that matters is chosen by
sport — protein for lifters, carbs for runners.

## Exercises (`/library`) — done

Filtered by sport already, but "general" is 500+ imported gym movements with no
`sports` tag — so a rugby player's dozen rugby drills were the first dozen rows
of a list that looked and scrolled exactly like everyone else's. Tailoring you
have to notice isn't tailoring.

A **"Made for rugby"** band now sits above the full list, capped at six, and only
while browsing: once someone types a query or picks a category they're hunting
for something specific and a sport band is in the way.

`DrillPicker` — the other way into the same catalogue, used when logging training
— was searching the raw list with no sport filter at all. Now shares
`getExercisesForSport`.

## Check in (`/journal`) — done

Was a body map, three sliders, weight, match toggle and a full training log —
about a dozen interactions daily before the app said anything. Quick mode asks
three things as taps (~10 seconds); the body map only appears if you say
something hurts. Full form is one tap away and the choice is remembered.

## Smaller app pages

| Page | Status | Note |
|---|---|---|
| Rewards | done | "keep the streak alive" removed |
| Profile | done | had no lead at all; now has one |
| Benchmarks | done | sport-ordered metrics; catalogue extended |
| Body | done | lead rewritten |
| Squad | done | lead rewritten to what a coach actually scans for |
| Squad → athlete | done | `CoachVerdict` leads: one line on what to do, in priority order. Advisory, never diagnostic — a coach isn't their athlete's physio, so it reports what the data says and suggests a conversation rather than issuing a clearance |
| Video analysis | done | lead rewritten; background job + error recording |
| Report | done | had no on-screen explanation at all — the only heading lived inside the printable sheet. A no-print lead now says what it is for: something to show a coach, physio or parent, built only from what you logged |
| History | n/a | 26 lines, a redirect. Nothing to audit |
| Onboarding | done | structure was already right — four steps ending on "Build my first program" as primary, which matches Home. Copy fixed: grand vague blurb replaced with what you actually get, and it still said "playbook" |
| Admin | out of scope | 11 cards, 587 lines, internal only. The goal is athlete-facing clarity; restructuring a back-office panel spends effort no user sees |

## Public pages — partial

The landing page and pricing now read to the new goal. The SEO pages and waitlist
have not been through it.

**Landing:** step 01 was "Check in — 60 seconds each morning", so the first thing
a stranger learned was the daily obligation, before they knew what they got for
it. Reordered to Get your plan / Train it / Check in when you can / See what is
working, matching what the app itself now opens a new athlete on. The hero led
with "Check in each morning" and now leads with the plan. Two stale timings
fixed ("60 seconds", "under a minute" — it is three taps). All six sports named
instead of "lifting & more", which is honest now that each has its own tests,
drills, vocabulary and tool order.

**Pricing:** "Free is the daily habit" -> "Free covers tracking and looking
things up". Same split, without selling the obligation as the free tier.

| Page | Note |
|---|---|
| `/` landing | 4 cards, 2 CTAs — written to the old "commitment" framing |
| `/plans`, `/pricing` | not reviewed |
| `/drills`, `/drills/[sport]` | both fine — an earlier survey flagged the sport page as missing a lead, which was a false positive: a comment block pushed its `<p>` outside the regex window |
| `/guides`, `/guides/[sport]/[position]` | SEO pages, not reviewed |
| `/waitlist` | 2 `<h1>`s |
| `/login`, `/reset-password` | forms; no heading by design |
| `/privacy`, `/terms` | legal; fine as-is |

## In-page menus — done

All four tab strips are done. Two of them were hand-rolled copies of the same
markup with no roles, no aria-selected and no arrow keys, so the same control
behaved differently depending on which page you were on — Coach and Guides now
use the shared component. It gained an accessible name, arrow/Home/End keys with
wrapping, one tab stop for the strip instead of one per tab, and a TabPanel so
the aria-controls it advertises actually resolves.

Also a naming fix: the Progress page had a tab ALSO called Progress, so it read
"Progress > Progress" and neither name said which half held what. Now Recovery
and Performance.

Modals and the job tray are done too:

- **WorkoutPlayer** is a full-screen overlay that covered the whole app and
  announced as a plain div, so assistive tech was never told the page behind had
  gone away — and Escape did nothing, making the ✕ the only exit. Now
  role=dialog, aria-modal, aria-labelledby and Escape-to-close.
- **ExerciseModal** already handled Escape but had no dialog semantics. Added.
- **JobTray** is the whole point of background jobs — something finishes while
  you are elsewhere. A sighted user catches it peripherally; a screen-reader user
  was told nothing at all. Now role=status with aria-live=polite, so it waits
  for a gap rather than cutting in.

Nothing further outstanding here. Previously listed but reviewed and fine: the
tab strips on Coach, Progress, Nutrition and Guides; the workout player; the
`JobTray`; `LoadErrorBanner`; and the modals inside Squad and Admin.

---

# Per-sport recommendations

`lib/sport-profile.ts` implements accent, tagline, tool order and headline
benchmarks. What each sport has, and what it still wants.

## Football ⚽ `#4ade80`
*"Train for the weekend, recover for the one after."*
Tools: plan → video → progress → injury → exercises → guides → nutrition.
Benchmarks: 10m, 40m, vertical jump, Yo-Yo IR1, squat.

**Wants next:** matchday countdown on home (they train around a fixture, and the
app doesn't know when it is); position-specific loading in the plan page.

## Rugby 🏉 `#f0824a`
*"Get bigger, hit harder, and still be right on Saturday."*
Was **aliased to football outright** — same vocabulary, same tests. Now has its
own: "Minutes on the park", contact-load framing, Bronco test.

**Contact load is now a real input** (migration 0062). Rugby logs contact minutes
separately and they count double in sessionLoad, so a contact week spikes ACWR
that minutes alone would have shown as flat — there is a test for exactly that.
2x is the conservative end of the collision-load literature; it is a weighting,
not a measurement, and deliberately blunt rather than falsely precise.

**Wants next:** forwards and backs want different benchmark sets.

## Basketball 🏀 `#fb923c`
*"Jump higher, change direction faster, land safely."*
Benchmarks: vertical jump, lane agility, 20m, squat.

**Wants next:** landing mechanics is the highest-value video analysis for this
sport and isn't promoted as such; back-to-back game scheduling isn't modelled.

## Running 🏃 `#38bdf8`
*"Build mileage without buying an injury."*
Leads with **Progress**, not drills — load errors are what injure runners, and
that's where ACWR lives. The one ordering with a safety argument behind it, and
it has a test.

**Mileage is now the headline unit.** The check-in asks distance for runners, and
Progress leads with weekly km instead of a session count. Load stays sRPE —
minutes x RPE is the standard model for runners too, and swapping kilometres into
a minutes-based series would break the ratio for anyone who logs both.

**Wants next:** pace zones.

## Weightlifting 🏋️ `#c084fc`
*"Add kilos to the bar without stalling or breaking."*
Benchmarks: snatch, clean & jerk, front squat, back squat, overhead press — was
being offered a **Yo-Yo IR1 level**.

**Tonnage is now the headline figure** — sets x reps x load, computed from drills
already stored, so it needed no new input. Progress shows tonnes moved this week
instead of a session count. Bodyweight work contributes zero rather than being
counted as zero-weight reps.

Deliberately NOT swapped into sessionLoad: mixing kilograms into a minutes-based
series makes ACWR meaningless for anyone who logs both, and the ratio only works
if the formula is consistent across an athlete's history.

**Wants next:** intensity as % of 1RM; meet-date peaking in the program builder.

## Gym & fitness 💪 `#e3b53f`
*"A plan that progresses, instead of the same session forever."*
Benchmarks: bench, squat, deadlift, pull-ups, overhead press.

**Wants next:** this is the broadest group and the least tailored — an
aesthetics-led user and a general-fitness user want different homes. The
`training_focus` field already distinguishes them and the interface doesn't use
it.

## Adding a sport

One row in `PROFILES` (`lib/sport-profile.ts`) and one in `TERMS`
(`lib/sport-terms.ts`). `sport-profile.test.ts` will fail it if the accent is
under 4.5:1 on `ink-900`, duplicates another sport's, promotes a benchmark that
doesn't exist, or drops a tool.

---

# A note on where this stops

The per-sport wishlist that remains — pace zones, %1RM intensity, meet-date
peaking, forwards-vs-backs benchmarks — all point the same way: **more to fill
in**. That is the direction the original feedback was complaining about. "Easy to
use, a tool rather than a second job" is not served by another four fields, and
a sport-specific input the athlete has to remember is worse than a generic one
they don't.

So the bar for anything further is: **does it remove work, or does it add it?**

Two of the three sport changes that shipped pass that test only because they're
gated to one sport each and replace guesswork with a number the athlete already
knows. Tonnage passes it outright — it's computed from what's already stored and
asks nothing.

The best remaining ideas are subtractive:

- **Derive rather than ask.** The guided player now reports real elapsed minutes
  and real reps, so a played session logs itself. Anything else the app already
  observes should follow — a video's duration, a session's actual rest taken.
- **Default rather than prompt.** Nutrition targets are already derived from
  body and load rather than typed. The same could apply to intensity: the engine
  prescribed an RPE, so asking for it back is asking the athlete to grade
  homework the app set.
- **Ask once, not daily.** Weight, height and sex live on the profile. Anything
  that changes monthly does not belong in a daily form.

Adding a field is the easy answer and almost always the wrong one.
