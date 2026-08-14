-- =============================================================================
-- 0077 — a beta tester is not a customer.
--
-- `admin_set_comped` grants Pro by writing a subscriptions row with
-- status='active', tier='gold' and NO stripe_subscription_id. That is the right
-- shape — it is how the app decides what someone can use, and a comped account
-- should unlock everything a paid one does.
--
-- But two reporting functions counted "active and gold" and stopped there, so
-- every beta tester appeared as a paying customer:
--
--   admin_metrics.subscribers   the Silver/Gold tiles on the admin dashboard —
--                               and the MRR figure the page derives from them,
--                               which meant the dashboard reported revenue that
--                               does not exist.
--   affiliate_stats.paid        "how many of this affiliate's signups converted".
--
-- The discriminator already exists and is already used elsewhere: a comped row
-- has a NULL stripe_subscription_id, which is exactly how 0053 derives its own
-- `comped` flag. These two just never asked.
--
-- MONEY WAS NEVER AFFECTED. The commission ledger in 0052 already requires
-- `s.stripe_subscription_id is not null` before it pays anyone, so no affiliate
-- was ever owed commission on a comped tester. This is a reporting fix, not a
-- refund.
--
-- Comped accounts are not hidden, they are counted separately — you do want to
-- know how many are out there, just not filed under revenue.
-- =============================================================================

create or replace function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'subscribers', jsonb_build_object(
      -- Stripe-backed only. These are the numbers MRR is calculated from.
      'silver', (select count(*) from public.subscriptions
                  where status = 'active' and tier = 'silver'
                    and stripe_subscription_id is not null),
      'gold',   (select count(*) from public.subscriptions
                  where status = 'active' and tier = 'gold'
                    and stripe_subscription_id is not null),
      -- Real, useful, and deliberately outside the revenue numbers.
      'comped', (select count(*) from public.subscriptions
                  where status = 'active' and stripe_subscription_id is null)
    ),
    'dau', (select count(distinct user_id) from public.daily_check_ins where check_in_date = current_date),
    'check_ins_today', (select count(*) from public.daily_check_ins where check_in_date = current_date),
    'videos_processing', (select count(*) from public.videos where status = 'processing'),
    'videos_failed', (select count(*) from public.videos where status = 'failed')
  )
  into result;

  return result;
end;
$$;

-- --- Affiliate conversions -----------------------------------------------------
-- Same fix, same reason: an affiliate whose signups are all comped testers was
-- shown as having converted them.

drop function if exists public.affiliate_stats();
create or replace function public.affiliate_stats()
returns table (code text, name text, email text, signups bigint, paid bigint, waitlist bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select a.code, a.name, a.email,
    (select count(*) from public.profiles p where p.referral_code = a.code) as signups,
    (select count(*) from public.profiles p
       join public.subscriptions s on s.user_id = p.id
      where p.referral_code = a.code
        and s.status = 'active' and s.tier in ('silver', 'gold')
        -- The line that was missing. Matches how 0052 decides whether an
        -- affiliate is owed anything, so the panel and the ledger now agree.
        and s.stripe_subscription_id is not null) as paid,
    (select count(*) from public.waitlist w where w.source = a.code) as waitlist
  from public.affiliates a
  order by a.created_at desc;
end;
$$;

revoke execute on function public.affiliate_stats() from public, anon;
grant execute on function public.affiliate_stats() to authenticated;

notify pgrst, 'reload schema';
