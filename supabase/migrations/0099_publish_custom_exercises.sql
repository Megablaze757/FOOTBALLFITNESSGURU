-- =============================================================================
-- 0099: An exercise somebody added can become part of the main library.
--
-- The library has always had two tiers: EXERCISES, which is a TypeScript array
-- compiled into the app, and custom_exercises, which is a table anybody can
-- write to and only their own coach's athletes can read. Good movements kept
-- landing in the second one and staying there — visible to one squad, invisible
-- to the four hundred people who would have used it.
--
-- Promoting one cannot mean editing the array: that is a code change, a build
-- and a deploy for something an admin should be able to do in a minute. So it
-- means a flag on the row, and the app merges published rows into the
-- catalogue the same way it already merges a coach's own.
--
-- WHAT PUBLISHING MEANS FOR OWNERSHIP. A published row is the library's, not
-- the author's. Leaving it editable by whoever typed it would let one person
-- rewrite an entry every athlete sees, so the write policy stops at the
-- published flag and admins take it from there. Publishing is a one-way door
-- an admin can walk back through; the author cannot.
-- =============================================================================

alter table public.custom_exercises
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  -- The clip. A YouTube id rather than a URL: the app embeds it, and storing
  -- the eleven characters means nothing has to strip a tracking parameter or a
  -- ?t=42 off the front of an embed later.
  add column if not exists youtube_id text,
  add column if not exists difficulty text,
  add column if not exists tempo text,
  -- When the AI last drafted the detail. Not for the athlete — for the admin
  -- looking at a row and wondering whether the cues were written or generated.
  add column if not exists ai_drafted_at timestamptz;

-- Published rows are read by everybody, so the index is on the read that
-- everybody does.
create index if not exists idx_custom_exercises_published
  on public.custom_exercises (published) where published;

-- --- who can see it -----------------------------------------------------------

/**
 * A published exercise is public to signed-in athletes.
 *
 * Bolted onto the existing coach/athlete rule rather than replacing it: an
 * unpublished row keeps exactly the visibility it had, which is the point of a
 * review queue — nothing changes for anybody until an admin says so.
 */
drop policy if exists "custom_ex: athlete read" on public.custom_exercises;
create policy "custom_ex: athlete read" on public.custom_exercises for select to authenticated
  using (
    published
    or coach_id = auth.uid()
    or exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = custom_exercises.coach_id
        and ca.athlete_id = auth.uid()
        and ca.status = 'accepted'
    )
  );

-- --- who can change it --------------------------------------------------------

/**
 * The author owns it until it is published, and not after.
 *
 * `not published` appears in USING and in WITH CHECK, and both are load
 * bearing: USING stops them editing a row that is already live, WITH CHECK
 * stops them setting the flag themselves. Without the second one the first is
 * decoration — anybody could publish their own exercise to the whole app.
 *
 * Every existing row has published = false, so this is a no-op for everything
 * that exists today.
 */
drop policy if exists "custom_ex: coach write" on public.custom_exercises;
create policy "custom_ex: coach write" on public.custom_exercises for all to authenticated
  using (coach_id = auth.uid() and not published)
  with check (coach_id = auth.uid() and not published);

/**
 * Admins run the queue: they read every row (0095 already grants the select)
 * and they are the only ones who can publish, edit a published entry, or take
 * one back down.
 */
drop policy if exists "custom_ex: admin write" on public.custom_exercises;
create policy "custom_ex: admin write" on public.custom_exercises for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
