-- =============================================================================
-- 0043: Web push subscriptions.
--
-- The core loop is a 60-second check-in each morning, and everything downstream
-- (readiness, streaks, XP, leaderboards) is dead if nobody opens the app. Email
-- is a weak channel for a 7am nudge; a push notification is the right one.
--
-- One row per device/browser, keyed by the push endpoint the browser gives us.
-- Someone with a phone and a laptop has two, and both should ring.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- The browser's push service URL. Unique because re-subscribing on the same
  -- device returns the same endpoint, and we want that to update the row rather
  -- than pile up duplicates that all deliver the same notification.
  endpoint    text not null unique,
  -- Keys for encrypting payloads (RFC 8291). We send payload-free pushes today,
  -- so these are unused — stored now because they're only available at
  -- subscribe time, and re-prompting every user later to collect them would be
  -- a worse outcome than two nullable columns.
  p256dh      text,
  auth        text,
  -- Set when the push service tells us the subscription is dead (404/410), so a
  -- gone device stops being retried without deleting the row mid-send.
  failed_at   timestamptz,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A subscription is as identifying as a device. Only its owner may see or
-- change it; the cron that sends reminders runs as service_role, which bypasses
-- RLS, so it needs no policy of its own.
drop policy if exists push_own_select on public.push_subscriptions;
create policy push_own_select on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_own_insert on public.push_subscriptions;
create policy push_own_insert on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_own_update on public.push_subscriptions;
create policy push_own_update on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Without this, turning notifications off in the browser would leave the row
-- behind and we'd keep pushing to a device whose owner opted out.
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Who should get a morning nudge: subscribed, not yet checked in today, and the
-- subscription hasn't been rejected by the push service.
--
-- SECURITY DEFINER so the cron can read across users, with search_path pinned so
-- the body can't be redirected by a caller's search_path.
create or replace function public.push_targets_for_reminder(for_date date)
returns table (endpoint text, sub_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select s.endpoint, s.id
    from public.push_subscriptions s
   where s.failed_at is null
     and not exists (
       select 1 from public.daily_check_ins c
        where c.user_id = s.user_id and c.check_in_date = for_date
     )
$$;

revoke all on function public.push_targets_for_reminder(date) from public, anon, authenticated;
grant execute on function public.push_targets_for_reminder(date) to service_role;

-- Mark a dead subscription so it stops being retried every morning.
create or replace function public.mark_push_failed(sub_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_subscriptions set failed_at = now() where id = any(sub_ids)
$$;

revoke all on function public.mark_push_failed(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_push_failed(uuid[]) to service_role;

notify pgrst, 'reload schema';
