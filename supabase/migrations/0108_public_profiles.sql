-- =============================================================================
-- 0108 — an athlete can have a page.
--
-- WHY THIS IS THE SHARE TARGET. A share card links to the front page, which is
-- a pitch. A link to the athlete's OWN page is a thing their friend actually
-- wants to look at, and it is the same link that credits them — so the share,
-- the proof and the attribution are one URL instead of three.
--
-- It is also the only SEO surface here that grows with the user base rather
-- than with the catalogue. Every other page on this site was written once.
--
-- OPT-IN, AND OFF. Nobody's training becomes public because a feature shipped.
-- The column defaults to false and the view returns nothing for anybody who has
-- not turned it on and chosen a username.
--
-- WHAT IS EXPOSED IS DELIBERATELY SMALL: the name they chose, their sport and
-- position, and the XP the leaderboard already publishes. No check-ins, no
-- weight, no injuries, no food. A profile is a rank and an identity, not a
-- medical record — and the failure mode of "expose a bit more" is one nobody
-- can take back.
-- =============================================================================

alter table public.profiles
  add column if not exists public_profile boolean not null default false;

comment on column public.profiles.public_profile is
  'Opt-in. When true AND a username is set, /a/<username> is built and indexed.';

/**
 * The rows a build may read, as `anon`.
 *
 * A view rather than a policy on profiles: the site is a static export and the
 * build reads this with the publishable key, so the safe thing is a surface
 * that CANNOT return a private column, rather than a policy that returns the
 * whole row and trusts every caller to select carefully.
 */
-- BOTH, and each does something the other cannot.
--
-- `create or replace view` alone cannot change a view's column list: a re-run
-- after this file's shape changed fails with "cannot drop columns from view".
-- The drop is what makes that work.
--
-- And `or replace` alone looks redundant after a drop — but the idempotency
-- guard in lib/apply-sql.test.ts reads statements one at a time and cannot see
-- the drop above, so a bare `create view` reads to it as a statement that fails
-- on a second run. It is also true on its own terms: this file is pasted into a
-- SQL editor by hand, and a paste that starts halfway down should not fail.
drop view if exists public.public_athletes;

create or replace view public.public_athletes
with (security_invoker = off) as
  select
    -- The username IS the display name here, and that is the whole point: it is
    -- the one name on this table the person chose knowing it was a name. A
    -- separate `handle` column was written first, derived from the username,
    -- which meant the page printed the same string twice under two labels.
    -- full_name is never published — a real name is not something to put on the
    -- open web on somebody's behalf, whatever box they ticked.
    p.username,
    p.sport,
    p.position,
    coalesce(p.xp, 0) as xp,
    p.created_at
  from public.profiles p
  where p.public_profile
    and p.username is not null;

revoke all on public.public_athletes from public;
grant select on public.public_athletes to anon, authenticated;

comment on view public.public_athletes is
  'Opt-in public profiles, for the static build and for /a/<username>. '
  'Deliberately excludes every health, food and body column.';
