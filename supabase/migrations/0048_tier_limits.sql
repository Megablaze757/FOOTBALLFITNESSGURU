-- =============================================================================
-- 0048: Enforce the tier limits in the database.
--
-- Gold differed from Silver by a few occasional-use features, so someone
-- training five times a week got no more from it than someone training twice —
-- £20 read as £15 with extras. The fix is to price on how hard you use the
-- thing, not on a longer feature list.
--
-- Enforced here rather than only in the UI because the app writes to `programs`
-- directly through PostgREST. A hidden button is a suggestion; a trigger is a
-- rule. Mirrors LIMITS in lib/subscription.ts — keep them in step.
-- =============================================================================

create or replace function public.tier_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select s.tier from public.subscriptions s
      where s.user_id = p_user and s.status = 'active' limit 1),
    'bronze')
$$;

revoke all on function public.tier_of(uuid) from public, anon;
grant execute on function public.tier_of(uuid) to authenticated, service_role;

/**
 * How many programs may run at once. Bronze gets none — programs are the paid
 * product — silver one, gold three.
 */
create or replace function public.enforce_active_program_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier text;
  v_limit int;
  v_count int;
begin
  -- Only ever grows the count: archiving or editing an existing program is not
  -- something to police.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  v_tier := public.tier_of(new.user_id);
  v_limit := case v_tier when 'gold' then 3 when 'silver' then 1 else 0 end;

  select count(*)::int into v_count
    from public.programs p
   where p.user_id = new.user_id
     and p.status = 'active'
     and p.id <> new.id;

  if v_count >= v_limit then
    -- A coach assigning to an athlete is the same rule: the athlete's plan is
    -- what's being filled up, and their tier is what pays for it.
    raise exception 'program_limit_reached'
      using hint = format('%s allows %s active program(s)', v_tier, v_limit),
            errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists programs_limit_active on public.programs;
create trigger programs_limit_active
  before insert or update on public.programs
  for each row execute function public.enforce_active_program_limit();

-- How many AI-written programs this calendar month, so the Worker can cap
-- Silver without inventing a counter table — programs.created_at already
-- records it.
create or replace function public.programs_this_month(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.programs
   where user_id = p_user and created_at >= date_trunc('month', now())
$$;

revoke all on function public.programs_this_month(uuid) from public, anon;
grant execute on function public.programs_this_month(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
