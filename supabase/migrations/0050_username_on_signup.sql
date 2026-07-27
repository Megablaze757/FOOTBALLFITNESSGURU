-- =============================================================================
-- 0050: New signups get a username too.
--
-- 0047 backfilled every profile that existed at the time, but nothing gave one
-- to anyone signing up afterwards. The first person to join after that
-- migration had username NULL and rendered as "Athlete" on the leaderboard —
-- the exact problem 0047 was written to fix, quietly reintroducing itself one
-- new user at a time.
--
-- Generated in a BEFORE INSERT trigger rather than in the app, because a
-- profile row is created by handle_new_user() on auth signup, not by any
-- client code we control.
-- =============================================================================

create or replace function public.assign_username()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  adjectives text[] := array['swift','sharp','steady','bold','quick','solid','clutch','fierce',
                             'calm','iron','rapid','relentless','silent','prime','wired','bright'];
  nouns text[] := array['striker','winger','runner','keeper','engine','sprinter','captain',
                        'rocket','hammer','falcon','comet','tiger','wolf','shark','bolt','ace'];
  h bigint;
  candidate text;
  salt int := 0;
begin
  if new.username is not null and trim(new.username) <> '' then
    return new;
  end if;

  loop
    h := abs(('x' || substr(md5(new.id::text || ':' || salt), 1, 8))::bit(32)::int)::bigint;
    candidate := adjectives[1 + (h % array_length(adjectives, 1))]
              || nouns[1 + ((h / 16) % array_length(nouns, 1))]
              || ((h / 256) % 100)::text;
    exit when not exists (select 1 from public.profiles p where p.username = candidate);
    salt := salt + 1;
    -- Give up rather than spin. A null username still renders — it falls back
    -- to a first name — so a stuck loop would be the worse failure.
    exit when salt > 50;
  end loop;

  if salt <= 50 then
    new.username := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_username on public.profiles;
create trigger trg_profiles_username
  before insert on public.profiles
  for each row execute function public.assign_username();

-- Anyone who slipped through between 0047 and this migration.
update public.profiles p
   set username = sub.candidate
  from (
    select id,
           (array['swift','sharp','steady','bold','quick','solid','clutch','fierce',
                  'calm','iron','rapid','relentless','silent','prime','wired','bright'])
             [1 + (abs(('x' || substr(md5(id::text || ':0'), 1, 8))::bit(32)::int)::bigint % 16)]
        || (array['striker','winger','runner','keeper','engine','sprinter','captain',
                  'rocket','hammer','falcon','comet','tiger','wolf','shark','bolt','ace'])
             [1 + ((abs(('x' || substr(md5(id::text || ':0'), 1, 8))::bit(32)::int)::bigint / 16) % 16)]
        || ((abs(('x' || substr(md5(id::text || ':0'), 1, 8))::bit(32)::int)::bigint / 256) % 100)::text
             as candidate
      from public.profiles
     where username is null
  ) sub
 where p.id = sub.id
   and not exists (select 1 from public.profiles q where q.username = sub.candidate);

notify pgrst, 'reload schema';
