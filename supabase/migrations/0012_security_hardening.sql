-- =============================================================================
-- Security hardening
--  1. Coach↔athlete CONSENT: a coach only sees an athlete's data after the
--     athlete accepts. Fixes the hole where a coach could add any email and
--     read that person's health data without permission.
--  2. Lock search_path on the remaining function.
-- =============================================================================

-- 1. Consent status on the relationship.
alter table public.coach_athletes
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'accepted', 'declined'));

-- is_coach_of now requires an ACCEPTED link — this secures every coach-read
-- policy that calls it in one place.
create or replace function public.is_coach_of(athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_athletes
    where coach_id = auth.uid() and athlete_id = athlete and status = 'accepted'
  );
$$;

-- Coaches can invite (insert, forced to 'pending') and remove (delete), but
-- CANNOT self-accept. Athletes accept/decline their own invitations.
drop policy if exists "coach_athletes: coach write" on public.coach_athletes;
drop policy if exists "coach_athletes: coach invite" on public.coach_athletes;
create policy "coach_athletes: coach invite" on public.coach_athletes for insert to authenticated
  with check (coach_id = auth.uid() and status = 'pending');
drop policy if exists "coach_athletes: coach remove" on public.coach_athletes;
create policy "coach_athletes: coach remove" on public.coach_athletes for delete to authenticated
  using (coach_id = auth.uid());
drop policy if exists "coach_athletes: athlete respond" on public.coach_athletes;
create policy "coach_athletes: athlete respond" on public.coach_athletes for update to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- add_athlete_by_email always creates a PENDING invite (SECURITY DEFINER inserts
-- bypass RLS, so set it explicitly).
create or replace function public.add_athlete_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare aid uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')) then
    raise exception 'only coaches can add athletes' using errcode = '42501';
  end if;
  select id into aid from auth.users where lower(email) = lower(p_email);
  if aid is null then raise exception 'no athlete with that email'; end if;
  if aid = auth.uid() then raise exception 'that is you'; end if;
  insert into public.coach_athletes (coach_id, athlete_id, status)
  values (auth.uid(), aid, 'pending')
  on conflict (coach_id, athlete_id) do nothing;
  return aid;
end;
$$;

-- 2. Lock search_path on the shared trigger fn (defence-in-depth).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
