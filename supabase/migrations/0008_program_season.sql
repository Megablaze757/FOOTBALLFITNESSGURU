-- =============================================================================
-- Season flag on programs — athletes pick in-season (taper) vs out-of-season
-- (build) when generating a training program.
-- =============================================================================

alter table public.programs
  add column if not exists in_season boolean not null default false;
