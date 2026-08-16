-- Affiliates can see their own numbers.
--
-- Everything about the affiliate programme lived behind the admin screens:
-- earnings, signups, conversion, the lot. An affiliate promoting the app had
-- literally no way to find out whether it was working except to ask the owner,
-- which does not scale past about three of them and makes the programme feel
-- like a favour rather than a business arrangement.
--
-- HOW AN AFFILIATE IS RECOGNISED, and why it is two things.
--
--   user_id  — set when they sign up and the link is made. Exact, permanent,
--              and unaffected by them later changing their email.
--   email    — the fallback, matched case-insensitively against the address on
--              their account.
--
-- The email path exists because the affiliates already in the table were
-- created before any of this and have no user_id, and some have no email
-- either — those are the ones who currently cannot reach a dashboard at all,
-- which is why the admin screen now lets an email be attached after the fact.
--
-- Matching on email alone would be enough to work and is not enough to be
-- safe on its own: an address can be changed, and whoever holds it next would
-- inherit somebody's commission. So the first time an affiliate loads their
-- dashboard, the match is CLAIMED — user_id is written — and from then on the
-- email is irrelevant. It cannot be claimed twice; see the guard below.

alter table public.affiliates add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists affiliates_user_id_key
  on public.affiliates (user_id) where user_id is not null;

-- Case-insensitive, because nobody types their own email the same way twice.
create index if not exists affiliates_email_lower_idx
  on public.affiliates (lower(email)) where email is not null;

comment on column public.affiliates.user_id is
  'The account this affiliate signs in with. Claimed on first dashboard load by matching email, then authoritative - see 0087.';

-- ---------------------------------------------------------------------------
-- Read-only access to your own row.
--
-- The existing policy is admin-only and stays exactly as it is: an affiliate
-- must not be able to change their own commission rate, their parent, or
-- whether they are active. This adds SELECT and nothing else.
-- ---------------------------------------------------------------------------
drop policy if exists "affiliates: read own" on public.affiliates;
create policy "affiliates: read own" on public.affiliates for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and email is not null
        and lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')))
  );

-- ---------------------------------------------------------------------------
-- Claim the row, once.
--
-- SECURITY DEFINER because it writes a column the caller has no update rights
-- on — deliberately, since that same column is next to the commission rate.
--
-- The `user_id is null` in the WHERE is the whole guard: a row already claimed
-- by somebody else cannot be taken over by putting their email on your account,
-- and the unique index means one account cannot hold two affiliate rows.
-- ---------------------------------------------------------------------------
create or replace function public.claim_affiliate()
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  claimed uuid;
  caller_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
begin
  if auth.uid() is null or caller_email = '' then
    return null;
  end if;

  -- Already linked: nothing to do, and say which row so the caller can carry on.
  select id into claimed from public.affiliates where user_id = auth.uid() limit 1;
  if claimed is not null then
    return claimed;
  end if;

  update public.affiliates
     set user_id = auth.uid()
   where user_id is null
     and email is not null
     and lower(email) = caller_email
  returning id into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_affiliate() from public, anon;
grant execute on function public.claim_affiliate() to authenticated;

-- ---------------------------------------------------------------------------
-- The caller's OWN numbers.
--
-- Deliberately a separate function from affiliate_earnings() rather than a
-- filter on it. That one is admin-facing and returns every affiliate; adding a
-- "just mine" mode to it would mean one function whose output depends on who is
-- asking, and the day somebody widens it for an admin feature is the day it
-- starts leaking. Two functions, two audiences, no shared blast radius.
--
-- Money is in pennies, as everywhere else in this schema.
-- ---------------------------------------------------------------------------
drop function if exists public.my_affiliate_stats();
create function public.my_affiliate_stats()
returns table (
  code text,
  name text,
  active boolean,
  rate_pct numeric,
  created_at timestamptz,
  referred_signups int,
  paying_clients int,
  waitlist int,
  pending_pennies int,
  approved_pennies int,
  paid_pennies int,
  reversed_pennies int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.code, a.name, a.active, a.rate_pct, a.created_at,
         (select count(*)::int from public.profiles pr where pr.referral_code = a.code),
         (select count(*)::int from public.profiles pr
            join public.subscriptions s on s.user_id = pr.id
           where pr.referral_code = a.code and s.status = 'active'
             and s.stripe_subscription_id is not null),
         -- `source`, not `referral_code`. The waitlist records where somebody
         -- came from in a free-text column (0032) and there is no second one;
         -- affiliate_stats() in 0033 counts it the same way, and the two must
         -- agree or the admin and the affiliate see different numbers.
         (select count(*)::int from public.waitlist w where w.source = a.code),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'pending'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'approved'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'paid'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'reversed'), 0)
    from public.affiliates a
   -- The same two-way match as the RLS policy above, and it has to stay in step
   -- with it: a dashboard that shows numbers for a row the athlete cannot read
   -- is a leak, and one that reads a row it shows no numbers for is a blank page.
   where a.user_id = auth.uid()
      or (a.user_id is null and a.email is not null
          and lower(a.email) = lower(coalesce((auth.jwt() ->> 'email'), '')));
$$;

revoke all on function public.my_affiliate_stats() from public, anon;
grant execute on function public.my_affiliate_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Who sent each paying customer, without saying who they are.
--
-- An affiliate asking "where did this month's money come from" is a fair
-- question, and answering it with names and email addresses would hand one
-- customer's identity to another. Dates and amounts only.
-- ---------------------------------------------------------------------------
-- Dropped first rather than replaced: `create or replace` cannot change a
-- function's return type, and this one's shape is the thing most likely to
-- change as the dashboard grows. 0024 records the same lesson the hard way —
-- a replay of the migration set halted on exactly that error.
drop function if exists public.my_affiliate_ledger(int);
create function public.my_affiliate_ledger(limit_n int default 50)
returns table (
  earned_on date,
  level smallint,
  amount_pennies int,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- `earned_at`, not created_at. This table has no created_at at all (0052):
  -- it carries earned_at / payable_at / paid_at / reversed_at, because when
  -- commission was earned and when it becomes payable are different dates and
  -- the 30-day clawback window lives between them.
  select c.earned_at::date, c.level, c.amount_pennies, c.status
    from public.affiliate_commissions c
    join public.affiliates a on a.id = c.affiliate_id
   where a.user_id = auth.uid()
      or (a.user_id is null and a.email is not null
          and lower(a.email) = lower(coalesce((auth.jwt() ->> 'email'), '')))
   order by c.earned_at desc
   limit greatest(1, least(coalesce(limit_n, 50), 500));
$$;

revoke all on function public.my_affiliate_ledger(int) from public, anon;
grant execute on function public.my_affiliate_ledger(int) to authenticated;
