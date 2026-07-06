-- =============================================================================
-- 0018: First-run onboarding flag. New athletes get a short guided setup
-- (sport → position → focus) before landing in the app. Existing users who
-- already have activity are marked onboarded so they skip it.
-- =============================================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- Anyone with any check-ins or programs has clearly already been using the app.
update public.profiles set onboarded = true
where onboarded = false
  and id in (
    select user_id from public.daily_check_ins
    union
    select user_id from public.programs
  );
