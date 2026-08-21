-- =============================================================================
-- A weekly food budget, and the shop it is measured in.
--
-- WHY THE STORE HAS TO MOVE TOO. It has been in localStorage, which is a
-- reasonable home for a display preference and the wrong one for an input to
-- the plan. Store prices differ by a flat index per shop, so once a budget can
-- CHANGE the plan — the planner leans harder on price until the week comes in
-- under the ceiling — the same athlete on a phone set to Aldi and a laptop set
-- to Tesco would be handed two different weeks from one seed. That is exactly
-- the bug "keep it cheap was never saved" already caused once, and the fix is
-- the same: an input to the plan belongs with the athlete, not with the device.
--
-- Both are nullable and mean "not set", so nobody's plan changes when this runs.
-- =============================================================================

alter table public.profiles add column if not exists diet_weekly_budget numeric;
alter table public.profiles add column if not exists shop_store text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_diet_weekly_budget_check') then
    alter table public.profiles
      add constraint profiles_diet_weekly_budget_check
      check (diet_weekly_budget is null or (diet_weekly_budget > 0 and diet_weekly_budget <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_store_check') then
    alter table public.profiles
      add constraint profiles_shop_store_check
      check (shop_store is null or shop_store in ('tesco', 'sainsburys', 'asda', 'aldi'));
  end if;
end $$;

comment on column public.profiles.diet_weekly_budget is 'Weekly food budget in GBP. The planner leans on price until an ordinary week fits it.';
comment on column public.profiles.shop_store is 'Which supermarket prices are quoted in — an input to the plan, so it lives here and not in localStorage.';

-- New columns are invisible to PostgREST until it reloads its schema cache.
-- It polls, but a plan saved in the same minute as the migration would fail
-- with "column does not exist" on a column that does.
notify pgrst, 'reload schema';
