-- Achievements, recorded — so "how many people have this?" has an answer.
--
-- WHY THERE IS A TABLE AT ALL. Achievements are derived, not stored: the client
-- runs ACHIEVEMENTS[].test() over the athlete's own counts and the answer falls
-- out. That is a good design and it stays — one definition of each badge, in
-- TypeScript, tested. But it means an unlock exists only in the browser that
-- computed it, so nothing in the system knows what anyone else has, and
-- rarity — the thing that makes a badge mean something — cannot be asked.
--
-- Deriving it in SQL instead would mean writing every achievement's rule a
-- second time, in a second language, and keeping the two in step forever. This
-- table is the smaller price: the client posts what it worked out, and the only
-- thing SQL does is count rows.
--
-- SOFT DATA, DELIBERATELY. A client can write a row for a badge it has not
-- earned. It is their own row and RLS keeps it that way, so the blast radius is
-- one athlete lying to themselves about a percentage on a card — and the
-- alternative costs a duplicated rule engine to defend a number that is
-- decoration. Nothing here grants access, unlocks a feature or touches billing.

create table if not exists public.achievement_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The id from ACHIEVEMENTS in lib/gamification.ts. Text, not an enum: badges
  -- are added and renamed in TypeScript and a migration per badge would mean
  -- the two have to ship together, which they never would.
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievement_unlocks enable row level security;

-- Your own rows, and only your own.
drop policy if exists "achievement_unlocks: read own" on public.achievement_unlocks;
create policy "achievement_unlocks: read own"
  on public.achievement_unlocks for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "achievement_unlocks: insert own" on public.achievement_unlocks;
create policy "achievement_unlocks: insert own"
  on public.achievement_unlocks for insert to authenticated
  with check (auth.uid() = user_id);

-- No update policy on purpose. An unlock has no fields worth changing, and the
-- one thing an update could do is backdate `unlocked_at` — so the row is
-- write-once and the client upserts with ON CONFLICT DO NOTHING.

drop policy if exists "achievement_unlocks: delete own" on public.achievement_unlocks;
create policy "achievement_unlocks: delete own"
  on public.achievement_unlocks for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists achievement_unlocks_achievement_idx
  on public.achievement_unlocks (achievement_id);

-- --- How rare is each badge? -------------------------------------------------
--
-- SECURITY DEFINER because the whole point is to count rows belonging to other
-- people, which the SELECT policy above quite rightly forbids. What comes back
-- is aggregate only — an id and a percentage. No user ids, no names, no way to
-- ask about a particular person.
--
-- The denominator is athletes who have unlocked ANYTHING, not every row in
-- profiles. Signups who opened the app once and never checked in would drag
-- every percentage toward zero and make the rarest badge indistinguishable from
-- the most common one. "Of people playing, this many have it" is the question
-- someone looking at a badge is actually asking.
create or replace function public.achievement_rarity()
returns table (achievement_id text, holders int, pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select count(distinct user_id)::numeric as n from public.achievement_unlocks
  )
  select
    u.achievement_id,
    count(*)::int as holders,
    -- Guarded: on an empty table `active.n` is 0 and this is the first person
    -- to ever unlock anything, in which case there is nothing to divide by.
    case when active.n > 0 then round(count(*) * 100.0 / active.n, 1) else 0 end as pct
  from public.achievement_unlocks u, active
  group by u.achievement_id, active.n;
$$;

revoke all on function public.achievement_rarity() from public;
grant execute on function public.achievement_rarity() to authenticated;
