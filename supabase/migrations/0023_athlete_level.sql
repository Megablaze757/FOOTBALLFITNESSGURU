-- =============================================================================
-- 0023: Athlete training level. Lets a user pick beginner / intermediate /
-- advanced so the exercise library defaults to movements they can actually do
-- (a ceiling — beginners don't get pistol squats and power snatches). Stored as
-- the difficulty id (easy | medium | advanced). Defaults to advanced (show all).
-- =============================================================================

alter table public.profiles
  add column if not exists level text not null default 'advanced';
