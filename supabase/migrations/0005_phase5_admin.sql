-- =============================================================================
-- PHASE 5: Automation, scaling & admin — indexes, admin helpers, metrics RPC
--
-- The pg_cron schedules live separately in supabase/cron/schedule.sql because
-- they embed the project URL + a Vault secret (env-specific, not a migration).
-- =============================================================================

-- --- Performance indexes (most hot paths are already indexed in 0001–0004) ----
create index if not exists idx_subscriptions_status_tier
  on public.subscriptions (status, tier);

create index if not exists idx_check_ins_date
  on public.daily_check_ins (check_in_date);

-- -----------------------------------------------------------------------------
-- Admin helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Aggregate back-office metrics. SECURITY DEFINER so it can read across users,
-- but it refuses to run for non-admins.
create or replace function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'subscribers', jsonb_build_object(
      'silver', (select count(*) from public.subscriptions where status = 'active' and tier = 'silver'),
      'gold',   (select count(*) from public.subscriptions where status = 'active' and tier = 'gold')
    ),
    'dau', (select count(distinct user_id) from public.daily_check_ins where check_in_date = current_date),
    'check_ins_today', (select count(*) from public.daily_check_ins where check_in_date = current_date),
    'videos_processing', (select count(*) from public.videos where status = 'processing'),
    'videos_failed', (select count(*) from public.videos where status = 'failed')
  )
  into result;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin RLS — admins can read everything (permissive policies, OR'd with the
-- existing own-row policies).
-- -----------------------------------------------------------------------------
drop policy if exists "profiles: admin read all" on public.profiles;
create policy "profiles: admin read all"
  on public.profiles for select to authenticated
  using (public.is_admin());

drop policy if exists "subscriptions: admin read all" on public.subscriptions;
create policy "subscriptions: admin read all"
  on public.subscriptions for select to authenticated
  using (public.is_admin());

drop policy if exists "videos: admin read all" on public.videos;
create policy "videos: admin read all"
  on public.videos for select to authenticated
  using (public.is_admin());

drop policy if exists "check_ins: admin read all" on public.daily_check_ins;
create policy "check_ins: admin read all"
  on public.daily_check_ins for select to authenticated
  using (public.is_admin());
