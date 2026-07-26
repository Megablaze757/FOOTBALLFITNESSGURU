-- =============================================================================
-- 0040: In-app notifications.
--
-- A coach can assign a program (0039), but the athlete only found out by
-- happening to open the Coach page. Work assigned to you should tell you it
-- exists.
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('program_assigned', 'coach_request', 'general')),
  title text not null,
  body text,
  /** Where tapping it should take them. */
  href text,
  read_at timestamptz,
  /** Set once the daily job has emailed it, so nobody gets told twice. */
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

-- You read your own.
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- And mark them read. Nothing else about them is yours to change, but RLS is
-- row-level rather than column-level, so the honest limit is: you can only
-- touch rows addressed to you.
drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A coach may notify an athlete who has ACCEPTED them — the same gate as
-- assigning a program. Without this, notifications would be a way to send
-- unsolicited messages to any user id you could guess.
drop policy if exists "notifications: coach notify" on public.notifications;
create policy "notifications: coach notify" on public.notifications
  for insert to authenticated with check (public.is_coach_of(user_id));

-- Unsent notifications for the nightly email job. Service role only.
create or replace function public.pending_notification_emails()
returns table (id uuid, user_id uuid, title text, body text, href text)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.user_id, n.title, n.body, n.href
    from public.notifications n
   where n.emailed_at is null
     and n.read_at is null          -- already seen it in-app; don't nag by email too
     and n.created_at > now() - interval '7 days'
   order by n.created_at
   limit 200;
$$;

revoke execute on function public.pending_notification_emails() from public, anon, authenticated;
grant execute on function public.pending_notification_emails() to service_role;

notify pgrst, 'reload schema';
