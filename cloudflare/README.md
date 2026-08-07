# Apex API — Cloudflare Worker

One Worker for the app's server-side needs, so **all your keys live in one place**:

- **AI** (`/coach-chat`, `/generate-program`) via **OpenRouter** — use any model with one key.
- **Stripe** (`/create-checkout`, `/stripe-webhook`) — subscriptions.
- **Email** reminders via **Resend** on a daily cron (daily nudge, deadline reminders, weekly summary).

The static app talks to this Worker via `NEXT_PUBLIC_API_URL`. If that isn't set, the app falls
back to Supabase Edge Functions / the local engine — so this is optional but unlocks the real AI +
payments + email.

## Deploy

```bash
cd cloudflare
npm install
npx wrangler login          # one-time, opens browser

# Set your secrets (prompts for each value):
npx wrangler secret put OPENROUTER_API_KEY          # from openrouter.ai/keys
npx wrangler secret put SUPABASE_ANON_KEY           # Supabase publishable/anon key
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Supabase service_role key (server-only!)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_SILVER
npx wrangler secret put STRIPE_PRICE_GOLD
npx wrangler secret put RESEND_API_KEY

# Non-secrets are in wrangler.toml [vars] — edit OPENROUTER_MODEL / SUPABASE_URL / APP_URL there.
npx wrangler deploy
```

Deploy prints your Worker URL, e.g. `https://apex-api.<you>.workers.dev`.

## Wire it to the app

1. Set the build var `NEXT_PUBLIC_API_URL` to the Worker URL. Either add a repo **Variable** of
   that name in GitHub (Settings → Secrets and variables → Actions → Variables) — the deploy
   workflow already forwards it — or put it in `.env.local` for local dev.
2. **Stripe webhook**: in the Stripe Dashboard add an endpoint at
   `https://apex-api.<you>.workers.dev/stripe-webhook` (events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`), then set the signing secret
   via `wrangler secret put STRIPE_WEBHOOK_SECRET`.
3. **Stripe products**: create Silver/Gold recurring **prices**, put their `price_…` ids in
   `STRIPE_PRICE_SILVER` / `STRIPE_PRICE_GOLD`.
4. **OpenRouter models**: AI requests walk a chain — every slug in
   `OPENROUTER_FREE_MODELS` (`:free` tiers, no token cost) in order, then
   `OPENROUTER_MODEL` (paid, the rung that makes the feature dependable). A rung
   is skipped when it rate-limits, errors, times out, or returns output the
   endpoint can't use — a program that isn't parseable JSON, say. If the whole
   chain fails the browser falls back to the on-device engine, so the athlete
   still gets a program either way.

   All of it runs on your single OpenRouter key. Free slugs get retired often;
   re-check <https://openrouter.ai/models?max_price=0> now and then, because a
   dead slug costs one wasted attempt on every request. Responses carry a
   `model` field naming the rung that served them — handy for checking whether
   the free tier is actually carrying the load.
5. **Email**: verify your sending domain in Resend and set `REMINDER_FROM` to an address on it.
6. **Meal photos** use their own chain, `OPENROUTER_VISION_MODELS`, because none of
   the text rungs can see an image. Check the live one with
   `curl "$API/health"` — it reports `vision` alongside `model`.

## Wearables

Three routes, and what each vendor permits decides the shape of all of them:

| Provider | How | Works today? |
|---|---|---|
| **Oura** | Athlete pastes a Personal Access Token from cloud.ouraring.com. The Worker verifies it against Oura, imports a week of history, then re-pulls nightly on the cron. | **Yes** — no registration needed |
| **Apple Health** | No web API exists and there will not be one; HealthKit data never leaves the phone except through an installed app. A **Shortcut** can read Health and POST to `/wearable-ingest` on a daily automation, authenticated by a per-user token from `/ingest-token`. | **Yes** — the athlete builds the Shortcut |
| **Whoop** | A real OAuth 2.0 API, but it requires registering an application to be issued a client id and secret. | **No** — blocked on that registration |
| **Garmin** | The Health API is behind the Connect Developer Program: an application and a commercial agreement, not a signup form. | **No** — blocked on approval |

The UI shows the last two as blocked, with the reason, rather than as buttons
that fail. Both fall back to the CSV import, which already parses their exports.

Tokens live in `wearable_connections`, which the client **cannot read** — there
is no select policy on it, and status comes from the `wearable_status` view
instead. Nothing in the browser ever needs a third-party health token back.

A sync failure is written to `last_error` and shown to the athlete. A connection
that quietly stopped working is worse than none, because readiness carries on
reporting stale data as though it were current.

## Notes

- Client-facing routes (`/coach-chat`, `/generate-program`, `/create-checkout`) require a valid
  Supabase session — the Worker verifies the caller's bearer token against Supabase before doing
  anything, so your keys can't be abused by anonymous traffic.
- The `service_role` key is powerful — it only ever lives in the Worker's secrets, never in the app.
- Cron runs at 08:00 UTC daily; adjust in `wrangler.toml`.


## Is the deployed Worker the one in this repo?

It is pasted into the dashboard by hand, so nothing makes the two agree. For a
while they did not: production ran `2026-08-04.2` against a repo at
`2026-08-01.1`, with an eight-model provider chain that existed nowhere in
version control. Four separately-reported bugs traced back to that gap, and each
one started with someone reading the wrong code.

```
npm run worker:drift -- https://apex-api.<subdomain>.workers.dev
```

Exit 0 they agree, 1 they don't, 2 the check couldn't run. 2 is deliberately
distinct from 1 — "I could not tell" must never be reported as "they match".

**When it reports drift, copy the DEPLOYED script back first.** The dashboard
copy is normally the newer one:

1. Cloudflare dashboard → Workers & Pages → `apex-api` → Edit code
2. Select all, and paste it over `cloudflare/worker.js`
3. Commit it

Do **not** run `wrangler deploy` to close the gap. That pushes this repo's older
script over production and loses whatever was changed in the dashboard.


## Three copies of this Worker exist. Two of them are usually wrong.

1. `cloudflare/src/index.ts` — the TypeScript source. `wrangler deploy` builds
   from this, because `wrangler.toml` says `main = "src/index.ts"`.
2. `cloudflare/worker.js` — the bundled output. This is the file that gets
   pasted into the dashboard.
3. **The dashboard itself** — the code that is actually running, and the only
   one users ever touch.

Production is edited by hand in the dashboard, so (3) is normally ahead of both
of the others. That makes `npm run deploy` in this directory a loaded gun: it
builds (1) and ships it, silently discarding every hand-made change in (3).

So `deploy` now has a `predeploy` guard that runs the drift check and refuses
unless the deployed version matches the repo. **No URL configured also refuses**
— deploying without knowing what you are about to overwrite is the exact risk,
so "I could not check" has to block just as hard as "they differ".

```
WORKER_DEPLOY_OVERRIDE=1 npm run deploy     # only when you mean it
```

The override exists because a guard nobody can get past gets deleted; one that
makes you say so on the command line does not.

### Recovering the dashboard version

Pasting the dashboard JS back into `worker.js` restores the running artifact
exactly, but leaves `src/index.ts` — the file anyone would actually edit — still
behind, and now diverged from the artifact next to it. Both need the change, or
the next `wrangler deploy` reintroduces the same regression.
