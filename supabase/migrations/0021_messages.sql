-- =============================================================================
-- 0021: Coach ↔ athlete messaging. A private thread between a coach and each of
-- their accepted athletes. Turns the squad from a dashboard into real remote
-- coaching. Visible only to the two parties, and only within an accepted
-- coaching relationship.
-- =============================================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_thread on public.messages (coach_id, athlete_id, created_at);

alter table public.messages enable row level security;

-- Either party in the thread can read it.
drop policy if exists "messages: read own thread" on public.messages;
create policy "messages: read own thread" on public.messages for select to authenticated
  using (auth.uid() = coach_id or auth.uid() = athlete_id);

-- Send only as yourself, only into a thread you're part of, and only where an
-- accepted coaching relationship exists between the two.
drop policy if exists "messages: send in own thread" on public.messages;
create policy "messages: send in own thread" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (auth.uid() = coach_id or auth.uid() = athlete_id)
    and exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = messages.coach_id
        and ca.athlete_id = messages.athlete_id
        and ca.status = 'accepted'
    )
  );
