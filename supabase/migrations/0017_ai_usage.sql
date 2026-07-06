-- =============================================================================
-- 0017: AI usage metering. Caps how many LLM calls a user can make per day so
-- the coach chat can't be abused / run up the OpenRouter bill. The Worker calls
-- bump_ai_usage() (service role) before each LLM call; over the limit it falls
-- back to the free on-device engine.
-- =============================================================================

create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  count int not null default 0,
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

-- Users may see their own usage; only the service role writes (via the RPC).
drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage for select to authenticated
  using (user_id = auth.uid());

-- Atomically increment today's count and report whether still within the limit.
create or replace function public.bump_ai_usage(p_user uuid, p_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  insert into public.ai_usage (user_id, usage_date, count)
    values (p_user, current_date, 1)
    on conflict (user_id, usage_date)
    do update set count = ai_usage.count + 1
    returning count into cur;
  return cur <= p_limit;
end;
$$;
