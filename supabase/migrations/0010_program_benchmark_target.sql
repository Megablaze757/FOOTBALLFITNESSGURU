-- =============================================================================
-- Measurable goal targets — tie a program to a benchmark metric + target value
-- (e.g. 10m sprint 1.75s -> 1.65s) so progress can be tracked against real tests.
-- =============================================================================

alter table public.programs add column if not exists target_metric text;     -- e.g. 'sprint_10m'
alter table public.programs add column if not exists target_value numeric;    -- goal value
alter table public.programs add column if not exists baseline_value numeric;  -- value when the goal was set
