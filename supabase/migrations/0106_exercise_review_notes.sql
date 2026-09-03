-- =============================================================================
-- 0106 — why a drafted exercise was held.
--
-- The admin queue drafts submitted exercises in bulk and validates each draft
-- against its own description (lib/exercise-draft.ts): a cue may only name
-- equipment the exercise uses and body parts its own text mentions, no
-- therapeutic or "best exercise" claims, house style on length and count.
--
-- Those reasons had nowhere to live. Without a column they exist for the length
-- of one render and are gone on reload, which makes them useless for exactly
-- the case they matter in — a queue of thirty drafted overnight and reviewed
-- the next morning.
--
-- Held drafts are still saved. "Held" means "read this one", not "this one is
-- wrong": a leg press does train the glutes, so a cue mentioning them is held
-- when the description does not name them, and it is usually fine. Deleting the
-- draft would mean paying to generate it again to find that out.
-- =============================================================================

alter table public.custom_exercises
  add column if not exists review_notes text;

comment on column public.custom_exercises.review_notes is
  'Why the AI draft was held, from draftProblems(). Null = nothing flagged. '
  'Not a rejection — a reading list for the reviewer.';

-- Held rows are the ones a reviewer opens first, and they are a small fraction
-- of the table. A partial index keeps that lookup cheap without carrying every
-- clean row in it.
create index if not exists idx_custom_exercises_held
  on public.custom_exercises (created_at desc)
  where review_notes is not null;
