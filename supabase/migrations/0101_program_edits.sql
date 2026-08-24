-- =============================================================================
-- 0101: The athlete's own arrangement of a generated session.
--
-- WHY AN OVERLAY AND NOT AN EDIT TO THE PLAN. `programs.plan` is generated —
-- from the goal, the pain map, the block week, the equipment and any active
-- rehab protocol — and it gets REGENERATED: a new block, a rebuild after an
-- injury, a settings change. Writing a customisation back into that column
-- means every one of those regenerations silently throws the athlete's work
-- away, and nothing can tell afterwards which parts were theirs.
--
-- So this is a separate record of intent, applied on read: this drill moved
-- there, that one is out, this one is added. The generated plan stays exactly
-- as generated, "reset to the original" is deleting a key, and a drill the
-- engine stops prescribing simply stops being reordered.
--
-- Same shape and same reasoning as `swaps` (0086), and beside it rather than
-- inside it: a swap says WHAT to do instead, this says in what ORDER and
-- WHETHER. See lib/program-edit.ts, which is where the rules are tested.
--
-- Shape: { "w1d3": { order: string[], removed: string[], added: Drill[] } }
-- =============================================================================

alter table public.programs
  add column if not exists edits jsonb not null default '{}'::jsonb;

comment on column public.programs.edits is
  'Per-session customisation overlay, keyed "w<week>d<day>". Never rewrites plan. See lib/program-edit.ts.';

/**
 * A SIZE CEILING, because this column is written by the client.
 *
 * Every other guard on this table is about who may write; none is about how
 * much. `edits` is the first column here an athlete edits freely and
 * repeatedly, and `added` holds whole drill objects — so an accident (a loop, a
 * retry storm) or somebody with the publishable key writes megabytes into a row
 * that every session read then has to pull down. Sixty-four kilobytes is far
 * more than a twelve-week block of reordering can produce and far less than
 * anything that hurts.
 */
alter table public.programs drop constraint if exists programs_edits_size;
alter table public.programs add constraint programs_edits_size
  check (edits is null or pg_column_size(edits) <= 65536);

notify pgrst, 'reload schema';
