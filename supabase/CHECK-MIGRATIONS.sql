-- =============================================================================
-- WHICH MIGRATIONS ARE ACTUALLY APPLIED?
--
-- Paste this whole thing into the Supabase SQL editor and run it. It writes
-- nothing and reads no user data — it only asks the catalogue which tables,
-- columns and functions exist. Every row comes back either OK or MISSING.
--
-- Why this exists: several features fail SILENTLY when their migration has not
-- been run. Challenge XP is swallowed and the page renders normally, achievement
-- rarity reports zero, the admin dashboard shows blanks. Nothing errors, so
-- there is no way to tell "nobody has earned this yet" from "the table is not
-- there" by looking at the app.
-- =============================================================================

with checks(migration, feature, ok) as (
  values
    ('0074', 'achievement_unlocks table (badge rarity)',
      to_regclass('public.achievement_unlocks') is not null),
    ('0074', 'achievement_rarity() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'achievement_rarity')),

    ('0075', 'challenge_completions table (CHALLENGE XP)',
      to_regclass('public.challenge_completions') is not null),

    ('0076', 'waitlist.unsub_token column',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'waitlist' and column_name = 'unsub_token')),
    ('0076', 'unsubscribe_waitlist() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'unsubscribe_waitlist')),

    ('0077', 'affiliate_stats() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'affiliate_stats')),

    ('0078', 'handle_new_user() records the signup event',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_new_user'
                and pg_get_functiondef(p.oid) ilike '%funnel_events%')),

    ('0079', 'funnel_summary() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'funnel_summary')),

    ('0080', 'admin_costs() function (profit / cost dashboard)',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'admin_costs')),
    ('0080', 'admin_user_breakdown() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'admin_user_breakdown')),

    ('0081', 'ladder_standing() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'ladder_standing')),

    ('0082', 'ladder_standing_log table (Elite / Apex badges)',
      to_regclass('public.ladder_standing_log') is not null),
    ('0082', 'record_ladder_standing() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'record_ladder_standing')),
    ('0082', 'ladder_tier_days() function',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'ladder_tier_days'))
)
select
  migration,
  case when ok then 'OK' else '>>> MISSING — paste this migration' end as status,
  feature
from checks
order by migration, feature;
