-- Training load was one number for six sports.
--
-- sessionLoad is sRPE: minutes x intensity. That's the right model for field
-- sports and it quietly misrepresents two of the six:
--
--   RUGBY. The thing that injures a rugby player is collisions, not running
--   volume. Sixty minutes of contact and sixty minutes of a shuttle session
--   score identically, so ACWR — the number the whole readiness verdict now
--   leans on — understates a contact week exactly when it matters most.
--
--   RUNNING. Runners think, plan and get injured in distance. "Forty minutes"
--   is not how anyone describes their week, and a 10k at threshold and a 10k
--   jog are not the same session at the same RPE.
--
-- Both are additive: existing rows keep working, sessionLoad falls back to what
-- it always did when these are null, and the unit stays arbitrary-units so
-- historical ratios remain comparable.

alter table public.training_logs add column if not exists distance_km numeric(6,2);
alter table public.training_logs add column if not exists contact_minutes integer;

-- Nonsense values would silently distort ACWR rather than failing loudly.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_logs_distance_km_check') then
    alter table public.training_logs
      add constraint training_logs_distance_km_check
      check (distance_km is null or (distance_km >= 0 and distance_km <= 500));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_logs_contact_minutes_check') then
    alter table public.training_logs
      add constraint training_logs_contact_minutes_check
      check (contact_minutes is null or (contact_minutes >= 0 and contact_minutes <= 400));
  end if;
end $$;

comment on column public.training_logs.distance_km is
  'Distance covered. Runners plan in distance, not minutes — surfaced as their headline weekly figure.';
comment on column public.training_logs.contact_minutes is
  'Minutes of contact work (rugby). Weighted above running minutes in sessionLoad because collisions cost more than the clock says.';
