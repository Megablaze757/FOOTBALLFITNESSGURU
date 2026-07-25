-- =============================================================================
-- 0034: Who is on the app, on what plan, and who brought them in.
--
-- The admin panel could see aggregate affiliate counts but not a single user
-- row, so "which of these are beta testers and which are paying?" and "who
-- referred this person?" were unanswerable without opening the Supabase
-- dashboard.
-- =============================================================================

-- 1) Mark beta accounts -------------------------------------------------------
-- Anyone who signs up before launch is a beta user, and stays flagged as one
-- afterwards. Derived at signup rather than computed later, because the flag
-- has to survive the launch switch being flipped.
alter table public.profiles
  add column if not exists beta boolean not null default false;

-- Everyone who signed up so far did so pre-launch, so backfill accordingly.
update public.profiles p
   set beta = true
 where p.beta = false
   and not coalesce((select s.launched from public.app_settings s where s.id), false);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_live boolean;
begin
  -- app_settings holds a single row; treat a missing one as "not launched yet".
  select coalesce(launched, false) into is_live from public.app_settings where id;

  insert into public.profiles (id, full_name, avatar_url, beta)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    not coalesce(is_live, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) The admin user list ------------------------------------------------------
-- Emails live in auth.users, which the anon/authenticated roles cannot read, so
-- this is SECURITY DEFINER and gated on is_admin(). It refuses outright for
-- anyone else rather than returning an empty set, so a missing admin role is
-- obvious instead of looking like "no users".
drop function if exists public.admin_users();
create or replace function public.admin_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  beta boolean,
  tier text,
  status text,
  referral_code text,
  affiliate_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.role,
    p.beta,
    -- No subscription row at all means free, same as an inactive one.
    coalesce(case when s.status = 'active' then s.tier else 'bronze' end, 'bronze')::text,
    coalesce(s.status, 'none')::text,
    p.referral_code,
    a.name,
    u.created_at,
    u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  left join public.affiliates a on a.code = p.referral_code
  order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

notify pgrst, 'reload schema';
