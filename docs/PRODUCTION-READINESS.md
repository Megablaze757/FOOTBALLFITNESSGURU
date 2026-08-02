# Production readiness

Audited 2026-08-02 against a standard production checklist. Every line was
checked against the code, the migrations, the live site or the Worker — nothing
here is marked done because it sounded done.

**How to read the status column.** ✅ means implemented and verified. ⚠️ means
partial, with the gap named. ➖ means deliberately not applicable, with the
reason — an item that doesn't apply is not a pass, and pretending otherwise is
how a checklist stops being useful.

Architecture in one line, because most of the answers below follow from it:
**a fully static Next.js export (`output: "export"`) on GitHub Pages, one
Cloudflare Worker, and Supabase Postgres with RLS.** There is no application
server of our own anywhere in the request path.

---

## Security

| # | Item | Status |
|---|---|---|
| 1 | Input sanitisation and injection prevention | ✅ |
| 2 | Authentication, authorization, roles, permissions | ✅ |
| 3 | Session management and token expiry | ✅ |
| 4 | Secrets management | ✅ |
| 5 | HTTPS, TLS, certificate rotation | ✅ |
| 6 | Rate limiting and abuse prevention | ⚠️ |
| 7 | Dependency scanning and vulnerability patching | ✅ *(added in this pass)* |
| 8 | Multi-tenancy and data isolation | ✅ |
| 9 | PII handling, retention, deletion | ✅ |
| 10 | Regulatory compliance (GDPR / HIPAA) | ⚠️ |
| 11 | Audit trails and tamper-evident logging | ⚠️ |

### 1. Input sanitisation and injection prevention ✅

No SQL is ever concatenated. Every database call goes through PostgREST
(`supabase-js` on the client, `supa()` in the Worker), which parameterises.
React escapes all interpolated output.

`dangerouslySetInnerHTML` appears **four times**, all of them
`<script type="application/ld+json">` SEO blocks fed from our own constants at
build time — never from user input. All four route through `jsonLd()` in
`lib/schema.ts`, which does `JSON.stringify(data).replace(/</g, "\\u003c")`,
so a `</script>` appearing in a copy change cannot break out of the tag. Worth
re-checking if any of that markup ever becomes user-supplied.

Two specific hardenings worth knowing about, both from real failure modes:

- `/wearable-ingest` regex-checks its bearer token as a UUID **before** it
  reaches PostgREST. A non-uuid comparison makes PostgREST error rather than
  return empty, which would have turned a malformed token into a 500 instead of
  a 401.
- `/estimate-food` requires `image` to be a `data:image/` URL and caps it at
  1.5M characters (~1.1MB), returning 413 rather than forwarding an arbitrary
  string to a model.

Free-text that drives behaviour (the diet notes box) is parsed by an allow-list
of known food ids in `lib/meal-plan.ts`, not by interpreting user text — the
worst case is a food isn't recognised.

### 2. Authentication, authorization, roles, permissions ✅

Supabase Auth issues the session. Three enforcement layers, and they are
deliberately not the same thing:

- **Database:** RLS on every table (see item 8). This is the real boundary.
- **Worker:** `authUser()` verifies the JWT against `/auth/v1/user` on every
  protected route; `requireTier()` gates paid features; `isAdmin()` gates admin
  ones; `isSuspended()` blocks suspended accounts.
- **Client:** `can(tier, capability)` and `<FeatureLock>` — presentation only.

The rule the codebase follows is *server is the control, client is the
courtesy*: `FeatureLock` explains the paywall, `requireTier` enforces it. A
tampered client bypasses the explanation, not the enforcement.

Roles: athlete, coach (`coach_athletes` with its own policies) and admin.

### 3. Session management and token expiry ✅

Supabase JWTs with refresh handled by `supabase-js`; expiry is enforced by
Supabase on every `/auth/v1/user` call, so a stale token fails at the Worker.

One deliberate deviation, documented in `lib/supabase/client.ts`: the app uses
the **implicit flow with localStorage**, not `@supabase/ssr`, because that
package hard-codes PKCE — which needs a server callback this static export
doesn't have.

The one long-lived credential is the wearable **ingest token**, and it is
scoped accordingly: a UUID that identifies one athlete for one write-only
endpoint, with no read access to anything. Rotating is re-calling
`/ingest-token`; the previous value stops working immediately. It's a UUID
rather than a JWT because the holder is an Apple Shortcut with no way to
refresh.

### 4. Secrets management ✅

- Worker secrets live in Cloudflare (`wrangler secret put`) and are not in the
  repo or in `wrangler.toml`. `deploy-worker.yml` never sees them and cannot
  overwrite them.
- Front-end build config comes from GitHub repo Variables.
- Only `NEXT_PUBLIC_*` values reach the browser bundle, and the only one of
  consequence is the Supabase **publishable** key, which is public by design and
  useless without RLS being wrong.
- The service-role key exists only inside the Worker.
- Grep for `sk_live_`, inline service-role JWTs and hard-coded keys: clean. The
  two matches are `STRIPE_SECRET_KEY.startsWith("sk_live_")`, a prefix check.

**Outstanding:** the Supabase database password is in git history and wants
rotating. Deferred by the owner until after beta — noted here so it isn't lost.

### 5. HTTPS, TLS, certificate rotation ✅

GitHub Pages and Cloudflare both terminate TLS with auto-renewing certificates;
neither is ours to rotate. HSTS is served by both. All outbound calls
(Supabase, OpenRouter, Stripe, Oura, Resend) are HTTPS. Nothing pins a
certificate, so a rotation upstream cannot break us.

### 6. Rate limiting and abuse prevention ⚠️

**What exists**, and it is genuinely the expensive surface:

- `AI_DAILY_LIMIT` — per-user LLM calls per day (default 40).
- `checkBudget()` / `TIER_BUDGET` — a monthly **USD** ceiling per tier, with
  `recordSpend()` metering actual token cost. Cost-based rather than
  count-based on purpose: switching to a pricier model otherwise multiplies the
  bill without touching the limit.
- Tier gates reject before any model is called.
- Cloudflare's own protections sit in front of everything.

**The gap:** there is no per-IP limit on unauthenticated requests. Every
expensive route requires a JWT first, so the exposure is request volume rather
than spend — but `/stripe-webhook` and the auth-check path on every route can be
hit anonymously. A Cloudflare Rate Limiting rule (e.g. 100 req/min/IP on
`apex-api.*`) would close it without a code change. Not done.

### 7. Dependency scanning and vulnerability patching ✅

**Added in this pass** — there was none, so a vulnerable dependency would sit
until someone ran `npm audit` by hand.

- `.github/dependabot.yml`: weekly npm scans for the app **and** the Worker
  (separate lockfile, and it holds the service-role key, so it's watched
  separately), monthly for GitHub Actions. Patch/minor grouped into one PR
  each — fourteen separate bumps is a queue nobody reads.
- `npm audit --omit=dev` runs in CI as a visible, advisory step.

**On the current 2 highs, which are real advisories and not reachable here.**
Both resolve to `next@14.2.35` and `postcss`. Every Next advisory in the list
requires a *running Next server*: Image Optimizer, Server Components,
Middleware, rewrites, Server Actions, custom servers, Edge runtime, SSRF via
WebSocket upgrade. This app is `output: "export"` with `images.unoptimized` and
no middleware — the build emits static files and **no Next server ever runs in
production**. The postcss advisories are build-time, against attacker-controlled
CSS; the only CSS built is ours.

`npm audit fix --force` would install `next@16`, a breaking major, to fix
nothing that is exploitable in this topology. The audit step is therefore
advisory: failing the build on unreachable advisories trains people to ignore
the step. Revisit if the app ever gains a server.

### 8. Multi-tenancy and data isolation ✅

**All 29 tables have RLS enabled** — verified by diffing every `create table`
against every `alter table … enable row level security` across
`supabase/migrations/`, not by spot-checking. Policies are `user_id =
auth.uid()`, with explicit additions for coach read access
(`coach_athletes`) and admin.

Two isolation details that were fixed rather than assumed:

- The wearable-connections view is a **definer** view with
  `where user_id = auth.uid()`. An earlier `security_invoker` version would
  have required a base-table select policy, which would have let clients read
  `access_token` — i.e. other people's Oura tokens.
- `/wearable-ingest` resolves the ingest token to exactly one `user_id` and
  writes only for that user.

### 9. PII handling, retention, deletion ✅

- `/delete-account` in the Worker performs a full cascade delete.
- `purgeExpiredVideos()` runs nightly — video is the heaviest and most personal
  artefact, so it expires on a schedule rather than living forever.
- Privacy policy at `/privacy`, terms at `/terms`.
- No PII in logs: the Worker logs `console.error("cron job failed:", …)` and
  error strings, not request bodies.

### 10. Regulatory compliance (GDPR / HIPAA) ⚠️

**GDPR:** the mechanics are there — deletion (right to erasure), a privacy
policy, retention limits on video, explicit consent for wearable connections,
data minimisation (only what a plan needs).

**Not done:** a self-service data **export** (right to portability). Deletion
exists; export doesn't. That's the concrete gap.

**HIPAA: does not apply, and should not be claimed.** HIPAA binds covered
entities — providers, health plans, clearinghouses — and their business
associates. A consumer fitness app that the athlete signs up to directly is
none of those. The data is health-adjacent (injuries, HRV, sleep) and is treated
as sensitive under GDPR's special-category rules, which is the standard that
actually binds here. If the product is ever sold *to a club's medical staff* as
a record system, this needs a lawyer, not a checklist.

### 11. Audit trails and tamper-evident logging ⚠️

**What exists:** `ai_usage` and `ai_spend` per user per call, `funnel_events`,
`cancellation_feedback`, `wearable_connections.last_sync_at` / `last_error`,
Stripe's own immutable event log, and `created_at` on every table.

**The gap:** none of it is *tamper-evident* — no hash chaining, no append-only
enforcement, no WORM storage. A service-role compromise could rewrite history
without trace. Genuine, and proportionate to fix only if this becomes a system
of record for a club rather than a consumer app. Supabase's own Postgres audit
log covers the infrastructure layer.

---

## Reliability and quality

| # | Item | Status |
|---|---|---|
| 12 | Unit, integration, end-to-end tests | ⚠️ |
| 13 | Regression tests | ✅ |
| 14 | Load and stress testing | ➖ |
| 15 | Chaos engineering and resilience testing | ➖ |
| 16 | Test coverage thresholds enforced in CI | ✅ *(added in this pass)* |
| 17 | Code review process and standards | ⚠️ |
| 18 | Error handling and graceful degradation | ✅ |
| 19 | Retry logic with backoff and idempotency | ✅ |
| 20 | Circuit breakers and fallback behaviour | ✅ |
| 21 | Concurrency handling and race conditions | ✅ |
| 22 | Caching strategy and invalidation | ✅ |
| 23 | RTO and RPO | ⚠️ |
| 24 | Disaster recovery plan | ⚠️ |
| 25 | Accessibility | ⚠️ |
| 26 | Architecture diagrams, ADRs | ⚠️ |

### 12. Unit, integration, end-to-end tests ⚠️

**632 tests**, all passing, covering every module in `lib/` — the deterministic
engine layer that decides what an athlete is actually told to do.

**Unit: strong.** These are pure functions and tested as such, including the
safety-critical ones (a movement is refused when joint pain ≥7 and its load on
that joint ≥2).

**Integration: partial.** Schedule parsing → week building → shopping list is
covered end-to-end as pure logic. Supabase calls and Worker routes are not
integration-tested.

**End-to-end: none.** No Playwright suite in CI. Playwright *is* available and
has been used in this repo for rendering checks during UI work, but there is no
committed browser test. This is the largest genuine testing gap.

### 13. Regression tests ✅

The suite is largely regression tests, and each carries the failure it pins in
a comment. Recent examples:

- Runs must not be prescribed on a severely injured limb — an 8/10 hamstring
  was once handed a 75-minute long run.
- A big athlete gets inherently bigger meals, not the same ones scaled 1.6×.
- Plant-based plans deliver ≥70% of the protein target (was 58–64%).
- Hard running days are never adjacent; deload keeps exactly one hard session.

New regression tests are checked against the *old* code to confirm they fail —
two of the three meal-plan tests do. A test that passes before and after fixes
nothing.

### 14. Load and stress testing ➖

Not applicable in the usual sense, and worth being precise about why rather than
claiming a pass.

The front end is static files on GitHub Pages' CDN — there is nothing to load
test. Supabase and Cloudflare Workers both scale independently of us. The only
component with a capacity story is the Worker, and its constraint is **spend,
not concurrency**: `checkBudget()` caps monthly USD per tier and
`AI_DAILY_LIMIT` caps calls per user per day, so the failure mode under load is
a budget rejection, not a queue.

What *would* be worth testing before a large launch: the OpenRouter fallback
chain under sustained 429s, which is currently only exercised by one provider
failing at a time.

### 15. Chaos engineering and resilience testing ➖

Disproportionate for one Worker and a static site. The property chaos
engineering would establish — every dependency can fail without taking the app
down — is instead a design invariant here and is unit-tested directly: every AI
feature has a deterministic on-device fallback and those fallbacks are what the
632 tests cover. See item 20.

### 16. Test coverage thresholds enforced in CI ✅

**Added in this pass.** `npm run test:coverage` enforces **95% line / 85% branch
/ 90% function** over `lib/`. Current actuals: **98.53 / 88.79 / 93.75**.

Thresholds sit just under the current figures on purpose, so this ratchets
rather than rubber-stamps — new engine code without tests drops the number and
fails the build. Verified the flags are actually enforced by setting an
impossible threshold and confirming a non-zero exit, rather than assuming a
passing run meant the gate worked.

### 17. Code review process and standards ⚠️

**What exists:** a documented commit-message standard the repo follows (what
broke, why, what changed), a CI pipeline that typechecks and tests every push on
every branch, and — new in this pass — **the deploy is now gated on tests**.
Previously `deploy.yml` shipped regardless of `ci.yml`; its own comment invited
someone to wire it up. It now calls `ci.yml` via `workflow_call` and
`needs: test`, so the gate can never drift from the checks it enforces.

**The gaps:**

- No branch protection on `main` and no required PR review — single maintainer
  pushing directly. That is a process decision, not something code can fix.
- **`npm run lint` has never worked.** It drops into `next lint`'s interactive
  setup prompt, so nothing in this repo has ever been linted. Long-standing;
  worth fixing with an explicit `.eslintrc` before more people touch the code.

### 18. Error handling and graceful degradation ✅

This is the strongest area, and it is a deliberate architectural stance:
**every AI feature has a deterministic on-device fallback**, so the app is fully
usable with the Worker completely down.

- Programme generation → local engine in `lib/engine.ts`.
- Readiness, training load, calorie targets → pure functions, no network.
- Meal photos → describe it in text instead.
- Screens *say* they are degraded rather than failing silently.

Two deliberate exceptions:

- **Rehab plans have no fallback, on purpose.** A plausible-looking rehab plan
  generated from keyword matching is worse than none, so without the AI the
  athlete gets the fixed protocol guides and a clear pointer to a physio.
- **Error messages say what actually failed.** An earlier version replaced every
  failure with "couldn't build a plan just now" — comforting, useless, and the
  reason a broken endpoint could sit unnoticed, because there was no visible
  difference between the AI being down, the feature needing Pro, and a bug.

Cron jobs are individually try/caught: one bad email address used to abort the
whole run, so the retention sweep simply never happened.

### 19. Retry logic with backoff and idempotency ✅

- **Model chain with fallback**: free models first, then the paid model, then
  the local engine. A 429 or 5xx moves to the next rung rather than retrying a
  failing provider.
- **Idempotency**: `nutrition_logs` and `daily_check_ins` upsert on
  `(user_id, log_date)`; `wearable_connections` upserts on
  `(user_id, provider)` via its composite primary key; `biometrics` upserts per
  `(user_id, metric_date)`. Re-submitting a day updates it rather than
  duplicating.
- **Git pushes** in this workflow retry with exponential backoff (2s/4s/8s/16s).
- Stripe webhooks are idempotent by event id.

### 20. Circuit breakers and fallback behaviour ✅

`checkBudget()` is a circuit breaker in the meaningful sense: once a user's
monthly spend or daily call count is exceeded, the AI path opens and every
request routes to the local engine until it resets. The model chain does the
same per-provider within a request.

What is *not* implemented is a classic half-open breaker that trips on
consecutive upstream failures and probes for recovery. The chain retries the
next provider on each request instead. For a per-request fallback that always
terminates in a local engine, the added complexity buys little.

### 21. Concurrency handling and race conditions ✅

Single-user-per-row data with database-enforced uniqueness, so the common races
can't corrupt state. Specific handling:

- Upserts with `on_conflict` everywhere two writes could collide.
- `JobsProvider` (`lib/jobs.tsx`) is mounted **above the router** so a long
  generation survives navigation — previously the job kept running and the
  result landed in an unmounted component, so a plan you waited a minute for
  vanished on a tab change.
- Rehab plans are persisted **inside** the job, not by the component, for the
  same reason.
- The meal-plan seed is stored so a rebuild is deterministic: regenerating with
  a fresh random seed would hand you a different plan from the shopping list you
  had already started buying against.
- `useAsync` guards every resolution path with an `active` flag captured in the
  effect (`lib/use-async.ts`), so a response arriving after unmount — or after
  the deps changed — cannot set state on a dead component. The `catch` branch
  checks it too, which is the one people forget.

### 22. Caching strategy and invalidation ✅

- `useAsync(fn, deps, key)` caches per key, and **invalidation is explicit**:
  `invalidate('nutrition:<userId>')` is called after the meal plan is saved.
  Without it the restored plan would show the old seed until the cache expired.
- Static assets are content-hashed by Next and served immutably by the CDN.
- The service worker caches the shell for offline use.
- Shopping-list ticks are keyed by plan seed in localStorage, so a new plan gets
  a clean list.

### 23. RTO and RPO ⚠️

Not formally defined. What is true today:

- **Front end:** re-deployable from `main` in ~2 minutes. Effective RTO minutes,
  RPO zero — it's static files from git.
- **Worker:** redeployable from source in minutes; currently a manual paste,
  which is the weak link (see `CHANGELOG.md`).
- **Database:** Supabase automated backups. **The retention window and restore
  time have not been confirmed against the current plan**, which is exactly what
  an RPO number requires. Free-tier retention is short.

**The action:** confirm the Supabase plan's backup retention, then write the two
numbers down. Cheap, and until it's done the honest answer is "unknown".

### 24. Disaster recovery plan ⚠️

`DEPLOY.md` covers deploying. There is no written DR runbook for
*database loss* — the scenario that actually matters, since the front end and
Worker are both reproducible from git and the database is not.

Needed: confirm Supabase backup retention, do one restore drill into a scratch
project, and write down the steps. Untested backups are not backups.

### 25. Accessibility ⚠️

**What's there:** semantic HTML throughout, `aria-live="polite"` on the job
tray (`components/JobTray.tsx`), `aria-pressed` on toggles, `aria-expanded` on disclosures, `sr-only` text
on icon-only controls, `role="img"` + `aria-label` on the body map, labelled
form fields, focus-visible styling, and a `Tabs` component built once with
roles, `aria-selected` and arrow-key support specifically because hand-rolled
copies across four pages had none of it.

**The gaps:**

- 30 of 79 components carry explicit ARIA attributes. Many legitimately need
  none, but that ratio hasn't been individually justified.
- **No automated a11y check in CI** (axe-core would be a small addition).
- **No contrast audit.** The dark theme leans on `text-slate-500`/`600` for
  secondary text, and some of those pairings are likely below WCAG AA on the
  `#09090a` background. This is the most likely real failure and it is
  measurable — worth running before launch.
- No screen-reader pass on the daily flow.

### 26. Architecture diagrams, ADRs ⚠️

**No diagram and no ADR directory.** That's the honest answer.

**What substitutes, and substitutes unusually well:** decisions are documented
at the point of the decision, in the file, with the failure that motivated them.
`lib/supabase/client.ts` explains why not `@supabase/ssr`; `lib/running.ts`
explains `hardFraction`; `components/nav-items.tsx` explains every nav slot and
what was displaced; `lib/meal-plan.ts` explains the scoring weights and the
audit that set them. `README.md` covers the shape of the system, `ROADMAP.md`
the intent, `CHANGELOG.md` the history with operator actions.

**What's genuinely missing** is the one-page picture — static site → Worker →
Supabase, plus Stripe/OpenRouter/Resend/Oura and which credential each hop uses
— that a new engineer needs before the in-file comments are useful. A mermaid
diagram in `README.md` would close most of it.

---

## What this pass actually changed

1. **Deploys are gated on tests.** `deploy.yml` now calls `ci.yml` and
   `needs: test`. It previously shipped regardless of a red suite.
2. **Coverage thresholds enforced** — 95/85/90 over `lib/`, verified to fail
   when breached.
3. **`npm audit` runs in CI**, advisory, with the reasoning recorded above.
4. **Dependabot added** for the app, the Worker and GitHub Actions.
5. **This document.**

## Ranked, if you only do a few before launch

1. **Confirm Supabase backup retention and do one restore drill** (items 23/24).
   The only item here where the bad outcome is unrecoverable.
2. **Contrast audit** (item 25). Cheap, measurable, and the most likely real
   accessibility failure.
3. **Rotate the database password.** Deferred to post-beta by decision; it is in
   git history.
4. **Cloudflare rate-limiting rule** on the Worker (item 6). One dashboard rule.
5. **Fix `npm run lint`** (item 17). Nothing has ever been linted.
6. **A GDPR data export** (item 10).
7. **One Playwright smoke test in CI** — sign in, check in, see a plan (item 12).
