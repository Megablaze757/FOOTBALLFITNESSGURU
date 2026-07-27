-- =============================================================================
-- 0052: Affiliate commission — hierarchy, rates and a ledger.
--
-- 0024 tracked WHO referred whom. This adds what they're owed for it.
--
-- The shape of the scheme is a deliberate legal choice as much as a technical
-- one. Commission accrues only when a real customer's payment SUCCEEDS, is a
-- percentage of what actually landed after Stripe's fee, and is clawed back if
-- that payment is refunded or charged back. Nobody is ever paid for recruiting
-- an affiliate, for a signup, or for a free trial.
--
-- That matters: under the Consumer Protection from Unfair Trading Regulations
-- 2008 a scheme whose rewards come mainly from recruitment rather than sales to
-- consumers is a pyramid scheme and a criminal offence. Paying strictly on
-- collected revenue is what makes this an affiliate programme instead. Depth is
-- capped at two levels for the same reason — the UK Trading Schemes Act 1996
-- governs multi-level arrangements and the obligations grow with the chain.
-- =============================================================================

-- --- Hierarchy and rates -----------------------------------------------------

alter table public.affiliates
  add column if not exists parent_id uuid references public.affiliates(id) on delete set null,
  -- Their level-1 rate. NULL uses the scheme default (see lib/affiliate.ts).
  add column if not exists rate_pct numeric(5,2),
  add column if not exists active boolean not null default true,
  -- Set when the affiliate also has an app account, so self-referral can be
  -- detected. Optional: plenty of affiliates are not users.
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists payout_details text;

-- A rate outside 0–100 is always a mistake, and an expensive one.
alter table public.affiliates drop constraint if exists affiliates_rate_sane;
alter table public.affiliates
  add constraint affiliates_rate_sane check (rate_pct is null or (rate_pct >= 0 and rate_pct <= 100));

-- Nobody is their own recruiter.
alter table public.affiliates drop constraint if exists affiliates_no_self_parent;
alter table public.affiliates
  add constraint affiliates_no_self_parent check (parent_id is null or parent_id <> id);

create index if not exists idx_affiliates_parent on public.affiliates(parent_id);

-- --- The ledger --------------------------------------------------------------

create table if not exists public.affiliate_commissions (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  -- Who paid. Kept for support ("why am I owed this?") and for clawback.
  source_user_id uuid references public.profiles(id) on delete set null,

  -- The Stripe invoice this came from. UNIQUE with the affiliate and level, so
  -- a webhook delivered twice — which Stripe does, by design — cannot pay
  -- anyone twice for the same payment.
  stripe_invoice_id text not null,
  stripe_charge_id  text,

  level    smallint not null check (level between 1 and 2),
  rate_pct numeric(5,2) not null check (rate_pct >= 0 and rate_pct <= 100),

  -- Everything in pennies, as integers. Money in floating point loses a penny
  -- and then the ledger stops reconciling.
  gross_pennies int not null check (gross_pennies >= 0),  -- what the customer was charged
  fee_pennies   int not null default 0 check (fee_pennies >= 0), -- what Stripe kept
  net_pennies   int not null check (net_pennies >= 0),    -- what the rate applied to
  amount_pennies int not null check (amount_pennies >= 0),-- what the affiliate earned

  -- pending  → earned, inside the clawback window
  -- approved → past the window, safe to pay
  -- paid     → money has left
  -- reversed → the customer was refunded or charged back
  status text not null default 'pending'
    check (status in ('pending','approved','paid','reversed')),

  -- Refunds and chargebacks arrive late. Holding commission for a period before
  -- it can be paid means a reversal is a status change rather than trying to
  -- get money back off someone who has already spent it.
  earned_at   timestamptz not null default now(),
  payable_at  timestamptz not null default (now() + interval '30 days'),
  paid_at     timestamptz,
  reversed_at timestamptz,
  reversal_reason text,

  constraint affiliate_commissions_once unique (stripe_invoice_id, affiliate_id, level)
);

create index if not exists idx_commissions_affiliate on public.affiliate_commissions(affiliate_id, status);
create index if not exists idx_commissions_charge on public.affiliate_commissions(stripe_charge_id);
create index if not exists idx_commissions_payable on public.affiliate_commissions(status, payable_at);

alter table public.affiliate_commissions enable row level security;

-- Admin-only. An affiliate-facing view can come later; until then this is a
-- record of who earned what from whom, which nobody else should read.
drop policy if exists "commissions: admin all" on public.affiliate_commissions;
create policy "commissions: admin all" on public.affiliate_commissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- Reporting ---------------------------------------------------------------

-- What each affiliate has earned, is owed, and has been paid.
create or replace function public.affiliate_earnings()
returns table (
  affiliate_id uuid,
  code text,
  name text,
  parent_code text,
  rate_pct numeric,
  active boolean,
  referred_signups int,
  paying_clients int,
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
  select a.id, a.code, a.name,
         p.code,
         a.rate_pct,
         a.active,
         (select count(*)::int from public.profiles pr where pr.referral_code = a.code),
         (select count(*)::int from public.profiles pr
            join public.subscriptions s on s.user_id = pr.id
           where pr.referral_code = a.code and s.status = 'active'
             and s.stripe_subscription_id is not null),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'pending'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'approved'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'paid'), 0),
         coalesce((select sum(c.amount_pennies)::int from public.affiliate_commissions c
                    where c.affiliate_id = a.id and c.status = 'reversed'), 0)
    from public.affiliates a
    left join public.affiliates p on p.id = a.parent_id
   where public.is_admin()
   order by a.created_at
$$;

revoke all on function public.affiliate_earnings() from public, anon;
grant execute on function public.affiliate_earnings() to authenticated;

-- Move commission past its holding period so it can be paid. Called by the
-- nightly cron; safe to run repeatedly.
create or replace function public.approve_due_commissions()
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with moved as (
    update public.affiliate_commissions
       set status = 'approved'
     where status = 'pending' and payable_at <= now()
     returning 1
  )
  select count(*)::int from moved
$$;

revoke all on function public.approve_due_commissions() from public, anon, authenticated;
grant execute on function public.approve_due_commissions() to service_role;

-- Mark an affiliate's approved commission as paid, once the money has actually
-- been sent. Returns how many pennies were settled.
create or replace function public.mark_commissions_paid(p_affiliate uuid)
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with moved as (
    update public.affiliate_commissions
       set status = 'paid', paid_at = now()
     where affiliate_id = p_affiliate and status = 'approved' and public.is_admin()
     returning amount_pennies
  )
  select coalesce(sum(amount_pennies), 0)::int from moved
$$;

revoke all on function public.mark_commissions_paid(uuid) from public, anon;
grant execute on function public.mark_commissions_paid(uuid) to authenticated;

notify pgrst, 'reload schema';
