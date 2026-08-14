-- =============================================================================
-- 0078 — the funnel never recorded a signup.
--
-- THE BUG. app/login/page.tsx called track('signup') inside `if (data.session)`.
-- With email confirmation switched on there IS no session at signUp, so the
-- branch never ran. The comment beside it said the event would instead "land on
-- first sign-in" — but the sign-in branch only redirects, and records nothing.
-- Nothing anywhere else emits it either.
--
-- So for every account created through the confirm-by-email flow — which is all
-- of them — the first step of the funnel was empty. Since `signup` is the
-- denominator for every conversion rate in FUNNEL_STEPS, the whole report read
-- as broken: real people onboarding and checking in, above a signup count of
-- zero.
--
-- It failed silently by design. track() is fire-and-forget and swallows every
-- error so analytics can never break what the athlete was doing, which is the
-- right call — and it is also why nobody noticed for as long as they did.
--
-- THE FIX. handle_new_user() already runs exactly once per account, server-side,
-- as the profile row is created. That is the only place that sees every signup
-- regardless of auth flow: password, confirm-by-email, OAuth, magic link. The
-- same reasoning as 0054, which moved referral attribution here after the
-- client-side version was lost to exactly this missing-session problem.
--
-- A CONSEQUENCE WORTH KNOWING. This counts accounts that are created but never
-- confirmed. That is deliberate: someone who signs up and never clicks the
-- email is a real leak, and until now it was invisible — they existed in
-- auth.users and appeared nowhere in the funnel.
--
-- The client-side call is removed in the same change, so this does not double
-- count anyone whose signup did return a session.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_live boolean;
  v_code text;
begin
  -- app_settings holds a single row; treat a missing one as "not launched yet".
  select coalesce(launched, false) into is_live from public.app_settings where id;

  -- Only keep a code that belongs to a real, active affiliate. Storing an
  -- unmatched string would look like attribution in the profile while counting
  -- for nobody in the affiliate stats.
  v_code := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  if v_code is not null then
    select a.code into v_code from public.affiliates a
     where lower(a.code) = lower(v_code) and a.active
     limit 1;
  end if;

  insert into public.profiles (id, full_name, avatar_url, beta, referral_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    not coalesce(is_live, false),
    v_code
  )
  on conflict (id) do nothing;

  -- The funnel's first step.
  --
  -- Guarded by NOT EXISTS rather than trusted to run once: the profile insert
  -- above tolerates a conflict, so this trigger firing twice for one account is
  -- a state the function already anticipates, and a duplicate here would
  -- inflate the `occurrences` column of funnel_summary.
  --
  -- meta carries the SHAPE of the event and nothing else, per 0045.
  -- since_signup_s is zero by definition here and is included because
  -- funnel_timing only considers rows that have it.
  insert into public.funnel_events (user_id, event, meta)
  select new.id, 'signup',
         jsonb_build_object('since_signup_s', 0, 'referred', v_code is not null)
   where not exists (
     select 1 from public.funnel_events e
      where e.user_id = new.id and e.event = 'signup'
   );

  return new;
end;
$$;

-- --- The accounts that already exist -------------------------------------------
--
-- Without this the fix only helps from today, and every signup to date stays
-- missing — which is the thing actually being complained about. Dated from the
-- profile's own created_at so the report's time windows put each person in the
-- period they really arrived in, not all of them today.
--
-- Idempotent: NOT EXISTS means running this file twice adds nothing.

insert into public.funnel_events (user_id, event, meta, created_at)
select p.id,
       'signup',
       jsonb_build_object(
         'since_signup_s', 0,
         'referred', p.referral_code is not null,
         -- Marked so these are distinguishable from live events. A backfilled
         -- row is evidence of an account, not evidence of an observed action,
         -- and anyone reading this data later deserves to know the difference.
         'backfilled', true
       ),
       p.created_at
  from public.profiles p
 where not exists (
   select 1 from public.funnel_events e
    where e.user_id = p.id and e.event = 'signup'
 );

notify pgrst, 'reload schema';

-- --- Did it take? ---------------------------------------------------------------
-- Always returns one row. Sends nothing, changes nothing beyond the above.

select (select count(*) from public.profiles)                                   as profiles,
       (select count(*) from public.funnel_events where event = 'signup')        as signup_events,
       case
         when (select count(*) from public.profiles)
            = (select count(*) from public.funnel_events where event = 'signup')
           then 'OK - every account now has a signup event'
         else 'CHECK - counts differ; some profiles still have no signup event'
       end as result;
