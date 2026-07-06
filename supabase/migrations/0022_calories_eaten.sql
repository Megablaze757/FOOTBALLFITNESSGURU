-- =============================================================================
-- 0022: Direct calorie logging. The nutrition page derived calories from macros,
-- but many people just want to log a calorie number. Add calories_eaten so they
-- can log intake directly (with quick +200/+500 adders) instead of tracking macros.
-- =============================================================================

alter table public.nutrition_logs
  add column if not exists calories_eaten int;
