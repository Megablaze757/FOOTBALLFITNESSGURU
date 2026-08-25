-- =============================================================================
-- 0103: Where the published Apple Health shortcut lives.
--
-- WHY IT MOVED OUT OF THE SOURCE. The link was a constant in
-- lib/apple-shortcut.ts, which meant switching the one-tap Apple setup on was a
-- code edit, a commit, a build and a deploy — for a value that can only be
-- produced by hand on an iPhone in the first place. Anyone who can build and
-- share the shortcut can paste a link into a box; nobody should need a
-- development environment to finish the job.
--
-- app_settings is already the single-row, everyone-reads / admins-write table
-- behind the launch flag (0033), which is exactly the shape this needs: the
-- link is public — it is a URL people install from — and only an admin sets it.
--
-- The constant stays as a fallback so a database without this column keeps
-- doing whatever it was doing rather than losing the feature.
-- =============================================================================

alter table public.app_settings
  add column if not exists apple_shortcut_url text;

comment on column public.app_settings.apple_shortcut_url is
  'Published iCloud link for the Apple Health shortcut. Public by design — people install from it. See lib/apple-shortcut.ts and docs/APPLE-SHORTCUT.md.';

/**
 * ONLY A REAL iCLOUD SHORTCUT LINK, ENFORCED HERE TOO.
 *
 * The app already refuses to light up the button for anything else, and that is
 * the check that matters for the athlete. This one is for the admin: a typo, a
 * shortened link or the wrong thing off the clipboard is rejected at the moment
 * of pasting, with the constraint name saying what was expected — rather than
 * being accepted, stored, and silently doing nothing until somebody notices the
 * feature never turned on.
 *
 * Null is allowed and is the normal state before it is published.
 */
alter table public.app_settings drop constraint if exists app_settings_apple_shortcut_url;
alter table public.app_settings add constraint app_settings_apple_shortcut_url
  check (
    apple_shortcut_url is null
    or apple_shortcut_url ~ '^https://(www\.)?icloud\.com/shortcuts/[0-9a-fA-F]{16,}/?$'
  );

notify pgrst, 'reload schema';
