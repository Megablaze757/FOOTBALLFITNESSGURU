-- =============================================================================
-- 0075 — challenge completions, so the board pays what it advertises.
--
-- Every challenge card has shown "+45 XP" since the feature shipped, and
-- nothing has ever added it: `challengeXp` in lib/challenges.ts was exported
-- and never called by any page. Five cards a page, all promising XP that does
-- not arrive.
--
-- WHY THIS NEEDS A TABLE AND CANNOT JUST BE SUMMED ON THE FLY. Challenge XP is
-- not derivable from current activity, because the boards ROTATE. Today's
-- daily challenge is gone tomorrow, so a total computed from "challenges
-- currently complete" would fall at midnight — and XP going down is the exact
-- regression computeXp was fixed for (see lib/gamification.ts: missing one day
-- used to delete up to 300 XP and could drop a level, fired on the day someone
-- was already most likely to stop). A completion has to be recorded when it
-- happens or it cannot be paid for without taking it away again.
--
-- `period` is what makes the same challenge payable again in a later week
-- without being payable twice in the same one: the daily board stores the ISO
-- date, the weekly board stores its week number. The primary key does the rest.
-- =============================================================================

create table if not exists public.challenge_completions (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null,
  -- 'YYYY-MM-DD' for a daily board, 'wNNNNN' for a weekly one.
  period       text not null,
  -- NOT `window`: that is a reserved word in PostgreSQL and `window text` is a
  -- syntax error at CREATE TABLE, verified against 16.13. A migration that is
  -- pasted by hand gets exactly one chance to be right.
  board_window text not null check (board_window in ('daily', 'weekly')),
  -- Stored, not recomputed. If the pool later reprices a challenge, what was
  -- already earned must not change — an XP total that moves retroactively is
  -- the same broken promise from the other direction.
  xp           integer not null check (xp >= 0 and xp <= 500),
  completed_at timestamptz not null default now(),
  primary key (user_id, challenge_id, period)
);

create index if not exists idx_challenge_completions_user
  on public.challenge_completions (user_id);

alter table public.challenge_completions enable row level security;

-- Own rows only, and no update or delete at all: XP that can be edited by the
-- client is XP that means nothing, and there is no legitimate reason to erase
-- a completion.
drop policy if exists "own completions readable" on public.challenge_completions;
create policy "own completions readable"
  on public.challenge_completions for select
  using (auth.uid() = user_id);

drop policy if exists "own completions insertable" on public.challenge_completions;
create policy "own completions insertable"
  on public.challenge_completions for insert
  with check (auth.uid() = user_id);
