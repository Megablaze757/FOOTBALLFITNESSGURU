-- =============================================================================
-- 0053: Deactivate an account, and let a referral code be typed at signup.
--
-- TWO THINGS.
--
-- 1. Suspension. Beta testers on comped Pro need turning off — either just the
--    free ride, or the whole account. Deleting is the existing option and it is
--    irreversible; this is the reversible one, which is what "deactivate"
--    should mean.
--
-- 2. Referral codes typed by hand. Attribution currently depends entirely on
--    ?ref=CODE surviving in localStorage from click to signup. That breaks for
--    a different browser, cleared storage, private mode, or the commonest case
--    of all — someone told a code out loud. An affiliate whose referrals
--    silently don't register is an affiliate who stops promoting.
-- =============================================================================

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

create index if not exists idx_profiles_suspended on public.profiles(suspended_at)
  where suspended_at is not null;

-- Suspension is an admin decision. Without this, the privilege guard would let
-- someone lift their own suspension with a PATCH — the same hole that let
-- anyone make themselves an admin before 0039.
create or replace function public.guard_suspension()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason then
    if not public.is_admin() then
      new.suspended_at := old.suspended_at;
      new.suspended_reason := old.suspended_reason;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_suspension on public.profiles;
create trigger trg_profiles_suspension
  before update on public.profiles
  for each row execute function public.guard_suspension();

/** Is this user suspended? Used by the app and the Worker. */
create or replace function public.is_suspended(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = p_user and suspended_at is not null)
$$;

grant execute on function public.is_suspended(uuid) to authenticated, service_role;

-- --- Admin actions -----------------------------------------------------------

/**
 * Suspend or restore an account.
 *
 * Suspending also cancels any comped subscription, because the usual reason to
 * suspend a beta tester is that the free access should stop. A real Stripe
 * subscription is left alone — cancelling that is Stripe's job, not a flag's,
 * and silently stopping someone's paid access here would be worse.
 */
create or replace function public.admin_set_suspended(
  p_user uuid, p_suspended boolean, p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Locking yourself out of your own admin panel is not recoverable in-app.
  if p_user = auth.uid() and p_suspended then
    raise exception 'you cannot suspend your own account' using errcode = '22023';
  end if;

  update public.profiles
     set suspended_at = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then p_reason else null end
   where id = p_user;

  if p_suspended then
    update public.subscriptions
       set status = 'canceled', tier = 'bronze'
     where user_id = p_user and stripe_subscription_id is null; -- comped only
  end if;

  return true;
end;
$$;

revoke all on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;

/** Grant or revoke comped Pro without touching anything Stripe owns. */
create or replace function public.admin_set_comped(p_user uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.subscriptions
              where user_id = p_user and stripe_subscription_id is not null) then
    raise exception 'that account pays through Stripe — change it there' using errcode = '22023';
  end if;

  if p_on then
    insert into public.subscriptions (user_id, tier, status) values (p_user, 'gold', 'active')
      on conflict (user_id) do update set tier = 'gold', status = 'active';
  else
    update public.subscriptions set status = 'canceled', tier = 'bronze' where user_id = p_user;
  end if;
  return true;
end;
$$;

revoke all on function public.admin_set_comped(uuid, boolean) from public, anon;
grant execute on function public.admin_set_comped(uuid, boolean) to authenticated;

-- --- Referral codes typed at signup ------------------------------------------

/**
 * Does this affiliate code exist and is it taking referrals?
 *
 * Callable by anyone signed in, so the signup form can confirm a hand-typed
 * code before saving it. Answers only yes/no about one exact string — it
 * cannot be used to list affiliates.
 */
create or replace function public.referral_code_valid(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.affiliates
     where lower(code) = lower(trim(p_code)) and active
  )
$$;

revoke all on function public.referral_code_valid(text) from public;
grant execute on function public.referral_code_valid(text) to anon, authenticated;

-- Surface suspension in the admin user list.
--
-- Dropped first: `create or replace` cannot change a function's return type,
-- and this adds two columns. Without the drop the migration fails with
-- "cannot change return type of existing function", which is the same wall
-- 0034 hit when it widened this signature.
drop function if exists public.admin_users();

create or replace function public.admin_users()
returns table (
  user_id uuid, email text, full_name text, role text, beta boolean,
  tier text, status text, referral_code text, affiliate_name text,
  created_at timestamptz, last_sign_in_at timestamptz,
  suspended_at timestamptz, comped boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.full_name, p.role,
         coalesce(p.beta, false),
         coalesce(s.tier, 'bronze')::text,
         coalesce(s.status, 'none')::text,
         p.referral_code,
         a.name,
         u.created_at,
         u.last_sign_in_at,
         p.suspended_at,
         -- Comped = has access without paying Stripe. What you can revoke here.
         (s.user_id is not null and s.stripe_subscription_id is null and s.status = 'active')
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    left join public.affiliates a on lower(a.code) = lower(p.referral_code)
   order by u.created_at desc;
end;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

notify pgrst, 'reload schema';
