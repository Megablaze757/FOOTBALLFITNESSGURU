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
  REMINDER_FROM="${REMINDER_FROM:-AI Coach <noreply@example.com>}" \
  APP_URL="${APP_URL:-http://localhost:3000}"

# JWT-verified functions (called with a Supabase JWT / service key).
for fn in assess-readiness process-daily-state process-video create-checkout \
          send-daily-reminders weekly-summary; do
  echo "Deploying $fn…"
  supabase functions deploy "$fn"
done

# Stripe calls this with its own signature, not a Supabase JWT.
echo "Deploying stripe-webhook (no JWT verification)…"
supabase functions deploy stripe-webhook --no-verify-jwt

echo "Done. Next: run supabase/webhooks.sql and supabase/cron/schedule.sql in the SQL Editor."
