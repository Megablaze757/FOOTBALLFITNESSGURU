-- =============================================================================
-- 0047: Usernames.
--
-- The leaderboard fell back to the literal word "Athlete" for anyone without a
-- full name — 14 of 19 profiles — so most of the board read "Athlete, Athlete,
-- Athlete". A board where nobody is identifiable isn't a board.
--
-- A handle rather than a real name on purpose. This is a public leaderboard
-- that includes under-18s, and publishing "Sam Fletcher, 6-day streak" to the
-- world is more than anyone signed up for. A username is a name you choose to
-- be known by.
-- =============================================================================

alter table public.profiles
  add column if not exists username text;

-- Stored lowercase so uniqueness is genuinely case-insensitive: without this,
-- "Striker" and "striker" are two different rows and impersonation is trivial.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (
    username is null or (
      username = lower(username)
      and username ~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$'
      and username !~ '__'
      and username ~ '[a-z]'          -- at least one letter; digits alone read as an id
    )
  );

create unique index if not exists profiles_username_key on public.profiles(username);

-- --- Backfill ----------------------------------------------------------------
--
-- Everyone gets one now, so the board stops saying "Athlete". Generated from
-- the user id rather than the email: turning jordan.whitfield@example.com into the
-- public handle "jordanwhitfield" would publish most of someone's address to
-- strangers. Mirrors suggestUsername() in lib/username.ts.
do $$
declare
  r record;
  adjectives text[] := array['swift','sharp','steady','bold','quick','solid','clutch','fierce',
                             'calm','iron','rapid','relentless','silent','prime','wired','bright'];
  nouns text[] := array['striker','winger','runner','keeper','engine','sprinter','captain',
                        'rocket','hammer','falcon','comet','tiger','wolf','shark','bolt','ace'];
  h bigint;
  candidate text;
  salt int;
begin
  for r in select id from public.profiles where username is null loop
    salt := 0;
    loop
      -- Cheap deterministic hash of (id, salt).
      h := abs(('x' || substr(md5(r.id::text || ':' || salt), 1, 8))::bit(32)::int)::bigint;
      candidate := adjectives[1 + (h % array_length(adjectives, 1))]
                || nouns[1 + ((h / 16) % array_length(nouns, 1))]
                || ((h / 256) % 100)::text;
      exit when not exists (select 1 from public.profiles p where p.username = candidate);
      salt := salt + 1;
      -- Give up rather than spin: a null username still renders, it just falls
      -- back to a first name.
      exit when salt > 50;
    end loop;
    if salt <= 50 then
      update public.profiles set username = candidate where id = r.id;
    end if;
  end loop;
end $$;

-- --- Leaderboard -------------------------------------------------------------
--
-- Show the handle. Falls back to a first name, then to "Athlete" — which after
-- the backfill should be unreachable, but a leaderboard that renders a blank
-- cell is worse than one that says "Athlete" once.
create or replace function public.leaderboard_stats(p_scope text default 'world')
returns table (
  user_id uuid,
  name text,
  check_ins_7 int,
  avg_sleep numeric,
  sessions_7 int,
  minutes_7 int,
  completed_7 int,
  streak int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since date := current_date - 6;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with people as (
    select p.id,
           coalesce(
             nullif(trim(p.username), ''),
             split_part(nullif(trim(p.full_name), ''), ' ', 1),
             'Athlete'
           ) as display_name
      from public.profiles p
     where p.leaderboard_opt_out = false
       and (
         p_scope <> 'squad'
         or p.id = auth.uid()
         or exists (
           select 1 from public.coach_athletes a
             join public.coach_athletes b on b.coach_id = a.coach_id and b.status = 'accepted'
            where a.athlete_id = auth.uid() and a.status = 'accepted' and b.athlete_id = p.id
         )
         or exists (
           select 1 from public.coach_athletes c
            where c.coach_id = auth.uid() and c.athlete_id = p.id and c.status = 'accepted'
         )
       )
  )
  select
    pe.id,
    pe.display_name::text,
    coalesce((select count(*)::int from public.daily_check_ins d
               where d.user_id = pe.id and d.check_in_date >= v_since), 0),
    (select round(avg(d.sleep_quality), 2) from public.daily_check_ins d
      where d.user_id = pe.id and d.check_in_date >= v_since and d.sleep_quality is not null),
    coalesce((select count(*)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    coalesce((select sum(t.total_minutes)::int from public.training_logs t
               where t.user_id = pe.id and t.log_date >= v_since), 0),
    coalesce((select case
                       when jsonb_typeof(pr.completed_sessions) = 'array'
                         then jsonb_array_length(pr.completed_sessions)
                       else 0
                     end
                from public.programs pr
               where pr.user_id = pe.id and pr.status = 'active' limit 1), 0),
    coalesce((
      select count(*)::int from (
        select d.check_in_date,
               row_number() over (order by d.check_in_date desc) as rn
          from public.daily_check_ins d
         where d.user_id = pe.id and d.check_in_date <= current_date
      ) s
      where s.check_in_date = current_date - ((s.rn - 1))::int
    ), 0)
  from people pe;
end;
$$;

revoke execute on function public.leaderboard_stats(text) from public, anon;
grant execute on function public.leaderboard_stats(text) to authenticated;

-- Is a handle free? Needed before saving, and it must not become a way to
-- enumerate the user list — it answers only yes/no about one exact string.
create or replace function public.username_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
        where p.username = lower(trim(p_name)) and p.id <> auth.uid()
     )
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

notify pgrst, 'reload schema';
