-- Recent Ask Coach turns, so a follow-up is a follow-up after navigation,
-- refresh or another device. The model receives only the latest 12; the table
-- is the athlete's private record and cascades with account deletion.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;

drop policy if exists "coach messages: read own" on public.coach_messages;
create policy "coach messages: read own"
  on public.coach_messages for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "coach messages: insert own" on public.coach_messages;
create policy "coach messages: insert own"
  on public.coach_messages for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "coach messages: delete own" on public.coach_messages;
create policy "coach messages: delete own"
  on public.coach_messages for delete to authenticated
  using (user_id = auth.uid());

comment on table public.coach_messages is
  'Private recent Ask Coach conversation. Sent back as bounded context for follow-up questions.';
