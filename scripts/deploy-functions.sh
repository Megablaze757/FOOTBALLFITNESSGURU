#!/usr/bin/env bash
# Deploys all edge functions and sets their secrets.
#
# Prereqs:
#   - Supabase CLI installed + `supabase login` done (or SUPABASE_ACCESS_TOKEN set)
#   - A `.env.deploy` file (gitignored) in the repo root with the values below
#   - Run from the repo root:  bash scripts/deploy-functions.sh <PROJECT_REF>
set -euo pipefail

REF="${1:?Usage: deploy-functions.sh <PROJECT_REF>}"
[ -f .env.deploy ] && set -a && . ./.env.deploy && set +a

echo "Linking project $REF…"
supabase link --project-ref "$REF"

echo "Setting function secrets…"
supabase secrets set \
  AI_WORKER_URL="${AI_WORKER_URL:-}" \
  CV_WORKER_URL="${CV_WORKER_URL:-}" \
  WORKER_API_KEY="${WORKER_API_KEY:-}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}" \
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}" \
  STRIPE_PRICE_SILVER="${STRIPE_PRICE_SILVER:-}" \
  STRIPE_PRICE_GOLD="${STRIPE_PRICE_GOLD:-}" \
  RESEND_API_KEY="${RESEND_API_KEY:-}" \
  GROQ_API_KEY="${GROQ_API_KEY:-}" \
  WEBHOOK_SECRET="${WEBHOOK_SECRET:-}" \
  OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}" \
  REMINDER_FROM="${REMINDER_FROM:-AI Coach <noreply@example.com>}" \
  APP_URL="${APP_URL:-http://localhost:3000}"

# JWT-verified functions (called with a Supabase JWT / service key).
# Every AI function runs the chain in functions/_shared/llm.ts: Groq first for
# speed, OpenRouter after it for breadth, and no Anthropic key anywhere. A
# provider whose key is unset is skipped, so either one alone is a working
# configuration.
#
# TIER GATING LIVES HERE NOW, not only in the Cloudflare Worker. coach-chat,
# generate-program and estimate-food each call requireTier() from
# functions/_shared/gate.ts before doing any work — see the header of that file.
# They had no such check while the Worker held the paywall, which stopped being
# true the moment NEXT_PUBLIC_API_URL was unset.
#
# process-video takes WEBHOOK_SECRET. Optional, but set it: without it any
# signed-in user can POST a forged webhook payload and make the function spend
# CV-worker budget. Put the same value in the Database Webhook's headers as
# `x-webhook-secret`.
#
# estimate-food reads meal photos, and is here because the Cloudflare Worker's
# deployed model chain is text-only — see the header of its index.ts — so this
# is what the photo path actually runs against until that is fixed.
# NO REMINDER FUNCTIONS HERE. The daily reminder, weekly summary, deadline
# reminders, streak milestones and the workout reminder all moved into the
# Cloudflare Worker's cron — they were being sent twice, once from each side.
# See supabase/migrations/0097_reminders_move_to_the_worker.sql.
for fn in assess-readiness process-daily-state process-video create-checkout \
          coach-chat generate-program estimate-food; do
  echo "Deploying $fn…"
  supabase functions deploy "$fn"
done

# Stripe calls this with its own signature, not a Supabase JWT.
echo "Deploying stripe-webhook (no JWT verification)…"
supabase functions deploy stripe-webhook --no-verify-jwt

echo "Done. Next: run supabase/webhooks.sql in the SQL Editor."
echo "Reminders are sent by the Cloudflare Worker, not from here — see cloudflare/src/index.ts."
