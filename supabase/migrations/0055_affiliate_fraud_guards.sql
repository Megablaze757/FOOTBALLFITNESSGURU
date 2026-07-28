-- =============================================================================
-- 0055: Close three holes in the commission path.
--
-- Found by auditing before any money moved. All three are the kind that only
-- show up once you owe somebody — which is the worst time to find them.
--
-- 1. THE SELF-REFERRAL GUARD WAS DEAD CODE.
--    splitCommission() refuses to pay an affiliate for their own subscription
--    by comparing the payer against affiliates.user_id — but nothing ever set
--    that column. The admin form writes name, email and code only. So the check
--    compared against NULL every time and an affiliate could sign up with their
--    own link and take 20% off their own £20 a month, forever. That is the
--    single most common affiliate fraud and the guard was inert.
--
--    Fixed by linking on email, which is what the admin actually types: filled
--    in on insert, on update, and whenever a matching account signs up later.
--
-- 2. A NULL CHARGE ID MADE A REFUND UNCLAWABLE.
--    Reversal matched on stripe_charge_id. When an invoice carried no charge,
--    that column was null and no refund could ever find the row — so commission
--    stayed payable on money that had gone back to the customer. The invoice id
--    is always present, so reversal can match on either.
--
-- 3. PARTIAL REFUNDS REVERSED EVERYTHING.
--    charge.refunded fires for a partial refund too. Refunding £1 of £20 wiped
--    the affiliate's whole commission. Now it reduces proportionally.
-- =============================================================================

-- --- 1. Link an affiliate to their own account, by email ---------------------

create or replace function public.link_affiliate_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is not null and trim(new.email) <> '' then
    select u.id into new.user_id
      from auth.users u
     where lower(u.email) = lower(trim(new.email))
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_affiliates_link_user on public.affiliates;
create trigger trg_affiliates_link_user
  before insert or update of email on public.affiliates
  for each row execute function public.link_affiliate_user();

-- The account might be created AFTER the affiliate record, which is the normal
-- order: you set someone up as an affiliate, then they join.
create or replace function public.link_affiliate_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.affiliates
     set user_id = new.id
   where user_id is null
     and email is not null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists trg_link_affiliate_on_signup on auth.users;
create trigger trg_link_affiliate_on_signup
  after insert on auth.users
  for each row execute function public.link_affiliate_on_signup();

-- Existing rows.
update public.affiliates a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and a.email is not null
   and lower(u.email) = lower(trim(a.email));

-- --- 2 & 3. Reversal that finds the row, and respects a partial refund -------

/**
 * Reverse commission for a refunded or disputed payment.
 *
 * Matches on the charge OR the invoice, because a null charge id previously
 * made a row unreachable. `p_refunded_pennies` and `p_total_pennies` describe
 * how much of the payment came back: a full refund reverses the line, a partial
 * one scales the amount down and leaves it payable.
 *
 * Returns how many rows it touched, so the Worker can log a reversal that
 * matched nothing rather than assuming it worked.
 */
create or replace function public.reverse_commission(
  p_charge text,
  p_invoice text,
  p_reason text,
  p_refunded_pennies int default null,
  p_total_pennies int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full boolean;
  v_kept numeric;
  v_count int;
begin
  if p_charge is null and p_invoice is null then
    return 0;
  end if;

  -- Treat anything at or above the full amount — and any case where we weren't
  -- told the numbers — as a full reversal. Erring toward reversing protects the
  -- business; erring the other way pays out on money that was handed back.
  v_full := p_refunded_pennies is null
         or p_total_pennies is null
         or p_total_pennies <= 0
         or p_refunded_pennies >= p_total_pennies;

  v_kept := case when v_full then 0
                 else greatest(0, (p_total_pennies - p_refunded_pennies)::numeric / p_total_pennies)
            end;

  with hit as (
    update public.affiliate_commissions
       set amount_pennies = case when v_full then amount_pennies
                                 else floor(amount_pennies * v_kept)::int end,
           status = case when v_full then 'reversed' else status end,
           reversed_at = case when v_full then now() else reversed_at end,
           reversal_reason = case when v_full then p_reason
                                  else coalesce(reversal_reason, '') || 'partial ' || p_reason || '; ' end
     where status <> 'reversed'
       and ( (p_charge is not null and stripe_charge_id = p_charge)
          or (p_invoice is not null and stripe_invoice_id = p_invoice) )
     returning 1
  )
  select count(*)::int into v_count from hit;

  return v_count;
end;
$$;

revoke all on function public.reverse_commission(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.reverse_commission(text, text, text, int, int) to service_role;

-- --- A safety net -------------------------------------------------------------
--
-- Even with the guard above, refuse at the database to record commission for an
-- affiliate on their own subscription. The Worker checks it too; this is the
-- copy that cannot be bypassed by calling PostgREST directly.
create or replace function public.block_self_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.affiliates a
     where a.id = new.affiliate_id
       and a.user_id is not null
       and a.user_id = new.source_user_id
  ) then
    raise exception 'an affiliate cannot earn commission on their own subscription'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_self_commission on public.affiliate_commissions;
create trigger trg_block_self_commission
  before insert on public.affiliate_commissions
  for each row execute function public.block_self_commission();

notify pgrst, 'reload schema';
