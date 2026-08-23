-- Admins stop being able to read anybody's bodyweight.
--
-- 0095 granted `is_admin()` a blanket select on body_logs so an internal screen
-- could answer "my weight is wrong". The screen is gone (components/admin/
-- DataLogs.tsx) and this is the other half: a removed component with the grant
-- left in place is a privacy fix in appearance only — the rows are still one
-- PostgREST call away from any admin session, and nothing in the app would
-- notice if something started reading them again.
--
-- What survives: an athlete still reads and writes their own rows, and a coach
-- still reads the athletes they actually coach. Both predate 0095 and are the
-- relationships bodyweight is FOR. See 0011_body_and_coaching.sql.
--
-- daily_check_ins is deliberately untouched. Its admin visibility is not from
-- 0095 and it carries the support surface (soreness, sleep, load) that the
-- weight column merely sat next to; narrowing that is a separate decision with
-- separate consequences, and rolling it into a privacy fix nobody asked for
-- would be the same mistake in the other direction.

drop policy if exists "body logs: admin read" on public.body_logs;
