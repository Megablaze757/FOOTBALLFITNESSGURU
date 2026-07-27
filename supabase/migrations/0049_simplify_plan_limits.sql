-- =============================================================================
-- 0049: The active-program limit stops being a pricing lever.
--
-- 0048 set it to 1 for silver and 3 for gold, to manufacture a difference
-- between two paid tiers £5 apart. There is one paid plan now, so the split
-- has nothing to separate — and a cap that exists to sell an upgrade, on a £15
-- consumer app, is felt as a punishment rather than an incentive.
--
-- What's left is a guard rail: five concurrent programs is far more than anyone
-- can follow, and it exists so a runaway loop can't fill the table. Free stays
-- at zero because programs are the paid product.
-- =============================================================================

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
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  v_tier := public.tier_of(new.user_id);
  -- Any paid tier: 5. Free: none.
  v_limit := case when v_tier in ('silver', 'gold') then 5 else 0 end;

  select count(*)::int into v_count
    from public.programs p
   where p.user_id = new.user_id
     and p.status = 'active'
     and p.id <> new.id;

  if v_count >= v_limit then
    raise exception 'program_limit_reached'
      using hint = case
              when v_limit = 0 then 'Training programs are part of Pro'
              else format('You can run %s programs at once', v_limit)
            end,
            errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- programs_this_month() backed the monthly AI quota, which is gone. Dropped
-- rather than left lying around for someone to wire back up by accident.
drop function if exists public.programs_this_month(uuid);

notify pgrst, 'reload schema';
