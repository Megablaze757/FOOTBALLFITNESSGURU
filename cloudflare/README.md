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
4. **OpenRouter model**: pick any model at openrouter.ai/models and set `OPENROUTER_MODEL`
   (default `anthropic/claude-3.5-sonnet`).
5. **Email**: verify your sending domain in Resend and set `REMINDER_FROM` to an address on it.

## Notes

- Client-facing routes (`/coach-chat`, `/generate-program`, `/create-checkout`) require a valid
  Supabase session — the Worker verifies the caller's bearer token against Supabase before doing
  anything, so your keys can't be abused by anonymous traffic.
- The `service_role` key is powerful — it only ever lives in the Worker's secrets, never in the app.
- Cron runs at 08:00 UTC daily; adjust in `wrangler.toml`.
