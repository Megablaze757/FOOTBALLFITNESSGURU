-- What movement the clip shows, so the analysis can run drill-specific checks
-- (follow-through on a shot, landing softness on a jump, stride symmetry on a
-- sprint) instead of only generic knee tracking.

alter table videos add column if not exists movement text default 'general';

alter table videos drop constraint if exists videos_movement_check;
alter table videos add constraint videos_movement_check
  check (movement = any (array['general', 'squat', 'landing', 'sprint', 'kick', 'lunge']));
