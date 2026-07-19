-- More drill types, so the analysis can check what actually matters for each:
-- hip timing on a deadlift, bar path on a press, body height into a tackle.

alter table videos drop constraint if exists videos_movement_check;
alter table videos add constraint videos_movement_check
  check (movement = any (array[
    'general', 'squat', 'landing', 'sprint', 'kick', 'lunge',
    'hinge', 'press', 'tackle'
  ]));

notify pgrst, 'reload schema';
