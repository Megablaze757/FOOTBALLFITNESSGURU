# AI Football Coach Platform

Backend: Supabase · Frontend: Next.js (App Router, TypeScript, Tailwind)
AI microservices (Python/FastAPI) arrive in Phase 2+.

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Journal + recovery engine + benchmarks | ✅ built |
| 2 | AI stats analysis + insights | ✅ trends dashboard + Python AI worker built |
| 3 | Video / biomechanics + plans | ✅ CV worker + storage + video UI |
| 4 | Stripe subscription tiers | ✅ schema + RLS paywall + Stripe + pricing UI |
| 5 | Automation, scaling, admin | ✅ pg_cron + email + indexes + admin |

## What Phase 1 includes

- **Schema** (`supabase/migrations/0001_phase1_core.sql`): `profiles`, `daily_check_ins`,
  `strength_benchmarks`, the `handle_new_user` signup trigger, `updated_at` triggers,
  indexes, and full RLS policies.
- **Auth**: email/password sign-up + sign-in (`app/login`), session refresh in `middleware.ts`.
- **Daily check-in** (`app/(app)/journal`): clickable body pain map, 1–10 sliders for
  fatigue/sleep/nutrition, weight, match-day toggle. Upserts one row per day.
- **Recovery engine** (`lib/readiness.ts`): pure, tested weighted scoring →
  Green / Yellow / Red + advice + weak-link body part. Exposed via
  `app/api/assess-readiness` and mirrored as a Supabase Edge Function
  (`supabase/functions/assess-readiness`) for production.
- **Home dashboard** (`app/(app)/home`): readiness gauge + AI coach card.
- **Profile** (`app/(app)/profile`): edit name/role/bio, sign out.
- **Benchmarks** (`app/(app)/benchmarks`): log strength/speed tests (`lib/benchmarks.ts`
  catalog), see latest values with change-since-last and full history.

## What Phase 2 includes so far

- **Schema** (`supabase/migrations/0002_phase2_insights.sql`): `daily_insights`,
  `recovery_correlations` (read-only to athletes; written by the service role).
- **Trends engine** (`lib/trends.ts`, pure + tested): rolling readiness series,
  fatigue trend (improving/stable/declining), risk score, weak-link, weight delta —
  a local stand-in for the Python AI worker, with a matching output shape.
- **Analytics dashboard** (`app/(app)/dashboard`): injury-risk meter, fatigue-trend
  card, weak-link widget, multi-series SVG trend chart, sleep/weight stats.

- **AI worker** (`ai-worker/`, Python/FastAPI): `POST /analyze_daily_stats` →
  deterministic risk/fatigue features (NumPy/Pandas/SciPy) + an LLM coaching tip
  (`claude-opus-4-8`, structured outputs; deterministic fallback when no API key).
- **Edge Function** (`supabase/functions/process-daily-state`): triggered by a DB
  webhook on `daily_check_ins`, fetches 14-day history, calls the worker, and
  upserts into `daily_insights`.

The **dashboard and home AI-coach card read `daily_insights`** (the worker's output)
when present, and **fall back to the local `lib/trends.ts` / `lib/readiness.ts`
estimate** otherwise — so the UI works today and lights up automatically once the
worker is deployed and the webhook is wired. The dashboard shows an `AI` vs
`Estimate` badge to indicate the source. See `lib/insights.ts`.

## Phase 4 — subscriptions & paywall

- **Schema** (`supabase/migrations/0003_phase4_monetization.sql`): `subscriptions`,
  `nutrition_logs`, and a `current_tier()` `SECURITY DEFINER` helper so tier checks
  in RLS run once per statement (not a per-row subquery).
- **Paywall (RLS)**: `daily_insights` → silver/gold (free users still get the local
  estimate), `nutrition_logs` → silver/gold, `strength_benchmarks` → last 30 days for
  all, full history for gold.
- **Stripe** (`supabase/functions/`): `create-checkout` (authenticated → Checkout
  Session URL) and `stripe-webhook` (verifies signature, syncs `subscriptions`,
  downgrades to bronze on cancel). Deploy the webhook with `--no-verify-jwt`.
- **UI**: `/pricing` (`app/(app)/pricing`) with the tier catalog from
  `lib/subscription.ts` + `components/UpgradeButton.tsx`; the Profile page shows the
  current plan and links to it.

Wiring: `supabase functions deploy create-checkout` and
`supabase functions deploy stripe-webhook --no-verify-jwt`; set the Stripe secrets
(`supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… STRIPE_PRICE_SILVER=… STRIPE_PRICE_GOLD=… APP_URL=…`);
add the webhook endpoint in the Stripe Dashboard pointing at the `stripe-webhook` URL.

## Phase 3 — video, biomechanics & training plans

- **Schema + storage** (`supabase/migrations/0004_phase3_video.sql`): private `videos`
  storage bucket (own-object RLS), `videos` + `ai_plans` tables. `ai_plans` is
  **gold-only** read; `videos` are visible to any tier (upload + status tracking free).
- **CV worker** (`cv-worker/`, Python/FastAPI): `POST /process_video` →
  MediaPipe/OpenCV pose extraction → knee-valgus/flexion/symmetry biomechanics
  (`biomech.py`, pure + tested), pain-correlation root-cause alert, heatmap points,
  and a tapered drill program (`drills.py`). **Deterministic synthetic-pose fallback**
  when the CV stack or video isn't available, so it runs and is testable everywhere.
- **Edge Function** (`supabase/functions/process-video`): DB webhook on `videos`
  insert → signed URL → CV worker → upsert `ai_plans` → flip `videos.status`.
- **UI**: `/train` uploader + video list with status; `/train/[id]` plays the clip with
  a **heatmap canvas overlay** (`components/HeatmapVideo.tsx`), symmetry/biomechanics
  stats, root-cause alert, and a drill checklist. Non-gold users see an upgrade lock.

## Phase 5 — automation, scaling & admin

- **Schema** (`supabase/migrations/0005_phase5_admin.sql`): extra performance indexes,
  `is_admin()` + `admin_metrics()` helpers (SECURITY DEFINER, admin-gated), and admin
  read-all RLS policies.
- **Scheduled emails** (`supabase/functions/`): `send-daily-reminders` (emails users who
  haven't checked in today) and `weekly-summary` (per-user 7-day recap) — both via Resend.
- **Cron** (`supabase/cron/schedule.sql`): `pg_cron` + `pg_net` jobs that POST to those
  functions (08:00 daily / 04:00 Mondays), reading the service-role key from Vault. Run
  once after deploy; replace `<PROJECT_REF>`.
- **Admin** (`app/admin`): standalone back-office (no athlete tab bar), gated to
  `profiles.role = 'admin'` — MRR, paid subs, DAU, total users, video queue health, and a
  failed-jobs table. Linked from Profile for admins.

## Architecture (final)

| Layer | Tech |
|-------|------|
| Frontend | Next.js **static export** (client SPA, TS, Tailwind) on GitHub Pages — athlete app + `/admin` |
| Auth / DB / Storage | Supabase (RLS-gated, tier-aware via `current_tier()`) |
| Serverless glue | Supabase Edge Functions (Deno): readiness, process-daily-state, process-video, Stripe, email |
| AI / ML | Python/FastAPI — `ai-worker/` (recovery LLM) + `cv-worker/` (MediaPipe biomechanics) |
| Payments | Stripe (Checkout + webhook) |
| Email | Resend (transactional) |
| Scheduling | `pg_cron` + `pg_net` |

## Deploying everything (needs the real Supabase project)

1. Apply migrations `0001`–`0005` (CLI `supabase db push`, or paste into SQL Editor).
2. Deploy edge functions: `assess-readiness`, `process-daily-state`, `process-video`,
   `create-checkout`, `stripe-webhook --no-verify-jwt`, `send-daily-reminders`, `weekly-summary`.
3. `supabase secrets set` the worker/Stripe/Resend keys + URLs (see `.env.example`).
4. Deploy `ai-worker/` and `cv-worker/` (Railway/Render — `Dockerfile`s provided).
5. Add DB webhooks: `daily_check_ins` → `process-daily-state`; `videos` → `process-video`.
   Add the Stripe webhook endpoint → `stripe-webhook`.
6. Run `supabase/cron/schedule.sql` (after storing the service-role key in Vault).
7. Set a user's `profiles.role = 'admin'` to access `/admin`.

## Premium intelligence layer

Pro-grade depth across the app (all pure + unit-tested engines):

- **Training-load management (ACWR)** — `lib/load.ts` computes session-RPE load and the
  acute:chronic workload ratio with injury-risk zones (detraining / sweet-spot / spike). Shown
  as a gauge on Stats.
- **Smart nutrition targets** — `lib/nutrition.ts` derives calorie/macro/hydration goals from
  body weight, the active program's goal, and recent training volume (e.g. 1.6–2.0 g/kg protein,
  carbs scaled to load). Shown vs logged on `/nutrition` with "Apply to today".
- **Weekly report** — `weeklyReport()` summarises sessions, load trend, a top win and a focus.
- **Streaks** — consecutive check-in days, surfaced on Home.
- **Readiness-aware sessions** — the Coach swaps the scheduled session for active recovery when
  today's readiness is Red, and trims it when Yellow.
- **In-season / out-of-season toggle** — pick the season when generating a program (taper vs
  build), and switch it on an active program to rebuild volume.
- **Program progression** — ticking off a scheduled session **logs it as training** so it feeds
  your load gauge & history; an optional **goal deadline** drives a progress ring + on-track/behind
  status; finishing every session unlocks **"Start block N+1"**, which auto-builds the next 4-week
  block with ~8% more volume (migration `0009`: `target_date`, `block`).
- **Measurable benchmark targets** — tie a program to a metric + target (e.g. *10m sprint
  1.85 → 1.70s*); a real progress **ring** tracks your latest logged test toward the goal,
  honouring lower-is-better metrics (`benchmarkProgress`, migration `0010`).
- **Deadline reminders** — an in-app banner when the target is ≤7 days out, plus a daily
  `deadline-reminders` Edge Function (Resend email + cron) nudging athletes near their date.
- **Coach chat** — ask *"why is this drill in my plan?"*, about pain, readiness or nutrition.
  Answered by the `coach-chat` Claude Edge Function when deployed, with a **local fallback**
  (`lib/coach-chat.ts`) that handles the headline cases offline / on GitHub Pages.

## AI Coach (`/coach`)

A goal-driven coaching engine — the flagship feature.

- **Tell it a goal** (speed / agility / strength / endurance / injury recovery / skill) and it
  **builds a 4-week periodised program** (Base → Build → Peak → Deload), pain-aware.
- **Constraint-aware drill recommendations** — `lib/coach.ts` (pure + tested) scores a drill
  library by goal *and* current pain, penalising/excluding drills that load a sore joint and
  explaining why. e.g. *knee pain + agility goal → ladder/reactive/cone drills that spare the
  knee, with depth-jumps & sprints dialled back.*
- **"What's working"** — `analyzeProgress` surfaces load progressions ("Single-leg RDL +27.5kg")
  and flare patterns ("your knee pain rises after high-impact sessions — swap in lower-impact work").
- **Log progress** — tick off program sessions (adherence bar) or push today's recommended drills
  straight into `training_logs`. Works for fitness, nutrition (goal type) and injury recovery.
- Programs persist in `programs` (migration `0007`). An optional Claude Edge Function
  (`generate-program`) produces the program when deployed; the client **falls back to the local
  engine** otherwise, so it works fully on GitHub Pages.

## Body, sharing & coaching

- **Body composition + progress photos** (`/body`) — log weight & body-fat with trend charts, and
  upload progress photos to a private `photos` bucket (own-object RLS), shown as a timeline.
  Table `body_logs` (migration `0011`).
- **Shareable progress card** — `lib/share-card.ts` renders a 1080×1080 stats card as SVG and
  rasterises it to PNG in-browser (no deps), offering native share or download. On the Progress page.
- **Coach / squad accounts** — a `coach` sees their athletes' dashboards. `coach_athletes` +
  `is_coach_of()` back **coach-read RLS** on the athletes' tables; `add_athlete_by_email()` (SECURITY
  DEFINER) grows the roster. `/squad` lists athletes with live readiness/adherence; `/squad/view?id=`
  is a read-only athlete dashboard (readiness, load/ACWR, program). Linked from Profile for coaches.

## The athlete dashboard

- **Landing page** (`app/page.tsx`) — premium hero + feature grid for logged-out visitors.
- **Daily entry logs training** — the journal (`/journal`) includes a "Today's training"
  section: add drills (name/sets/reps/load), duration and intensity, persisted to
  `training_logs` (migration `0006`).
- **Progress / history** (`/history`) — last-30-day **training volume** chart, a
  **most-trained-drills leaderboard** with PR loads, and **nutrition trends**
  (calories/protein/water). Aggregation is pure + tested (`lib/history.ts`).
- **AI sees progression** — the `process-daily-state` Edge Function now sends recent
  `training_logs` + `nutrition_logs` to the AI worker, which folds a training-load
  trend into the coaching prompt.

## Backend keys (AI / Stripe / email) — Cloudflare Worker

The server-side bits live in one **Cloudflare Worker** (`cloudflare/`) so all your keys sit in one
place: **OpenRouter** (AI coach chat + program generation — use any model with one key), **Stripe**
(checkout + webhook), and **Resend** (reminder emails on a cron). Deploy with `wrangler deploy`,
set secrets with `wrangler secret put …`, then point the app at it via the `NEXT_PUBLIC_API_URL`
build variable. Full guide: [`cloudflare/README.md`](cloudflare/README.md).

If `NEXT_PUBLIC_API_URL` is unset, the app falls back to Supabase Edge Functions / the local engine,
so it runs fine on GitHub Pages without any of this configured.

## Deploying to GitHub Pages

The frontend is a **fully static SPA** (`output: "export"`) — no server, no middleware,
no API routes. Auth and all data go through the Supabase browser client (RLS-secured),
with the session in `localStorage`. This runs as-is on GitHub Pages.

1. Push to `main`. The workflow `.github/workflows/deploy.yml` builds the static export
   and publishes it (enable **Settings → Pages → Source: GitHub Actions** once).
2. The base path auto-derives: `/<repo>` for project sites, empty for `<user>.github.io`
   repos. Override the public Supabase env by setting repo **Variables**
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (defaults point at the
   current project). For a custom domain, add a `CNAME` file and clear the base path.

Build locally: `npm run build` → static site in `out/`.

> Premium dark UI (glassmorphism, pitch-green accent, Sora font, motion). Backend
> services (AI/CV workers, Stripe, email) are unchanged — the SPA calls the readiness
> engine in-browser and the Edge Functions over HTTPS; webhooks drive the rest.

## Live status

The schema is **applied and verified on the live Supabase project** (`eu-west-3`), and the
app has been run end-to-end against it (auth → check-in → readiness → admin metrics).
`.env.local` is wired to the project. Seeded demo logins (dummy DB):

- Athlete — `athlete@example.com` / `Test1234!`
- Admin — `admin@example.com` / `Test1234!` (sees `/admin`)

Run `npm run dev` and sign in. Helper scripts: `scripts/db-deploy.mjs` (apply migrations),
`scripts/db-verify.mjs` (inspect schema), `scripts/seed-user.mjs` (demo users),
`scripts/smoke-live.mjs` (live end-to-end check).

Still pending (need third-party accounts): deploy the 7 edge functions + 2 Python workers,
Stripe + Resend keys, DB/Stripe webhooks, cron. See "Deploying everything" below — all turnkey.

## Local setup

1. **Install**: `npm install`
2. **Env**: copy `.env.local.example` → `.env.local` and fill in your dummy Supabase
   project's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Dashboard → Project Settings → API).
3. **Apply the schema** to the dummy project:
   ```bash
   psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_phase1_core.sql
   # or: supabase db push   (if using the Supabase CLI)
   ```
   Also enable email/password auth in Dashboard → Authentication → Providers.
   For fast local testing, turn off "Confirm email".
4. **Run**: `npm run dev` → http://localhost:3000

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (verifies all routes compile) |
| `npm test` | Run unit tests for the readiness + trends engines (`node --test` via `tsx`) |
| `npm run lint` | Next.js lint |

## Security

- Secrets live in `.env.local` / `.env` (gitignored). Never paste credentials into chat or commits.
- The `service_role` key bypasses RLS — server-side only, never shipped to a client.
- When moving off the dummy database, reset its password and create fresh keys for production.
