-- =============================================================================
-- 0107 — every athlete can be credited for a share.
--
-- THE LOOP ONLY COMPOUNDS IF SHARING PAYS THE SHARER SOMETHING.
--
-- Share cards carry a link now, but only an affiliate's link is attributable —
-- and almost nobody is an affiliate. Everybody else shares a plain address, so
-- nothing comes back to them, so there is no reason to do it twice. That is the
-- difference between a feature people are told to use and one that spreads.
--
-- The code is the USERNAME. It already exists on the profile, is already unique
-- and lowercase, and is already URL-safe by its own check constraint — so
-- "pocketathlete.com/?ref=sam" needs no new column, no generator and no
-- backfill. It is also a name the athlete chose, which is the one thing they
-- might actually want next to their rank.
--
-- ATTRIBUTION, NOT COMMISSION. public.affiliates remains the only source of a
-- payout: this makes a username a code that RESOLVES, so signup accepts it and
-- the admin panel can count it. Nobody is enrolled in a commission scheme by
-- picking a username, which would be a promise made on their behalf.
-- =============================================================================

/**
 * Does this code exist and is it taking referrals?
 *
 * Now answers yes for an athlete's username as well as an affiliate's code.
 * Affiliates are checked first — they are the paid path, and if a code somehow
 * matches both it must resolve to the one with money attached.
 */
create or replace function public.referral_code_valid(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.affiliates
     where lower(code) = lower(trim(p_code)) and active
  ) or exists (
    select 1 from public.profiles
     where username = lower(trim(p_code))
  )
$$;

revoke all on function public.referral_code_valid(text) from public;
grant execute on function public.referral_code_valid(text) to anon, authenticated;

/**
 * A username may not take an affiliate's code.
 *
 * Without this, anybody could pick the username of an existing affiliate and
 * every link that affiliate has ever posted becomes ambiguous — the signup
 * writes one string and nothing downstream can say which of the two it meant.
 * Cheap to prevent, ugly to unpick afterwards.
 */
create or replace function public.username_not_affiliate_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.username is not null and exists (
    select 1 from public.affiliates where lower(code) = new.username
  ) then
    raise exception 'username_taken' using hint = 'That name is already in use.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_username_not_affiliate_code on public.profiles;
create trigger trg_username_not_affiliate_code
  before insert or update of username on public.profiles
  for each row execute function public.username_not_affiliate_code();

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE AFFILIATE SCHEME IS EXACTLY AS PROFITABLE AS IT WAS.
 *
 * Every commission and payout query in this schema joins
 * profiles.referral_code = affiliates.code — 0024, 0033 and 0034 all do it. A
 * username is not in public.affiliates, so it matches nothing there: it brings
 * a signup in and creates no commission line, no payout and no liability.
 *
 * Nor can it take one from anybody. The trigger above stops a username
 * equalling an existing affiliate's code, and the validator checks affiliates
 * first, so a code that is somehow both resolves to the paid side.
 *
 * A DELIBERATE NON-ADDITION: no resolved `referred_by` column. It would be
 * tidier to join on than a string, and populating it means rewriting
 * handle_new_user() — a function this migration has no need to touch. The
 * string already tells you who sent them, the admin panel already counts it,
 * and a column nothing writes is worse than a join.
 * ═══════════════════════════════════════════════════════════════════════════
 */
