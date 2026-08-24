-- =============================================================================
-- 0100: Structural limits on exercises people add.
--
-- WHY THE DATABASE AND NOT THE FORM. The form screens submissions
-- (lib/exercise-moderation.ts) and that is worth doing — somebody typing
-- something they shouldn't is told immediately rather than having it land in
-- front of their squad. But it is advisory and nothing more: the publishable
-- key is public by design, so anybody can post straight to PostgREST and never
-- load the form at all. Whatever must hold has to hold here.
--
-- WHAT IS ENFORCED HERE IS SHAPE, NOT TASTE. A regex for bad language in SQL
-- would be the same list maintained in two languages, drifting apart, and it
-- would be the weakest half of the protection anyway — the review queue is what
-- stands between anything and the whole app, and a person reads every field
-- before it goes live. So the database enforces the things a person cannot
-- catch by reading: a name that is a name, fields that cannot be used as a
-- storage bucket, and a ceiling on how fast one account can fill the queue.
--
-- Nothing here touches existing rows: the trigger is BEFORE INSERT OR UPDATE
-- and every check is on the values being written.
-- =============================================================================

/**
 * The limits, in one place.
 *
 * NAME_MAX and DESCRIPTION_MAX are mirrored in lib/exercise-moderation.ts so
 * the form can say "80 characters" before the save rather than after it. If one
 * moves, move the other — the app is allowed to be stricter than this and never
 * looser, because looser means an error the athlete cannot act on.
 */
create or replace function public.custom_exercise_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  -- A rolling day, not a calendar one. Midnight resets are a rate limit you can
  -- wait out; this one you cannot.
  window_start constant timestamptz := now() - interval '24 hours';
  daily_cap constant int := 30;
begin
  -- --- a name has to be a name ---
  new.name := btrim(new.name);

  if length(new.name) < 3 then
    raise exception 'Give the exercise a name of at least three characters.';
  end if;
  if length(new.name) > 80 then
    raise exception 'Exercise names stop at 80 characters.';
  end if;
  -- Somebody pasting a paragraph into the name field makes a library row that
  -- cannot be read in a list, and it is the single most common way this field
  -- gets misused.
  if new.name ~ '[\n\r]' then
    raise exception 'An exercise name is one line.';
  end if;
  -- '!!!!' and '12345' are not names. At least one letter, in any alphabet.
  if new.name !~ '[[:alpha:]]' then
    raise exception 'An exercise name needs at least one letter in it.';
  end if;

  -- --- the text fields are not a storage bucket ---
  if length(coalesce(new.description, '')) > 2000 then
    raise exception 'The description stops at 2000 characters.';
  end if;
  if length(coalesce(new.why, '')) > 300 then
    raise exception 'The one-line reason stops at 300 characters.';
  end if;
  if length(coalesce(new.equipment, '')) > 100 then
    raise exception 'Equipment stops at 100 characters.';
  end if;
  if coalesce(array_length(new.cues, 1), 0) > 10 then
    raise exception 'Ten coaching cues is the limit.';
  end if;
  if coalesce(array_length(new.muscles, 1), 0) > 12 then
    raise exception 'Twelve muscles is the limit.';
  end if;
  -- An array of 10 items is capped; an array of 10 novels is not, until here.
  if length(array_to_string(coalesce(new.cues, '{}'), ' ')) > 1200 then
    raise exception 'The coaching cues are too long — keep each one to a line.';
  end if;

  /**
   * THE RATE LIMIT, and it is the reason this migration exists.
   *
   * Everything above is tidiness. This is the one that matters: without it a
   * single account can insert rows as fast as the network allows, and the cost
   * is not storage — it is that the admin review queue becomes unusable and the
   * squad of whoever did it gets a library full of noise. Thirty a day is well
   * clear of a coach building a team library in one sitting and nowhere near
   * enough to flood anything.
   *
   * INSERT only. The review panel updates rows repeatedly while an admin edits
   * a draft, and counting those would lock an admin out of their own queue.
   */
  if tg_op = 'INSERT' then
    select count(*) into recent_count
      from public.custom_exercises
      where coach_id = new.coach_id
        and created_at > window_start;

    if recent_count >= daily_cap then
      raise exception 'Too many exercises added today — the limit is % a day. Try again tomorrow.', daily_cap;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists custom_exercise_guard on public.custom_exercises;
create trigger custom_exercise_guard
  before insert or update on public.custom_exercises
  for each row execute function public.custom_exercise_guard();

-- The rate-limit count reads by owner and recency, which nothing else did.
create index if not exists idx_custom_exercises_coach_created
  on public.custom_exercises (coach_id, created_at desc);

comment on function public.custom_exercise_guard() is
  'Shape and rate limits for athlete-authored exercises. Language screening is in the app (lib/exercise-moderation.ts) and the review queue; this is what holds when somebody skips the form.';
