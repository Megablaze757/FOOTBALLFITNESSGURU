# Handover — August 2026

Written for a developer picking this up cold. Everything below is either **done
and on `main`**, or **outstanding with the blocker named**. Where something is
assumed rather than verified, it says so.

Sixteen commits, `00c873b..3db4e8a`, 35 files. 758 tests pass; lint, typecheck
and `next build` clean.

---

# 1. Things only a human can do

None of these are code. All of them are blocking something.

## 1.1 Rotate three exposed credentials — DO THIS FIRST

Three live credentials were pasted into a chat transcript during this work and
must be treated as compromised. Values are deliberately not recorded here.

| Credential | Where it lives | Severity |
|---|---|---|
| Supabase **secret key** (`sb_secret_…`) | Supabase API keys | **Highest.** Bypasses RLS entirely — full read/write to every athlete's data over HTTPS from anywhere. |
| Supabase **database password** | Postgres connection string | High. Also present in git history. |
| **NVIDIA** API key (`nvapi-…`) | Cloudflare Worker var | Medium. Stored as **Plaintext**, so readable by anyone with dashboard access. |

Rotation steps:

1. Supabase → Project Settings → API Keys → revoke and regenerate the secret key.
   Then update `SUPABASE_SERVICE_ROLE_KEY` in the Cloudflare Worker, or the
   Worker's Stripe and reminder paths break.
2. Supabase → Settings → Database → Reset database password.
3. NVIDIA → regenerate. When re-adding to Cloudflare, set **Type: Secret**, not
   Plaintext. `GROQ_SECRET` and `OPENROUTER_API_KEY` are already correct;
   `NVIDIA_SECRET` is the odd one out.

## 1.2 Get the deployed Worker into version control

**The single biggest risk in this repo.**

`cloudflare/worker.js` and `cloudflare/src/index.ts` are both at `2026-08-01.1`.
Production is at `2026-08-04.2` and its source exists **only in the Cloudflare
dashboard**, where it is edited by hand. Four separately-reported bugs during
this work traced back to that gap, each costing a debugging session that started
by reading the wrong code.

```bash
npm run worker:drift -- https://apex-api.fitnessguru.workers.dev
```

Exit 0 they agree, 1 they differ, 2 the check could not run. It currently
reports drift.

To fix: dashboard → Workers & Pages → `apex-api` → Edit code → select all →
paste over `cloudflare/worker.js` → commit.

**Do NOT run `wrangler deploy` to close the gap.** That pushes the repo's older
script over production and loses the dashboard changes. Guards are in place
(`predeploy` hook and a step in `deploy-worker.yml`) but both are conditioned on
a Cloudflare token existing, and none is currently set — so today it is the
*absence of a token* protecting you, not the guards.

Note there are **three** copies and fixing one is not enough:

| Copy | Role |
|---|---|
| `cloudflare/src/index.ts` | TS source; `wrangler deploy` builds from this |
| `cloudflare/worker.js` | bundle that gets pasted into the dashboard |
| the dashboard | what actually runs — currently the only copy of the newest code |

## 1.3 Deploy the meal-photo Edge Function

The one user-facing feature that does not work. See §3.1 for the full diagnosis.

Needs one secret only a human can generate:

- **`SUPABASE_ACCESS_TOKEN`** — supabase.com/dashboard/account/tokens →
  GitHub → Settings → Secrets and variables → Actions.

For the model key, either add `GROQ_API_KEY` as a second GitHub secret, or put
it in Supabase → Project Settings → Edge Functions → Secrets and run the
workflow with `set_secrets` unticked.

⚠️ The Worker names its Groq key `GROQ_SECRET`. The Edge Function expects
**`GROQ_API_KEY`** (`supabase/functions/_shared/llm.ts`). Using the Worker's
name means the chain silently skips Groq.

Then: Actions → **Deploy Edge Functions** → Run workflow. It verifies the
function answers afterwards rather than trusting the CLI's exit code.

## 1.4 Validate two database constraints

Migration `0070` added both `NOT VALID`, so they guard new writes but were never
checked against existing rows — and those rows are exactly the ones that produce
`NaN` macros and "Weighted toward undefined." in an athlete's plan.

```sql
select distinct goal_type from public.programs
  where goal_type not in ('speed','agility','strength','endurance','injury_recovery','skill');
select distinct training_focus from public.profiles
  where training_focus is not null
    and training_focus not in ('performance','fitness','aesthetics','rehab');

-- if both are empty:
alter table public.programs validate constraint programs_goal_type_check;
alter table public.profiles validate constraint profiles_training_focus_check;
```

Migrations 0066–0070 are otherwise applied and verified live.

**0071–0074 are applied.** `0073` (video quota: free 0, `silver` 40) and `0074`
(`achievement_unlocks` + `achievement_rarity()`) went in on 2026-08-12. Nothing
in the app is waiting on a migration.

## 1.5 Optional: give programme sessions a timestamp

Not blocking anything, and nothing is broken while it is undone — but it is the
one thing standing between the challenge board and a metric it would like back.

`programs.completed_sessions` is a bare `["w1d1", ...]` with no timestamps
(migration `0041` says as much in its own comment), so there is no way to ask
"how many programme sessions did you tick off this week". The only number
available is the lifetime total, and feeding that to a seven-day challenge made
"tick off three sessions from your plan" read as complete on day one, forever,
for anyone who had ever ticked one. So `program_sessions` was removed from the
challenge vocabulary entirely and the type now stops anyone writing against it
(`lib/challenges.ts`). Those challenges moved onto `training_sessions`, which is
honest — ticking a session off the plan writes a dated `training_logs` row — but
it cannot tell a planned session from a loose one.

If you want the distinction back, the cheap version is one more column written
by the same `UPDATE` that already runs in `toggleSession` (`app/(app)/coach/page.tsx`):

```sql
alter table public.programs
  add column if not exists session_log jsonb not null default '[]'::jsonb;
-- entries look like {"sid": "w1d1", "at": "2026-08-12"}
```

**Order matters:** the migration has to land BEFORE the code that writes the
column, because an unknown column fails the whole `UPDATE` — and that `UPDATE`
is the core habit of the app. That risk is the reason it was not done as part of
the challenge work.

---

# 2. Done — training programs

The recurring complaint was "programs don't feel high quality". It had a
concrete cause.

## 2.1 A block now progresses one programme instead of rotating exercises

`lib/engine.ts`. Movement selection keyed off session index, so exercises
changed weekly — while the periodisation copy assumes they do not. Day 1 of a
strength block read:

```
wk1  Bent-over barbell row    "Groove the movement..."
wk2  Barbell hip thrust       "Add a little weight and a set"
wk3  Pogo hops                "Peak volume: extra set..."
wk4  Dumbbell shoulder press  "Deload: SAME MOVEMENTS, ~60%"
```

Four unrelated exercises, each captioned as last week's lift with more weight on
it. Selection is now per **block**: 3×8 → 4×7 → 4×6 → 2×8 deload on the same
lift. Variety moved between blocks (88% different). The primary lift persists
across blocks — rotating it made block 3 come out with *less* work than block 1.

## 2.2 Quality work is no longer peaked to failure

Peak week prescribed flying sprints, hill sprints and the T-drill at **RPE 10**,
depth drops and power cleans at 9. Sprinting, jumping and change-of-direction
are limited by force per contact, not by work capacity; the velocity-loss
literature is consistent that lower fatigue thresholds produce better explosive
adaptations, and a fatigued sprint is the textbook hamstring-strain mechanism.

Those patterns are capped at RPE 8. Strength patterns still climb to 9.

## 2.3 Sprinting athletes get hamstring and calf work

A four-day football block contained **zero hamstring sets** — no Nordic curl, no
RDL, no slider, all three in the catalogue. Two causes: hamstring movements were
tagged `strength, injury_recovery` so they scored badly in a *speed* session,
and nothing weighted them for athletes who sprint.

A scoring bonus proved insufficient — `pick()` rotates its window and spins
well-ranked movements out, the same way it was dropping coaches' picks.
`SPRINT_ESSENTIALS` are taken **before** the rotation. Calves had the same
problem (1.3–5.7 sets/week in a sport that is a series of achilles loads);
now 2–10.5.

## 2.4 In-season weeks taper into the match

Load was flat across the week, so the session before matchday was as heavy as
the one after the last match. Sessions now descend 0.95 → 0.55, averaging to the
same 75%. Elite football runs a matchday-minus microcycle; tracking studies of
professional squads show the same pattern.

## 2.5 Other engine fixes

- **Coach's picks appeared by luck.** The +50 bonus put a pick at the top of the
  list and `rotate()` spun it straight back out. Now taken before the rotation
  and pinned one-per-day.
- **84-minute Zone 2 runs were bolted onto strength and speed days.** That is
  the interference effect written as a plan. Long continuous efforts are
  endurance-only now.
- **Accessories carried no RPE at all** — a third of every session with no
  intensity guidance. Default RPE 7 where the catalogue gives none.
- **In-season frequency** is now noted in the plan summary (professional squads
  do 1–2 sessions/week) but deliberately **not enforced**.

## 2.6 Weekly volume per muscle group — new

`lib/muscle-volume.ts` + `components/WeeklyVolume.tsx`. The engine counted sets
per session *slot*, which says how long a session is and nothing about what it
trains. Now counts weekly sets per muscle, reads **both** engines (bodybuilding
plans draw from a separate catalogue and were counting zero), and surfaces it in
the program calendar.

Reports only — deliberately not a scoring input.

Conventions: assistance ½, plyometrics ⅓, activation work ½, conditioning
excluded. Landmarks: <6 maintenance, 10–20 productive, >22 excessive.

---

# 3. Done — meals and nutrition

## 3.1 Meal photo estimator — partially fixed, still needs §1.3

Diagnosis, in order:

1. `NEXT_PUBLIC_API_URL` **is** set (`https://apex-api.fitnessguru.workers.dev`),
   so the app routes to the Worker.
2. The Worker's `/health` reports **no `vision` field**, over a chain of eight
   text-only models. It cannot read a photo.
3. `estimateFood` (`lib/api.ts`) therefore tries the Supabase Edge Function —
   which is not deployed, so 404.

**Adding a vision-models variable will not fix it.** The repo Worker emits
`vision` unconditionally; the deployed one has no such key and has two the repo
lacks (`providers`, `chain`). The rewrite almost certainly removed the vision
path, so there is no code to send an image anywhere. *Assumed, not confirmed —
searching the dashboard source for `vision` would settle it in 30 seconds.*

**What was fixed:** when nothing can read the photo, the estimator now falls
back to the **typed description**, which works fine on the Worker today. Photo +
"large chicken salad" produces a real estimate. With no description it asks for
one instead of reporting a 404.

**Real bug found underneath:** supabase-js reports every failure as
`"Edge Function returned a non-2xx status code"` with the Response on
`.context`. `estimateFood` matched on `/404|not found/`, so it never matched and
the friendly message never fired — athletes saw that raw string under a button.
`invokeEdge` now carries the status through.

## 3.2 Today's meals now match the meal plan

A plan is stored as one seed and rebuilt wherever shown, which only works if
every caller feeds `buildWeek` identical inputs. The Meal plan tab merged
starred dishes and note-inferred dislikes into prefs; the Today tick-list passed
raw prefs, and the page never passed `starred` down despite having loaded it.

A star is worth £30 in the planner and exempts a dish from the had-it-last-week
rule — so omitting it rebuilt a *different week*. One derivation now,
`effectiveMealPrefs`, used by both.

## 3.3 Recipes openable from Today

The row was a single button that only ticked. Now two targets — checkbox keeps
the frequent action, the name opens a recipe sheet. Both measured ≥44px.

## 3.4 52 new recipes, and the vegan plans fixed

143 → 195. Adding them initially made one athlete's week **worse**: only 1 of 18
vegan additions cleared the 0.078 g/kcal a vegan cutting needs, against 30% of
the existing book. Fixed by rebalancing the new recipes protein-first and then
lifting the 13 weakest **pre-existing** vegan recipes — which turned out to be
what the planner was actually falling back on.

Every athlete and diet now meets its protein target every day across five weeks;
before, three of nine pairs went short.

## 3.5 Training-day calorie cycling

Every day carried identical calories — a rest day fed the same as a double
session. Calories now follow the work and **protein does not**: the day's
calorie target scales, protein is held, so rest days demand higher density. For
a 3,110 kcal athlete training Mon/Wed/Fri: ~3,470 training, ~2,840 rest, week
averaging 3,108.

Parsed from the existing notes box ("I train Monday, Wednesday and Friday").
Naming no day marks nothing — guessing is worse than not guessing.

## 3.6 Shopping prices

The store picker only changed **search links**; prices came from one mid-market
estimate, so an Aldi shopper was quoted Tesco money. It now sets the price level
too. Athletes can also correct any line ("fix price") — that value wins
outright, is never scaled by the store index, and persists across weeks.

`buildWeek` deliberately still costs against the baseline table, so two
identical athletes get the same plan at different prices rather than different
plans.

## 3.7 Two calibrations re-swept

`costWeight` 2.5 → 1.5 and `SERVING_COST_WEIGHT` 3 → 4, swept **jointly** —
sweeping either alone finds a false floor. Budget mode had been coming out
*dearer* than not using it for 6 of 96 athlete/diet combinations. Now clean on
all 96, average saving £14.50.

The repeat penalty is no longer scaled by weekly slot count. That scaling was
added to stop a short week costing more than a full one and had started causing
the inversion it was added to fix.

---

# 4. Done — infrastructure and guards

Each of these exists because something silently broke.

| Guard | Catches |
|---|---|
| `scripts/worker-drift.mjs` + `npm run worker:drift` | Deployed Worker ≠ repo. Exit 2 for "couldn't check" is distinct from 1 — "I don't know" must never read as "they match". |
| `predeploy` hook in `cloudflare/package.json` | `npm run deploy` overwriting a newer dashboard Worker. `WORKER_DEPLOY_OVERRIDE=1` bypasses. |
| Drift step in `.github/workflows/deploy-worker.yml` | Same, for CI — `wrangler-action` never goes through npm, so the npm hook doesn't cover it. |
| `lib/backend-routes.test.ts` | A backend call no backend serves, and anything quietly becoming Worker-only. |
| `lib/challenge-pool.test.ts` | A challenge nobody can complete, a challenge already complete when it is handed over, a position name typo'd so the template reaches nobody, a daily card scored against the week, and the rewards page passing a lifetime total off as this week's. |
| `lib/challenges.test.ts` | A metric in the challenge vocabulary that cannot be counted over the window. |
| `lib/gamification.test.ts` | A badge whose threshold is above what the 60-day query window can ever produce. Caught two on the way in. |
| `lib/theme-tokens.test.ts` | Tailwind classes naming colours the theme doesn't define. |
| `.github/workflows/deploy-functions.yml` | — (new) one-click Edge Function deploy, verifies the function answers. |

## 4.1 The two backends do not serve the same routes

The Worker answers 18 routes; the Edge Functions cover 4 of the 14 the app
calls. **Ten features exist on the Worker alone**, including billing and account
deletion, neither of which can have an on-device fallback.

This is fine today because `NEXT_PUBLIC_API_URL` is set. **Do not unset it**
without adding those ten Edge Functions first — it was proposed once already, to
get photos onto a backend that can see, and it would silently kill subscription
management and account deletion.

## 4.2 Three colour classes rendered as nothing

Tailwind emits no rule for an undefined shade — no fallback, no warning.
`readiness-amber` does not exist (it is `readiness-yellow`) and was used in four
places, including a dashboard progress bar that was drawing **invisible**.
`text-pitch-200` does not exist either, so program week focus notes had no
colour. All fixed, guard added.

---

# 5. Known gaps — not done, deliberately

Ranked by what I would pick up first.

1. **Speed blocks run ~0.3 hamstring sets per quad set.** Not zero any more, but
   thin. Quads accumulate from squats, split squats and every jump; hamstrings
   come from one Nordic. Closing it needs more room than a speed blueprint has.
   The test documents this rather than choosing a threshold that passes.
2. **In-season gym frequency is not capped.** Professional standard is 1–2
   sessions; the engine will give a footballer four. Now noted in the summary,
   not enforced — that was a judgement call, revisit if you disagree.
3. **`PAID_PROMPT_PER_M` / `PAID_COMPLETION_PER_M` are unset** in the Worker, so
   it falls back to built-in deepseek prices — but `/health` says the primary
   model is now `groq/openai/gpt-oss-120b`. Spend against the daily cap is
   costed at the wrong model's rate.
4. **Prices are a maintained estimate**, last reviewed July 2026. There is no
   public UK grocery API and scraping is against supermarket terms, so this will
   always be an estimate. Athlete corrections are the only ground truth.
5. **`cloudflare/src/index.ts` will still be stale** after §1.2. Pasting the
   dashboard bundle into `worker.js` restores the artefact but leaves the TS
   source behind — and now diverged from the bundle beside it. Both need the
   change or the next `wrangler deploy` reintroduces the regression.

---

# 6. How to verify any of this

```bash
npm test          # 758 tests
npm run lint
npx tsc --noEmit
npm run build

npm run worker:drift -- https://apex-api.fitnessguru.workers.dev
node scripts/ui-audit.mjs     # needs a server on :4321 and PW_CHROMIUM set
```

The UI audit needs the static export served locally:

```bash
npx serve -s out -l 4321
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/ui-audit.mjs
```

Note it cannot reach authenticated pages, so it does not exercise the meal
planner or program calendar. Those were verified by server-rendering the
components against the built CSS and screenshotting at 390px, plus axe-core
(zero violations at WCAG 2.1 AA).

## A note on the test suite

Several tests here encode a *measurement*, not just a behaviour — the protein
floor, the volume landmarks, budget mode never coming out dearer. Where a
threshold looks oddly specific it is because it was swept, and the comment above
it says what was measured and what breaks at the next value along. Changing one
of those numbers to make a test pass will usually re-introduce the bug it was
written for.

Every guard in §4 was verified by injecting the regression it exists to catch
and confirming it fails. If you add one, do the same.
