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

**Still todo:** the four tabs cover genuinely unrelated topics (position, skill
drills, injury, fuel). Consider splitting injury out as its own page rather than
a tab, now that it's linked from three places.

## Rehab planner — done

Plans were held in React state and **never persisted**. Generate one, switch
tab, gone. Now saved to `rehab_plans` (migration 0061) from inside the job, so
leaving the page keeps the result, and reloaded on mount.

Not readable by coaches, unlike `body_logs` and `biometrics` — a description of
what hurts is the most sensitive thing anyone types here.

## My plan (`/coach`) — partial

806 lines, **three separate `<h1>`s**, three tabs (Today / Program / Ask coach).
The tab structure is sound and the heading now matches the nav.

**Todo:**
- The three `<h1>`s are three different page states (locked, empty, active) —
  fine semantically, but the locked and empty states have no lead sentence.
- No `NextUp` equivalent: the Today tab opens on the session but doesn't state
  whether today is a training day at all.
- Not sport-aware beyond the program contents. A weightlifter's plan page reads
  identically to a footballer's.

## Nutrition — partial

Seven cards plus tabs. Heading and lead are now plain English. **Todo:** no
verdict — it shows targets and logs without ever saying "you're 600 under today,
eat". Not sport-aware; a runner's carb needs and a lifter's protein needs are
framed the same.

## Exercises (`/library`) — partial

Filters correctly by the athlete's sport and defaults to it. Lead rewritten from
feature-speak. **Todo:** 500+ imported gym movements dominate every sport's list
because they carry no `sports` tag, so sport-specific drills are a handful at the
top of a very long generic list. Worth surfacing "your sport's drills" as a
distinct section.

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
| Squad → athlete | todo | 7 cards, no verdict |
| Video analysis | done | lead rewritten; background job + error recording |
| Report | todo | 3 cards, not reviewed |
| History | todo | 26 lines, no heading — likely a redirect |
| Onboarding | todo | 4 `<h1>`s, step flow not reviewed against rule 1 |
| Admin | todo | 11 cards, 587 lines — not user-facing, lowest priority |

## Public pages — todo

None reviewed against the new goal. These are what a stranger sees first.

| Page | Note |
|---|---|
| `/` landing | 4 cards, 2 CTAs — written to the old "commitment" framing |
| `/plans`, `/pricing` | not reviewed |
| `/drills`, `/drills/[sport]` | `drills/[sport]` has an `<h1>` with **no lead** — the only page still missing one |
| `/guides`, `/guides/[sport]/[position]` | SEO pages, not reviewed |
| `/waitlist` | 2 `<h1>`s |
| `/login`, `/reset-password` | forms; no heading by design |
| `/privacy`, `/terms` | legal; fine as-is |

## In-page menus — todo

Only the main nav and the mobile More sheet were audited. Not yet reviewed: the
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

**Wants next:** contact load as a first-class input. Rugby's injury driver is
collisions, not running volume, and ACWR built from minutes alone understates it.
Forwards and backs also want different benchmark sets.

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

**Wants next:** weekly mileage as the headline unit instead of session count;
pace zones; the check-in should ask distance, not just minutes.

## Weightlifting 🏋️ `#c084fc`
*"Add kilos to the bar without stalling or breaking."*
Benchmarks: snatch, clean & jerk, front squat, back squat, overhead press — was
being offered a **Yo-Yo IR1 level**.

**Wants next:** tonnage and intensity (% of 1RM) rather than sRPE, which is a
poor fit for strength work; meet-date peaking in the program builder.

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
