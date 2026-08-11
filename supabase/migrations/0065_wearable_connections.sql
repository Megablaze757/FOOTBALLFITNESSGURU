-- Wearables that upload themselves, instead of a CSV nobody exports twice.
--
-- 0020 gave biometrics a home and two ways in: type it, or import a CSV export.
-- Both are user-initiated, and the honest thing to say about a daily habit that
-- needs a manual export is that it happens once. Readiness leans on HRV and
-- resting HR; data that arrives once a month is data that never arrives.
--
-- WHAT EACH VENDOR ACTUALLY PERMITS — this is why the table looks like it does,
-- and it is worth writing down because the differences are not obvious and they
-- decide what can be built:
--
--   OURA — a public Cloud API with Personal Access Tokens. The athlete generates
--     a token on Oura's site and pastes it in; no app registration, no approval,
--     no OAuth round trip. So this is a real connection that works today, and
--     it is the one this migration is mainly for.
--
--   APPLE HEALTH — no web API at all, and there will not be one. HealthKit data
--     never leaves the device except through an app the user installs. What DOES
--     work is Shortcuts: an automation can read Health each morning and POST it
--     anywhere. That needs a credential the phone can hold, which is what
--     ingest_token below is. No OAuth, because there is no Apple service to
--     authorise against — the phone is the client.
--
--   WHOOP — a real OAuth 2.0 API, but it requires registering an application
--     and being issued a client id and secret. The flow is buildable; it cannot
--     function until someone completes that registration. Stored here so the
--     connection exists the day it is.
--
--   GARMIN — the Health API is behind the Garmin Connect Developer Program,
--     which is an application and a commercial agreement rather than a signup
--     form. Nothing can be shipped that works without it, so Garmin stays on
--     the CSV path and the UI says so rather than showing a button that fails.

-- --- Per-user ingest token ---------------------------------------------------
--
-- Bearer credential for pushes from something that cannot hold a Supabase
-- session — an Apple Shortcut, a Tasker job, a script. Deliberately NOT the
-- user's JWT: those expire hourly, and a Shortcut cannot refresh one.
--
-- Nullable and null by default. A credential that exists for everybody whether
-- or not they use it is a credential that leaks for people who never opted in.
alter table public.profiles add column if not exists ingest_token uuid;

create unique index if not exists profiles_ingest_token_idx
  on public.profiles (ingest_token) where ingest_token is not null;

comment on column public.profiles.ingest_token is
  'Bearer token for pushed biometrics (Apple Shortcuts et al). Null until the athlete asks for one. Rotate by updating it.';

-- --- Connections -------------------------------------------------------------

create table if not exists public.wearable_connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('oura', 'whoop', 'garmin', 'apple_health')),
  -- Oura personal access token, or an OAuth access token for the providers that
  -- use one. Written and read ONLY by the service role — see the policies below.
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  last_sync_at timestamptz,
  -- Why the last sync failed, shown to the athlete. A connection that silently
  -- stopped working is worse than no connection, because readiness keeps
  -- reporting on stale data as though it were current.
  last_error text,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.wearable_connections enable row level security;

-- THE ATHLETE MUST NOT BE ABLE TO READ THIS TABLE.
--
-- It holds bearer tokens for a third-party health account. `select` on your own
-- row sounds harmless and is not: an XSS or a malicious dependency in a page
-- the athlete has open could read every token with the athlete's own anon key.
-- Nothing in the client ever needs the token back — it is written once and used
-- only by the Worker, which holds the service role key.
--
-- So: insert and delete your own row (connect and disconnect), update your own
-- row (rotate a token), and select only the metadata that says whether it is
-- working. That last part is what the view below is for.
drop policy if exists "wearable_connections: own write" on public.wearable_connections;
create policy "wearable_connections: own write" on public.wearable_connections for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "wearable_connections: own update" on public.wearable_connections;
create policy "wearable_connections: own update" on public.wearable_connections for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "wearable_connections: own delete" on public.wearable_connections;
create policy "wearable_connections: own delete" on public.wearable_connections for delete to authenticated
  using (user_id = auth.uid());

-- NO SELECT POLICY ON THE BASE TABLE. RLS denies by default, so the tokens are
-- unreadable from the client even by the athlete who supplied them.
--
-- The status view is therefore a SECURITY DEFINER view (the Postgres default),
-- not security_invoker. This matters and is easy to get backwards: an invoker
-- view runs as the caller, so it would need a select policy on the base table
-- to work — and that policy would also let the client read access_token
-- directly through PostgREST, defeating the entire arrangement. A definer view
-- reads the table as its owner and hands back only the columns named here.
--
-- Which means the row filter has to live IN the view. Without the auth.uid()
-- clause a definer view returns every athlete's connection status to anyone
-- who asks.
create or replace view public.wearable_status as
  select user_id, provider, last_sync_at, last_error, created_at,
         (access_token is not null) as connected
  from public.wearable_connections
  where user_id = auth.uid();

grant select on public.wearable_status to authenticated;

-- Track where a biometric row came from, so a manual correction isn't silently
-- overwritten by the next sync and the UI can say "from your Oura ring".
--
-- 'import' IS IN THIS LIST BECAUSE THAT IS WHAT THE CODE ACTUALLY WRITES.
-- parseBiometricCsv has always stamped rows 'import'; a list built from what the
-- values ought to be called rather than from what they are would have failed to
-- apply against any existing CSV data, and then rejected every future CSV
-- import — silently breaking a working feature to tidy up a string.
--
-- Deliberately NOT validated against existing rows, for the same reason: a
-- constraint that refuses to install because of historic data leaves the column
-- with no constraint at all, which is worse than one that accepts a legacy
-- value. NOT VALID checks new writes only; the old rows are already written and
-- nothing reads `source` in a way that a stray value could break.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'biometrics_source_check') then
    alter table public.biometrics
      add constraint biometrics_source_check
      check (source in ('manual', 'import', 'csv', 'oura', 'whoop', 'garmin', 'apple_health'))
      not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
