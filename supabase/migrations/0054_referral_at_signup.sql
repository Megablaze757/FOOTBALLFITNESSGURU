-- =============================================================================
-- 0054: Referral attribution that actually survives signup.
--
-- THE BUG. The app called signUp(), then immediately did
--   profiles.update({ referral_code }).eq("id", newUserId)
-- from the browser. That write is subject to RLS, which requires
-- auth.uid() = id — and on an email-confirmation signup there IS no session
-- yet. So the update matched zero rows, reported no error, and the referral
-- was lost. Silently. For every user who had to confirm their email, which is
-- most of them.
--
-- An affiliate whose referrals don't register is an affiliate who stops
-- promoting, and there is nothing in the UI to tell them it happened.
--
-- THE FIX. Carry the code in the signup metadata instead, and let this trigger
-- copy it onto the profile as the row is created — server-side, before any
-- session exists, with no RLS in the way. The code is validated against
-- affiliates here too, so a typo or a made-up code is dropped rather than
-- stored and quietly never matching anything.
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
  return new;
end;
$$;

notify pgrst, 'reload schema';
