-- =============================================================================
-- 0066: Remember which day the athlete is living in.
--
-- The morning sync (supabase/functions/wearable-ingest) accepts a payload with
-- no date and has to decide what "today" means. It runs in UTC on Supabase's
-- infrastructure, and UTC's today is not the athlete's:
--
--   A Shortcut fires at 7am in Sydney reporting last night's sleep. 7am in
--   Sydney is 21:00 the previous day in UTC, so defaulting to the server's date
--   files every single morning against the night before — and the readiness
--   score for the day they are about to train never sees it.
--
-- This is the same class of bug as the one lib/day.ts fixes in the app, where
-- it was silently losing check-ins. Here the server cannot ask the device, so
-- the device has to have told it in advance.
--
-- Nullable, and the function falls back to UTC when it is null: an existing
-- athlete who has not opened the app since this shipped still syncs, they just
-- get the old behaviour until they do. The alternative — defaulting everyone to
-- a guess — would be worse than admitting we do not know.
--
-- An IANA name ('Europe/London'), not an offset. Offsets change twice a year
-- and a stored '+01:00' is wrong for half of it.
-- =============================================================================

alter table public.profiles add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone from the athlete''s browser (Intl.DateTimeFormat().resolvedOptions().timeZone). '
  'Used by wearable-ingest to resolve a dateless payload to the athlete''s local day. '
  'Null means unknown — callers must fall back to UTC rather than guessing.';

notify pgrst, 'reload schema';
