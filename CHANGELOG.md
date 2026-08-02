# Changelog

Notable changes, newest first. Dates rather than version numbers — the app ships
continuously from `main` and there is nothing to pin a semver to.

Each entry says what changed **and what an operator has to do about it**. A
change that needs a migration applied or the Worker re-pasted is not done when
it merges, and a changelog that doesn't say so is how a feature sits dark for a
fortnight while everyone assumes it shipped.

---

## Deployment status — checked 2026-08-02

Verified against the live site and Worker rather than assumed. This supersedes
the per-release tables further down, two of which are now out of date.

| # | Step | State |
|---|---|---|
| 1 | **Paste the Worker bundle (`2026-08-01.1`)** | ❌ **outstanding** |
| 2 | Set the `NEXT_PUBLIC_API_URL` repo Variable | ✅ done |
| 3 | Deploy the front-end | ✅ done — current with `0d2338a` |
| 4 | Apply migrations `0064` + `0065` | ✅ done |

**How each was checked**, so it can be re-checked rather than trusted:

```bash
# 1. Worker version — reports 2026-07-29.1, i.e. the OLD bundle
curl -s https://apex-api.fitnessguru.workers.dev/health

# ...and its three new routes 404 (they should 401 once pasted)
for r in wearable-ingest ingest-token connect-wearable; do
  curl -s -o /dev/null -w "$r %{http_code}\n" -X POST \
    "https://apex-api.fitnessguru.workers.dev/$r" \
    -H 'Content-Type: application/json' -d '{}'
done

# 2 + 3. The live site is pocketathlete.com (github.io 301s to it).
# The Worker URL is compiled into the deployed bundle, and the newest
# UI strings are present in the route chunks.
curl -sL https://pocketathlete.com/nutrition/ | grep -o 'src="[^"]*\.js"'
```

A caution learned the hard way here: when grepping deployed chunks, **check the
fetch returned 200 first**. GitHub Pages answers a bad asset path with a 9KB
HTML 404 page, and grepping that for a missing string returns "not found" just
as convincingly as a real absence does.

### The only remaining step — Worker deploy spec

Written for whoever does the deploy. **No code needs writing.** The source is
already in the repo, tested and committed at `cloudflare/src/index.ts`; the job
is to bundle it, set one optional variable, and paste. Everything below is
verifiable from the source or with `curl`.

#### 0. What is currently live

`GET /health` → `{"ok":true,"version":"2026-07-29.1","model":"deepseek/deepseek-chat"}`

That is the bundle from 29 July. The repo is on `2026-08-01.1`. Three route
handlers and a vision path exist in source and not in production.

#### 1. Build the bundle

```bash
cd cloudflare
npx esbuild src/index.ts --bundle --format=esm \
  --target=es2022 --platform=neutral --outfile=worker.js
# -> worker.js  73.7kb
```

**Paste `worker.js`, never `src/index.ts`.** The source has
`import { ... } from "../lib/biometrics"` and `"../lib/affiliate"` — those are
resolved by esbuild at bundle time. The Cloudflare dashboard editor has no
bundler, so the raw TypeScript throws on module load and every route 500s.

`--platform=neutral` matters: `node` would inject Node built-in shims that
workerd does not provide.

#### 2. Environment

One **new, optional** variable. Everything else is already set — the wearable
sync reuses the service-role key the Worker holds.

| Binding | Type | Required | Notes |
|---|---|---|---|
| `OPENROUTER_VISION_MODELS` | plaintext var | no | Comma-separated OpenRouter slugs for the meal-photo path. Unset falls back to the compiled default chain: `google/gemini-2.5-flash`, then `openai/gpt-4.1-mini`. See `visionChain()` — configured values replace the defaults rather than appending, and duplicates are stripped. |

No new secrets. If you set nothing at all, the vision path still works.

#### 3. Database

Migrations `0064` and `0065` (`supabase/migrations/`) are **already applied** —
verified per-column against the live project. The new handlers depend on:

- `profiles.ingest_token uuid` (nullable, unique index
  `profiles_ingest_token_idx`) — written by `/ingest-token`, looked up by
  `/wearable-ingest`.
- `wearable_connections` (`user_id`, `provider`, `access_token`,
  `last_sync_at`, `last_error`) with `primary key (user_id, provider)` — the
  upsert relies on it via `?on_conflict=user_id,provider` plus
  `Prefer: resolution=merge-duplicates`, so without that PK every reconnect
  would insert a duplicate row instead of updating.

Nothing to run. Listed so a 500 can be diagnosed against the right schema.

#### 4. What the new routes do

All three are in the `fetch` dispatch (`src/index.ts` ~line 79-83) and all
return JSON.

**`POST /connect-wearable`** — auth: Supabase user JWT in `Authorization`.
Body `{ provider: "oura", token: "<personal access token>" }`.

Verifies the token against `https://api.ouraring.com/v2/usercollection/sleep`
*before* storing it, then backfills 7 days and upserts the connection.
`{ ok: true, days: n }` on success. Rejects tokens under 20 chars with 400.
`provider: "whoop" | "garmin"` returns a 400 whose message names the developer
application as the blocker — the UI mirrors that wording, so don't make it
generic. Any other provider is `"unknown provider"`.

> Storing before verifying was the bug this avoids: it produces a connection
> that looks live in the UI and silently returns nothing every night.

**`POST /ingest-token`** — auth: Supabase user JWT. No body.

Mints a `crypto.randomUUID()` into `profiles.ingest_token` and returns
`{ token, url }`, where `url` is this Worker's origin + `/wearable-ingest`,
derived from the request URL. Calling it again rotates — the previous token
stops working immediately. A UUID rather than a JWT deliberately: the holder is
an Apple Shortcut with no way to refresh anything.

**`POST /wearable-ingest`** — auth: **the ingest token**, as
`Authorization: Bearer <uuid>`. *Not* a user JWT — that separation is the entire
point of the endpoint.

The token is regex-checked as a UUID before it hits PostgREST (a non-uuid
comparison errors rather than returning empty), then resolved to a user.
No match → 401, deliberately, so a misconfigured Shortcut fails visibly instead
of appearing to work for weeks. Body is parsed by `parseIngestPayload` in
`lib/biometrics.ts`; accepts `hrv`, `restingHR`, `sleepHours`. Nothing usable →
400 naming the three fields.

#### 5. Vision path on `/estimate-food`

Same route, same auth (user JWT), same `silver` tier gate and per-user budget
check. The body gains an optional `image`: a `data:image/*` URL.

- Client downscales to ~768px JPEG before sending (`lib/food-estimate.ts`).
- Worker enforces `MAX_IMAGE_CHARS = 1_500_000` — base64 is ~4/3 of the bytes,
  so about a 1.1MB image. Over that → **413**, not 400.
- An `image` that isn't a `data:` URL → 400.
- Text-only requests behave exactly as before.

#### 6. Cron

`syncWearables(env)` is prepended to the existing `scheduled` job list. It pulls
every Oura connection, refetches 7 days, and writes `last_sync_at` /
`last_error` per connection. Each cron job is already wrapped in its own
try/catch, so a failing sync cannot stop reminders or the retention sweep.

**The existing cron trigger is unchanged** — no new schedule to add.

#### 7. Verify the paste took

```bash
API=https://apex-api.fitnessguru.workers.dev

# Expect version 2026-08-01.1 and a "vision" field.
curl -s $API/health

# Expect 401 on all three (route exists, correctly demanding auth).
# 404 means the paste truncated — the realistic failure mode at 73.7KB.
for r in wearable-ingest ingest-token connect-wearable; do
  curl -s -o /dev/null -w "$r %{http_code}\n" -X POST "$API/$r" \
    -H 'Content-Type: application/json' -d '{}'
done
```

A route still on `404` after pasting means the editor silently cut the file.
Re-paste; don't debug the handler.

#### 8. Until it's done

The app runs on its on-device fallbacks. That is intended behaviour, not
breakage, and each screen says so where it matters. Dark until the paste: meal
photo estimation, Oura and Apple Health sync, and the nightly wearable cron. The
AI coach, rehab planner and all billing already work on the old bundle.

**Nothing in the last four releases needs a Worker change.** The nutrition,
injury, shopping-list, Guides and meal-planner work is front-end and pure logic;
the meal-plan audit touched only `lib/meal-plan.ts`, which ships in the
front-end bundle.

---

## 2026-08-02 (audit) — Meal plans actually scale to the athlete

No operator action. Front-end and pure logic only.

An audit across five body types × three goals × four diet patterns found the
planner failing two groups outright, both silently.

### Fixed

**Big athletes were being under-fed.** A 115kg forward building on 4,370 kcal was
handed 3,010 across three meals — **69% of target**, 1,360 kcal a day missing,
for the one athlete whose entire goal is gaining weight. Nothing on screen said
a word about it.

Three causes, all now addressed:

- **Meal choice ignored calorie size.** Selection scored on cost, protein and
  repetition, so a 105kg forward and a 52kg athlete were handed identical dishes
  and told apart only by a portion multiplier that caps at 1.6×. A "Greek yoghurt
  breakfast bowl" scaled to 811 kcal is not a breakfast anyone would serve. Meals
  are now scored on how close their own calories sit to what the slot should
  carry, so big targets pull in big meals.
- **The recipe pool topped out at 777 kcal for a dinner.** Ten new meals, chosen
  to be calorie- and protein-dense rather than just larger servings of the same
  thing.
- **Portions were scaled by one figure for the whole day.** Breakfast, dinner and
  snack all moved together, and the snack's "fair share" was a quarter of the
  day. Each meal is now portioned to its own slot.

Together: 69% → 82% on four meals, ~88% on five. Beyond that it is an honest
limit of a recipe list, so the screen **says so** and offers the fix — spreading
the same calories over five meals, which is how anyone eats that much anyway.

**Plant-based plans collapsed on protein** — 58–64% of target. Cutting on 60% of
your protein is how you lose muscle instead of fat. The pool gained tofu, quinoa
and pea-protein meals and protein is weighted much harder in selection: now
73–79%, with calories still landing at 99–103%. The day card's existing "short on
protein" warning covers the rest, because hitting an athlete's protein target on
a plant-based cut is genuinely hard and pretending otherwise would be worse.

Three regression tests cover this; two of them fail against the old scoring.

### Changed

**The goal picker is on the front card.** Lean down / maintain / build moves the
calorie target by ~1,100 kcal — more than any other control — and it was in the
"Adjust" drawer behind the stats. It was the one choice an athlete actually wants
to make and the hardest to find.

**Weight is in the quick check-in.** It was full-mode only, and full mode is the
one almost nobody picks, so for most accounts the app never got a weight after
sign-up. Weight is what the calorie targets, macro split, meal plan and shopping
list are all computed from; without one they run on a 75kg default. Optional,
with no validation and no nag.

**The planner says which numbers it made up.** Height, age, weight and sex each
fall back to a hard-coded default, and the new summary line was reading
"From 20 yrs · 178cm · 75kg" as though the athlete had given them. It now names
the assumptions and links to the fields.

---

## 2026-08-02 (latest) — The meal planner

No operator action. Front-end only.

### Changed

**The meal planner asks nothing and builds a week.** It opened on eleven stacked
controls — age, height, weight, sex, training load, goal, diet pattern, things to
avoid, meals a day, a budget tick and a notes box — with the button that actually
does something below all of it. On the tab you opened to *see a meal plan*.

Almost every one of those answers was already in the profile; the nutrition page
loads them and passes them straight in. The form was mostly asking the athlete to
retype what the app had just read. It now leads with the calorie and macro
targets, one line saying what they were worked out from, and one button.
Everything else is behind "Adjust". This is the same fix the programme builder on
`/coach` got, which had the same shape and the same problem.

**The day strip carries each day's calories.** Seven identical three-letter pills
meant the only way to find the big day before a match was to tap through all
seven.

**A day's total is two bars, not a sentence.** It read
`2,841 kcal · 158g protein (target 2,850 / 165g)` — four numbers in one line, and
you did the comparison yourself. Whether a day lands is the question the whole
screen exists to answer.

**Meals look like they open.** Each meal is a disclosure and had no marker and no
chevron, so nothing indicated there was a recipe, a method and a macro breakdown
inside. The ingredient list now right-aligns its quantities instead of running
them into the names with a dash.

---

## 2026-08-02 (later) — Shopping list and Guides

No operator action. Front-end only.

### Changed

**The shopping list is a shopping list now.** It had no checkboxes — which is the
entire job. You are standing in an aisle holding a phone, and the one thing you
need is to mark what's in the trolley; it was a read-only table of prices, so the
only way to use it was to remember where you'd got to.

Every row ticks. Ticked items strike through and dim, each aisle shows its own
count, and a bar across the top tracks the shop. The total is joined by what's
left to buy, which is the number that matters once you're halfway round. Ticks
are kept against the plan's seed and survive the app being backgrounded — a shop
takes forty minutes with the phone in a pocket, and losing them at that moment
would make the feature worthless exactly when it's in use. Regenerating the week
gets a clean list, because it's a different shop.

**Tapping an item no longer throws you out of the app.** Every food name was a
link to a supermarket search opening in a new tab, and the name was the only tap
target in the row — so the most natural gesture while shopping, tapping the thing
you just picked up, launched Tesco's website. The row is the tick; a small,
separate search icon does the searching. The store picker moved above the list,
since it decides what that icon does — it used to sit underneath, after a
sentence telling you to tap items you'd already scrolled past.

**Guides lost a layer of boxes.** The position card had two bordered panels
inside a bordered card inside a bordered page — three frames around a bulleted
list. The lists keep their headings and get a coloured marker each; they don't
need boxes to be told apart. The position was also both a chip and the heading.

**The matchday timeline reads as a timeline.** Each step was a card, which boxed
every hour of the day separately and broke the run of it. The rail is the only
frame now.

**Recovery protocols were three full cards side by side** — each with a
checklist, red flags and exercise chips — squeezed into a third of the width at
three different heights. One column, collapsed, tap to open.

### Fixed

- **The matchday timeline's icons sat on top of their own headings.** A 36px
  emoji centred on the rail reaches 18px into the text column, and the padding
  didn't clear it. It only ever looked right because each step was wrapped in a
  card whose padding pushed the text out of the way; removing the card exposed
  it. Caught by measuring the gap in a real render, not by reading the classes.
- **`tab === "fuel"` was tested twice in a row**, with a separate section under
  each — one condition, two places to keep in step.

---

## 2026-08-02 — Injury, redesigned

No operator action. Front-end only.

### Changed

**The injury page asks one set of questions, once.** There were two textareas on
one screen wanting the same thing in almost the same words — "What's going on?"
in the planner, "Or describe it in your own words" in the card below it — one
feeding the AI plan, the other keyword-matching the static guides, and nothing
saying why. Someone in pain had to describe their injury twice to get everything
the page offered.

It's one card of three numbered steps now: where is it, what does it feel like,
how long has it been going on. Each ticks itself off, so a "Build my plan" button
that won't light up tells you which part you haven't done instead of just
refusing.

**A rehab plan shows one stage at a time.** Rehab is sequential — you are in
exactly one stage — and three stacked open was a very long page of exercises you
must not do yet. The others show their name and timeframe. "Move on when…" moved
inside each stage; it used to be its own card at the bottom, three stages away
from the one you're actually in.

**The body map reads as a body.** Fifteen bright slate dots on a nearly invisible
silhouette meant the one area you'd marked was the quietest thing on the figure.
Untouched regions are dim with a legible edge, a marked one grows and takes its
pain colour, and the selection is chips you can tap to undo rather than a
full-width panel holding the words "Selected: L knee".

### Fixed

- **The body map was rendered below the component that read from it.** The
  planner's `area` came from a map further down the page, so filling the form top
  to bottom — what everyone does — sent no area at all. You had to scroll past,
  tap, and scroll back.
- **Arriving dumped the whole guide catalogue.** With nothing selected the page
  rendered every protocol, so "something hurts, help" opened on a dozen cards
  about other people's injuries. Matching guides only; the rest is behind one tap.
- **The disclaimer rendered up to three times**, two of them on screen together.
- **The page knew where it hurt and asked anyway.** It fetched the last
  check-in's pain map, used it to pick protocols, then started the map empty. It
  now carries over — but only from a check-in in the last three days, since
  pre-filling a knee from three weeks ago would be a confident lie that then
  feeds the rehab plan.
- **The loading skeleton was less than half the real card's height**, so the page
  jumped when the query landed.

---

## 2026-08-01 (latest) — Nutrition, redesigned

No operator action. Front-end only — no schema change, no Worker change. The
three outstanding steps from the section below still stand and are unaffected.

### Changed

**Nutrition is a primary tab.** It replaces Progress in the bottom bar, labelled
"Food" because six slots on a 320px phone give each about 45px. The daily loop
is check in / train / eat, and eating was the only one of the three behind the
More sheet — a poor place for the one paid feature with a job every single day.
Progress is a review surface rather than an action, and Home already carries the
parts of it you'd want daily; it's one tap away in More. Injury was not
displaced: it was promoted after being reported unfindable twice, and "open More,
then look" is no way to reach it when something hurts.

**Today's fuelling is four rings, not a stack of boxes.** The page was a verdict
card, a calories card, macro bars and a water bar — every element a bordered
rectangle of the same weight, and two of them reporting the same number in
different words. It read as a form to fill in rather than something to look at,
which for the one screen someone opens after training is the wrong way round.

Calories, protein, carbs and fat as concentric rings answer "am I on track" in
one glance and no reading, in a shape this audience already knows from their
watch. The verdict is a single line inside the same card, saying only the part a
ring can't: what to do about the gap, in this sport's terms. Water rides along
the bottom as a slim bar — it was one number and two buttons and never justified
a panel of its own.

**The rings lead the page.** They used to open below the meal tick-list, so the
first thing on screen was a list of things to do and the answer to "where am I"
was a scroll away. Look, then act.

### Fixed

- **The same macro was two different colours on one screen** — protein was gold
  in the input labels and sky in the rings, carbs sky in one and green in the
  other. One palette now, shared between the two.
- **The calorie ring could be identical to a macro ring.** It took the sport
  accent, and two of the six accents are exactly the green and blue used for
  carbs and protein — a footballer would have seen two indistinguishable rings.
  The ring palette is fixed; colour there means "which macro", and that has to
  hold on every account.
- **The headline number overlapped the inner rings.** Four rings at a 15px
  stroke leave a 64px hole and "2,800" at 36px is about 100px wide. Caught by
  rendering it rather than reasoning about it.
- **"Coach targets" was a whole bordered panel to deliver one sentence and a
  link.** It's the hero's empty state now.
- **The loading skeleton was shaped like the old page**, so the layout jumped
  when data landed — the thing a skeleton exists to prevent.

---

## 2026-08-01 (later) — Simpler pages

### What the Worker still needs

The front-end is merged and deployed. **These are the outstanding steps**, and
until they're done the app runs on its on-device fallbacks — which is intended
behaviour, not breakage, and each screen says so where it matters.

| # | Step | Why |
|---|---|---|
| 1 | Paste the bundled Worker (`2026-08-01.1`) into Cloudflare | Live is still `2026-07-29.1` — confirmed via `/health` |
| 2 | ~~Set the GitHub repo **Variable** `NEXT_PUBLIC_API_URL`~~ | **done** — verified in the deployed bundle 2026-08-02 |
| 3 | ~~Re-run *Deploy to GitHub Pages*~~ | **done** — the deploy runs on push and is current |

**Paste the bundle, not `cloudflare/src/index.ts`.** The source imports from
`lib/affiliate` and `lib/biometrics`, which resolve at bundle time — the
dashboard editor has no bundler and the raw file fails on load. Regenerate with:

```bash
cd cloudflare && npx esbuild src/index.ts --bundle --format=esm \
  --target=es2022 --platform=neutral --outfile=worker.js
```

**Verifying the paste took** — `/health` should report `2026-08-01.1` and gain a
`vision` field, and these three routes should go from `404` to `401`
(route exists, correctly demanding auth):

```bash
for r in wearable-ingest ingest-token connect-wearable; do
  curl -s -o /dev/null -w "$r %{http_code}\n" -X POST \
    "$API/$r" -H 'Content-Type: application/json' -d '{}'
done
```

A route still on `404` means the paste truncated — the realistic failure mode at
74KB.

**New endpoints in this version:** `/connect-wearable`, `/ingest-token`,
`/wearable-ingest`, plus a vision path on `/estimate-food` and a nightly
wearable sync added to the cron handler.

**New optional config:** `OPENROUTER_VISION_MODELS` (comma-separated). Defaults
are compiled in, so nothing breaks if it's unset. No new secrets are required —
the wearable sync uses the service-role key the Worker already holds.

### Changed

**Home is the day, not a homepage.** Eleven stacked sections with the daily job
third — including a second navigation grid on a page that already has a nav bar,
and the same three actions repeated lower down as "daily quests". Seven now,
four of which render on a typical day.

The quests *were* the day: `dailyQuests()` returns exactly check in, train, eat.
They're one card, and each row carries its own substance — the session's real
name and "Week 2 · 6 exercises", the calories actually left, the readiness
verdict. Rank and XP progress close the card, so the reward sits underneath the
work rather than two panels below it.

Two render branches became one. There was a separate "not checked in yet" page
maintaining its own copy of the greeting, notifications and tool grid, and the
two had drifted.

**The programme builder asks one question, not seven.** The quick-start tiles
already built a programme in a single tap, and six further questions sat
permanently open beneath them — so a new athlete met a form and never registered
that the tiles were the answer. `ROADMAP.md` names this as the thing that decides
whether a new account ever sees the product work. Everything is behind one
"Build your own" tap. 13 top-level blocks → 4.

**Nutrition is no longer buried.** It was seventh of seven tiles for football,
rugby and basketball, and behind the More sheet on a phone — the one paid feature
with a daily job was the hardest thing to reach. Home leads with today's fuel,
and it moved up the tool grid in every sport. Cost no extra query: Home was
already fetching the row and using only its existence.

**Less lecturing.** `/coach` carried 1,109 characters of prose, nearly 3× any
other page, explaining physiology behind choices the controls had already made
clear. Down to 780, longest block 177 → 88.

**Whoop and Garmin are no longer listed as connections.** They each had a
greyed-out row explaining the developer programme in the way. All true, and none
of it the athlete's problem — two dead entries in a list of four made the whole
feature look half-built, and someone with a Whoop wants to know what to do, not
why they can't do the other thing. One line now points at the CSV importer
directly below it, which already reads their exports. The rows can come back the
day those applications are approved.

### Fixed

- **`/coach` asked "What are you training for?" twice**, meaning two different
  things — training focus, and race distance.
- **`/body` labelled a chart and an input field identically** — "Weight (kg)"
  appeared twice meaning a history and a box to type in.

### Notes

Pages checked and found structurally fine, left alone rather than churned:
`/body`, `/pricing`, `/train`, `/benchmarks`, `/dashboard`, `/essentials`,
`/report`, `/profile`, `/journal`, `/injury`. `/rewards` is dense deliberately —
it's the gamification destination, not a daily-path page.

---

## 2026-08-01 — Running, meal photos, connected wearables

Sixteen commits, 39 files, ~4,900 lines. Merged to `main` as `fb9cca5`.

### Requires action before this fully works

| Step | Status |
|---|---|
| Apply migrations `0064` + `0065` | **done** — verified against the live project |
| Paste the Worker bundle (`2026-08-01.1`) into Cloudflare | **outstanding** — live still reports `2026-07-29.1` |
| Set the `NEXT_PUBLIC_API_URL` repo Variable, then re-run the Pages deploy | **done** — see the status block at the top |

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
