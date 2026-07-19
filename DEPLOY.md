# Deploying Apex — end-to-end

This guide takes you from a fresh clone to a fully-functional live app: the
static front-end on **GitHub Pages**, the database on **Supabase**, and the
AI / Stripe / email backend on a **Cloudflare Worker**.

Nothing here needs a paid plan to get started (Supabase free tier, Cloudflare
Workers free tier, GitHub Pages free). Stripe and email are optional — the app
works without them (the AI coach falls back to the on-device engine).

---

## 0. What talks to what

```
Browser (GitHub Pages, static export)
   │  auth + data (RLS)         ┌───────────────────────────┐
   ├───────────────────────────►│ Supabase (Postgres + Auth │
   │                            │ + Storage + RLS)          │
   │  AI / Stripe / email       └───────────────────────────┘
   └───────────────────────────►┌───────────────────────────┐
      (Bearer = user JWT)        │ Cloudflare Worker (apex-api)│
                                 │ OpenRouter · Stripe · Resend │
                                 └───────────────────────────┘
```

The front-end reaches the Worker only if you set the repo variable
`NEXT_PUBLIC_API_URL`. Without it, the AI features use the built-in deterministic
engine (still fully usable, just not LLM-written).

---

## 1. Supabase (database + auth + storage)

1. **Create a project** at https://supabase.com → note the *Project ref*, the
   *Project URL* (`https://<ref>.supabase.co`), the **publishable/anon key**, and
   set a DB password.
2. **Apply the migrations** (schema + RLS). From the repo root:
   ```bash
   SUPABASE_PROJECT_REF=<ref> SUPABASE_DB_PASSWORD='<db-password>' node scripts/db-deploy.mjs
   ```
   This applies `supabase/migrations/0001 … 0014` (tables, RLS policies,
   SECURITY DEFINER functions with locked search_path). Re-runnable/idempotent.
3. **Storage buckets** (Dashboard → Storage → New bucket), both **private**:
   - `videos` — training clips
   - `photos` — progress photos

   RLS for own-object access is created by the migrations.
4. **Auth redirect URLs** (Dashboard → Authentication → URL Configuration):
   - *Site URL*: `https://<user>.github.io/<repo>/`
   - *Redirect URLs*: add `https://<user>.github.io/<repo>/` **and**
     `https://<user>.github.io/<repo>/reset-password/`
   (Password-reset and magic links break without these.)
5. **Before real users**: rotate the DB password, and delete the demo accounts:
   ```bash
   node scripts/cleanup-demo.mjs      # removes @example.com seed users
   ```

The **service_role key** (Dashboard → Settings → API) is server-only — it goes
into the Worker (step 3), never into the front-end or git.

---

## 2. GitHub Pages (front-end)

The workflow `.github/workflows/deploy.yml` builds the static export and
publishes it. It auto-derives the base path from the repo name.

1. **Enable Pages**: repo → Settings → Pages → *Source: GitHub Actions*.
2. **Repo variables** (Settings → Secrets and variables → **Actions → Variables**):
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable/anon key |
   | `NEXT_PUBLIC_API_URL` | your Worker URL (from step 3) — set after deploying it |
   These are **public** values (they ship in the bundle); that's expected. RLS is
   the security boundary.
3. Push to `main` (or run the workflow manually). The site goes live at
   `https://<user>.github.io/<repo>/`.

> Only the anon/publishable key is exposed client-side — never the service_role
> key or any Stripe/OpenRouter secret.

---

## 3. Cloudflare Worker (AI + Stripe + email)

The Worker (`cloudflare/`) is one endpoint that serves:
`/coach-chat`, `/generate-program` (OpenRouter), `/create-checkout`,
`/stripe-webhook` (Stripe), and a daily cron for reminder emails (Resend).

```bash
cd cloudflare
npm install
npx wrangler login            # opens a browser to authorize Cloudflare
```

Edit `wrangler.toml` `[vars]` to point at your project:
```toml
[vars]
OPENROUTER_MODEL = "anthropic/claude-3.5-haiku"   # any OpenRouter model id
SUPABASE_URL     = "https://<ref>.supabase.co"
APP_URL          = "https://<user>.github.io/<repo>"
REMINDER_FROM    = "Apex <noreply@yourdomain.com>"
```

Set the **secrets** (never commit these — `wrangler secret put` stores them
encrypted in Cloudflare):
```bash
# Required for the AI coach
npx wrangler secret put OPENROUTER_API_KEY        # from openrouter.ai/keys
npx wrangler secret put SUPABASE_ANON_KEY         # publishable/anon key (verifies caller JWTs)

# Required only for billing + emails (optional)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY # server-only DB writes for webhooks/cron
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_SILVER       # Stripe price id for $15/mo
npx wrangler secret put STRIPE_PRICE_GOLD         # Stripe price id for $20/mo

# Email (pick ONE — see step 5)
npx wrangler secret put GAS_EMAIL_URL             # Google Apps Script web-app URL (free, Gmail)
npx wrangler secret put GAS_EMAIL_SECRET          # shared secret matching the Apps Script
# or, instead of the two above:
npx wrangler secret put RESEND_API_KEY            # from resend.com
```

Deploy:
```bash
npx wrangler deploy
```
Wrangler prints the URL, e.g. `https://apex-api.<subdomain>.workers.dev`.

**Wire the front-end to it**: set the GitHub repo variable `NEXT_PUBLIC_API_URL`
to that URL (step 2), then re-run the Pages workflow. Verify:
```bash
curl https://apex-api.<subdomain>.workers.dev/health   # → {"ok":true}
```

Minimum for a working **AI coach**: `OPENROUTER_API_KEY` + `SUPABASE_ANON_KEY`
+ `wrangler deploy` + the `NEXT_PUBLIC_API_URL` variable. Everything else is
optional.

---

## 4. Stripe (optional — paid plans)

1. Create three prices in the Stripe dashboard (Products):
   - **Silver** — $15/month recurring → copy its `price_…` id → `STRIPE_PRICE_SILVER`
   - **Gold** — $20/month recurring → `STRIPE_PRICE_GOLD`
   - *(Team $150 is currently a "Contact us" mailto — no Stripe price needed
     unless you want it self-serve.)*
2. **Webhook**: Developers → Webhooks → Add endpoint →
   `https://apex-api.<subdomain>.workers.dev/stripe-webhook`, subscribe to
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Put the account into live mode when ready and swap the test keys for live keys.

The Worker verifies the webhook signature (Web Crypto HMAC-SHA256) and writes the
resulting tier to `subscriptions` with the service_role key.

---

## 4b. Custom domain (pocketathlete.com)

The repo has a `CNAME` file containing `pocketathlete.com`. Two things follow
from that, and both are already handled in `.github/workflows/deploy.yml` — but
know why, because getting either wrong takes the whole site down:

1. **Base path must be empty.** On a project site the app is served from
   `/<repo>/`, so assets are built with that prefix. On a custom domain it's
   served from the root, and that prefix 404s every script and stylesheet. The
   workflow now sets `NEXT_PUBLIC_BASE_PATH` to empty whenever a `CNAME` exists.
2. **The CNAME has to be inside the build output.** Pages deploys the `out/`
   directory, so a `CNAME` in the repo root never reaches the deployment and the
   custom domain silently unsets on the next deploy. The workflow copies it in.

Also update, or the app will misbehave in ways that look unrelated:

- **Supabase → Authentication → URL Configuration**: set **Site URL** to
  `https://pocketathlete.com` and add it to Redirect URLs, otherwise
  password-reset and confirmation links point at the old github.io host.
- **Stripe**: success/cancel URLs and the webhook endpoint.
- **Cloudflare Worker**: `APP_URL` var, used in email links.
- DNS: an apex domain needs A records pointing at GitHub Pages' IPs (or ALIAS
  /ANAME if Spaceship supports it); `www` should be a CNAME to
  `<user>.github.io`. Enable **Enforce HTTPS** in repo Settings → Pages once the
  certificate is issued.

---

## 5. Email — Spacemail + pocketathlete.com

There are **two separate email jobs**, and they need different tools. This trips
people up, so be clear which is which:

| Job | Who sends it | What to use |
|---|---|---|
| Signup confirmation, password reset | Supabase Auth | Spacemail SMTP |
| Daily nudges, weekly summary | Cloudflare Worker cron | Resend (or Apps Script) |
| Replies from real humans | You, in a mail client | Spacemail mailbox |

**Why not just use Spacemail for everything?** Cloudflare Workers can't open a
normal SMTP connection, so the Worker cannot send through Spacemail directly. It
needs an HTTP email API. Supabase Auth *can* use SMTP, which is why the split
above exists.

### 5a. Set up the Spacemail mailbox (do this first)

1. In Spaceship → **Spacemail**, create a mailbox on `pocketathlete.com`, e.g.
   `hello@pocketathlete.com`. Use a strong password and save it in a password
   manager — you'll paste it into Supabase in 5b.
2. Spaceship should add the required **MX**, **SPF** and **DKIM** records for you
   automatically if the domain is registered there. Confirm they exist under the
   domain's DNS before continuing.
3. Send yourself a test message both ways (in and out) before wiring anything up.
   If mail doesn't flow here, nothing downstream will work either.

### 5b. Point Supabase Auth at Spacemail (most important step)

Out of the box, Supabase sends auth emails from its own shared domain, with a
hard rate limit of a few per hour. That is fine for testing and **will fail you
at launch** — new signups simply won't get their confirmation link.

1. Supabase dashboard → **Project Settings → Authentication → SMTP Settings** →
   enable custom SMTP.
2. Fill in the Spacemail SMTP details:

   | Field | Value |
   |---|---|
   | Host | `mail.spacemail.com` |
   | Port | `465` |
   | Username | the full mailbox address, e.g. `hello@pocketathlete.com` |
   | Password | that mailbox's password |
   | Sender email | `hello@pocketathlete.com` |
   | Sender name | `PocketAthlete` |

   Port `465` is implicit SSL and is the one to use. `587` (STARTTLS) also
   works if Supabase rejects 465 — try it as the fallback, not the default.

   Do **not** use the incoming ports here: `993` is IMAP and `995` is POP3.
   Putting either in the SMTP field produces a connection timeout that looks
   like a firewall problem and isn't.
3. Save, then use **Send test email**. Don't move on until it arrives.
4. Update the auth email templates (Authentication → Email Templates) so they say
   PocketAthlete rather than the Supabase default.

### 5c. Worker reminder emails

The Worker's cron (`[triggers] crons = ["0 8 * * *"]`) sends daily check-in
nudges, deadline reminders and a Monday weekly summary. Pick one:

**Option A — Resend (recommended now you own a domain)**
1. Create a Resend account and add a **subdomain**, e.g. `send.pocketathlete.com`
   — not the root domain. Sending from the root alongside Spacemail means two
   services competing over the same SPF record, which is the usual cause of
   "why is my mail going to spam". A subdomain keeps the two independent.
2. Add the DKIM/SPF records Resend gives you to that subdomain in Spaceship DNS.
3. `npx wrangler secret put RESEND_API_KEY`, and set `REMINDER_FROM` in
   `wrangler.toml` vars to e.g. `PocketAthlete <coach@send.pocketathlete.com>`.

**Option B — Google Apps Script (free, uses your Gmail)**
1. Open https://script.google.com → New project, paste in `google-apps-script/Code.gs`.
2. Set `SHARED_SECRET` in the script to a value of your choice.
3. Deploy → New deployment → **Web app**: *Execute as* Me, *Who has access* Anyone.
   Copy the `/exec` URL. Run it once to authorize Gmail access.
4. `npx wrangler secret put GAS_EMAIL_URL` (the /exec URL) and
   `npx wrangler secret put GAS_EMAIL_SECRET` (matching `SHARED_SECRET`).

   Limits: Gmail free ~100/day, Workspace ~1500/day. Fine for reminders, but it
   sends from your Gmail address, not your domain.

If `GAS_EMAIL_URL` is set it's used; otherwise the Worker falls back to Resend.

### 5d. Domain checklist

- [ ] Spacemail mailbox receives and sends
- [ ] MX + SPF + DKIM present on `pocketathlete.com`
- [ ] Supabase custom SMTP set and **test email received**
- [ ] Auth templates say PocketAthlete
- [ ] Resend verified on a *subdomain*, not the root
- [ ] `NEXT_PUBLIC_SITE_URL` / Supabase **Site URL** point at the live domain, or
      password-reset links will send people to the wrong host

---

## 6. Post-deploy checklist

- [ ] Migrations applied (`node scripts/db-deploy.mjs`)
- [ ] Storage buckets `videos` + `photos` created (private)
- [ ] Auth Site URL + reset-password redirect set
- [ ] Pages enabled + repo variables set → site loads
- [ ] Worker deployed → `/health` returns `{"ok":true}`
- [ ] `NEXT_PUBLIC_API_URL` set → AI coach uses the LLM (not the fallback)
- [ ] (billing) Stripe prices + webhook set
- [ ] (email) Supabase custom SMTP: `mail.spacemail.com:465` — test email received
- [ ] (email) Resend verified on a subdomain for Worker reminders
- [ ] Custom domain: `CNAME` present, base path empty, HTTPS enforced
- [ ] Supabase Site URL + Stripe URLs + Worker `APP_URL` point at pocketathlete.com
- [ ] DB password rotated + demo accounts removed before real users

---

## Local development

```bash
npm install
npm run dev            # front-end at http://localhost:3000
npm test               # unit tests (node --test via tsx)
# Worker:
cd cloudflare && npx wrangler dev
```

Local env for the front-end goes in `.env.local` (gitignored):
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>
# optional, to hit a local/remote worker:
NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
```
