# Security model & production checklist

## Architecture
Static SPA (GitHub Pages) → Supabase directly from the browser using the
**publishable/anon key**. There is no app server. **Row Level Security (RLS) is the
security boundary** — every table denies access by default and only exposes rows via
explicit policies. The publishable key is safe to ship in the client; it can do nothing
that RLS doesn't allow.

## What protects what
- **RLS on every table.** Users only read/write their own rows (`auth.uid() = user_id`).
  Verified: all app tables have `rowsecurity = true`.
- **Tiering** via `current_tier()` (SECURITY DEFINER, `search_path` locked): AI insights &
  nutrition are silver+, full benchmark history & video biomechanics are gold.
- **Admin** via `is_admin()`; `admin_metrics()` refuses non-admins.
- **Coaching with consent.** A coach invites an athlete (`add_athlete_by_email` → a
  **pending** row). The coach can read the athlete's data **only after the athlete accepts**
  (`is_coach_of()` requires `status = 'accepted'`). A coach cannot self-accept (insert is
  forced to `pending`; only the athlete can update the status).
- **Storage** (`videos`, `photos`) is private with owner-only object policies; access is via
  short-lived signed URLs.
- **Service-role key** is used only inside Edge Functions (server-side); it is never in the
  client bundle. Stripe webhook verifies the signature; edge functions that call the Python
  workers use a shared `WORKER_API_KEY`.
- **SECURITY DEFINER functions** all set an explicit `search_path` (prevents search-path
  privilege escalation).
- **Auth**: passwords hashed by Supabase (bcrypt); email/password + password reset flow;
  sessions auto-refresh; tokens in `localStorage` (standard for SPAs — RLS still gates data).

## ⚠️ Before going to production — do these
1. **Rotate the database password.** It was pasted in chat during development — treat it as
   compromised. Dashboard → Settings → Database → Reset password.
2. **Remove the demo accounts.** `node scripts/cleanup-demo.mjs` deletes
   athlete/admin/coach `@example.com` (the seeded **admin** has a known password — a backdoor
   if left in place). Create your real admin by setting `profiles.role = 'admin'` on your own
   user.
3. **Turn on email confirmation** (Dashboard → Auth → Providers → Email → Confirm email) so
   sign-ups verify their address.
4. **Add the Auth redirect URLs**: your Pages URL and `…/reset-password/` (Dashboard → Auth →
   URL Configuration) so magic/reset links are accepted.
5. **Enable leaked-password protection** and consider **MFA** (Dashboard → Auth).
6. **Upgrade off the free tier** if you need it always-on (free projects auto-pause).
7. Set Edge Function secrets and deploy them; restrict CORS origins if you don't need `*`.

## Reporting
This is a demo/portfolio build. For a real deployment, wire an error/monitoring service and a
security contact here.
