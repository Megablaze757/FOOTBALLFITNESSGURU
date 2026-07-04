-- =============================================================================
-- 0014: Multi-sport support. Apex is no longer football-only — athletes pick a
-- sport (football, rugby, weightlifting, gym, basketball, running, …) which
-- tailors the exercise library and coaching copy. Stored on the profile;
-- existing rows default to 'football'. Users already update their own profile
-- via the "profiles: update own" policy, so no new policy is needed.
-- =============================================================================

alter table public.profiles
  add column if not exists sport text not null default 'football';
