-- =============================================================================
-- 0102: Which feature tips this athlete has already been shown.
--
-- WHY ON THE PROFILE AND NOT IN localStorage. The entire promise of a tip is
-- "once". Keeping the record on the device breaks that promise the moment
-- somebody opens the app on a laptop, or reinstalls, or clears a cache — and a
-- tooltip that comes back after you dismissed it is worse than one you never
-- saw, because it reads as the app not listening. One column, one array, and
-- the promise holds wherever they sign in.
--
-- Two prefixes rather than two columns: '+id' is a tip they tapped through,
-- '-id' one they waved away. The difference is the only signal there is about
-- whether these are wanted at all — three dismissals with nothing ever acted on
-- mutes them permanently. See lib/tips.ts.
-- =============================================================================

alter table public.profiles
  add column if not exists seen_tips text[] not null default '{}';

comment on column public.profiles.seen_tips is
  'Feature tips already shown. "+id" acted on, "-id" dismissed. See lib/tips.ts.';

/**
 * A CEILING, because the client appends to this.
 *
 * There are five tips. An array that reaches fifty is a bug — a re-render loop,
 * a retry — and the failure mode without this is a row that grows unbounded and
 * is read on every page load.
 */
alter table public.profiles drop constraint if exists profiles_seen_tips_len;
alter table public.profiles add constraint profiles_seen_tips_len
  check (seen_tips is null or array_length(seen_tips, 1) is null or array_length(seen_tips, 1) <= 50);

notify pgrst, 'reload schema';
