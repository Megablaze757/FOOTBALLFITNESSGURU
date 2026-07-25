-- =============================================================================
-- 0037: Security fixes.
--
-- 1. PRIVILEGE ESCALATION (critical). "profiles: update own" permits updating
--    any column of your own row, and `role` is one of them. The profile form
--    only offers athlete/coach, but that is a restriction in the UI, not in the
--    database — anyone with their own anon-key session could send:
--
--      PATCH /rest/v1/profiles?id=eq.<their-own-id>   {"role":"admin"}
--
--    is_admin() reads that column, so the result is immediate full compromise:
--    every user's email via admin_users(), the whole waitlist, affiliate
--    revenue, admin read-all on check-ins and health data, and the Worker's
--    admin-create-user endpoint to mint more admins.
--
-- 2. USER ENUMERATION. "profiles: read all (authenticated)" let any signed-in
--    account read every profile row — names, bios, sport, referral codes. A
--    free account could dump the entire user base.
-- =============================================================================

-- 1) Pin the columns a user must not be able to set on themselves --------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, for migrations and for the SQL
  -- editor — i.e. everything that is already trusted. Only requests carrying a
  -- real user session are constrained here.
  if auth.uid() is null then
    return new;
  end if;

  -- Athlete <-> coach is a legitimate self-service change; the profile form
  -- offers exactly those two. Anything else is silently pinned: 'admin' can
  -- only ever be granted server-side, and an admin cannot accidentally demote
  -- themselves by saving that form either (the dropdown has no 'admin' option,
  -- so submitting it would otherwise drop their access).
  if new.role is distinct from old.role
     and not (old.role in ('athlete', 'coach') and new.role in ('athlete', 'coach')) then
    new.role := old.role;
  end if;

  -- Beta status is decided at signup by whether the app had launched.
  new.beta := old.beta;

  -- Referral attribution is written once, just after signup, then fixed —
  -- otherwise anyone could reassign their own signup to a different affiliate,
  -- or to themselves if affiliates are ever paid commission.
  if old.referral_code is not null then
    new.referral_code := old.referral_code;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- 2) Stop every user being able to read every profile --------------------------
-- Readable by: yourself, an admin, and anyone you share a coaching relationship
-- with (in either direction, so an athlete can see their coach's name and vice
-- versa). add_athlete_by_email() is SECURITY DEFINER and so is unaffected.
drop policy if exists "profiles: read all (authenticated)" on public.profiles;
drop policy if exists "profiles: read own or related" on public.profiles;
create policy "profiles: read own or related"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_admin()
    or exists (
      select 1 from public.coach_athletes ca
       where (ca.coach_id = auth.uid() and ca.athlete_id = profiles.id)
          or (ca.athlete_id = auth.uid() and ca.coach_id = profiles.id)
    )
  );

notify pgrst, 'reload schema';
