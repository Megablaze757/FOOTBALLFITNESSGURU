-- =============================================================================
-- 0110 — subscribe to your training plan from a calendar app.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ADDRESS IS THE CREDENTIAL, BECAUSE A CALENDAR APP CANNOT LOG IN.
--
-- Apple Calendar, Google Calendar and Outlook all subscribe to a URL and poll
-- it. None of them can hold a Supabase session or refresh a token, so the only
-- thing that can identify the athlete is the URL itself — the same constraint
-- migration 0065 hit for the Apple Health shortcut, answered the same way.
--
-- WHAT THAT MEANS, SAID PLAINLY. A URL travels: into a phone's settings, a
-- server log, a screenshot. So the token grants exactly one thing — a
-- READ-ONLY feed of that athlete's own programme — and re-minting replaces it,
-- which is the only way to un-share a link already given out.
--
-- Separate from ingest_token on purpose. That one WRITES biometrics; this one
-- reads a plan. One key for both would mean revoking a calendar you shared
-- also breaks the health import, and would make a leaked calendar URL a way to
-- write to somebody's record.
-- ═══════════════════════════════════════════════════════════════════════════
-- =============================================================================

alter table public.profiles
  add column if not exists calendar_token uuid;

comment on column public.profiles.calendar_token is
  'Read-only calendar subscription key. The URL is the credential — see the '
  'Worker''s calendarFeed. Re-minting revokes the previous URL.';

-- Unique, and only over the rows that have one: the lookup is by token, and two
-- athletes sharing one would serve the wrong person's programme.
create unique index if not exists profiles_calendar_token_idx
  on public.profiles (calendar_token)
  where calendar_token is not null;

-- NOT readable by the athlete's own client, and that is deliberate. The token
-- is minted and returned by the Worker over an authenticated call; leaving it
-- selectable from the browser would put a long-lived credential into every
-- cached profile payload in the app.
revoke select (calendar_token) on public.profiles from authenticated, anon;

notify pgrst, 'reload schema';

select 'OK - migration 0110 applied' as result;
