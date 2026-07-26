-- =============================================================================
-- 0042: Athletes can play more than one position.
--
-- `position` was a single text field, but plenty of players are a full back who
-- covers at centre back, or a winger who plays up front — and their training
-- should reflect both.
--
-- `positions` is added ALONGSIDE `position` rather than replacing it. Position
-- drives the guides, the skill-drill ordering and the AI prompt in a dozen
-- places; swapping its type would mean touching all of them at once for no
-- behavioural gain. Instead `position` stays as the primary — the one used
-- wherever a single answer is needed — and `positions` holds the full list.
-- The app keeps positions[0] and position in step.
-- =============================================================================

alter table public.profiles
  add column if not exists positions text[] not null default '{}';

-- Seed the array from what's already there, so nobody has to re-enter it.
update public.profiles
   set positions = array[position]
 where position is not null and position <> '' and cardinality(positions) = 0;

notify pgrst, 'reload schema';
