-- =============================================================================
-- Program progression — optional goal deadline + 4-week block number, so the
-- coach can track progress-to-target and auto-advance to the next block.
-- =============================================================================

alter table public.programs add column if not exists target_date date;
alter table public.programs add column if not exists block integer not null default 1;
