-- "Last seen" was the last sign-in, which says almost nothing.
--
-- A session refresh counts as a sign-in. So does opening the app, deciding
-- against it and closing it. An athlete who has not recorded anything in six
-- weeks but whose phone keeps the session alive reads as active, and the one
-- column an admin actually scans for "is this person using it" was answering a
-- different question in a convincing voice.
--
-- WHAT REPLACES IT is the last day they put something in: the later of a
-- check-in and a training log. Both count because both are the app working —
-- somebody logging sessions and skipping the morning questions is using it, and
-- so is somebody doing the reverse.
--
-- last_sign_in_at is kept in the return, because "signed up and never came
-- back" is still worth being able to see. It is just not the headline any more.
--
-- The return type gains a column, and `create or replace` cannot do that — so
-- this drops first. Nothing else calls it.

drop function if exists public.admin_users();

create function public.admin_users()
returns table (
  user_id uuid, email text, full_name text, role text, beta boolean,
  tier text, status text, referral_code text, affiliate_name text,
  created_at timestamptz, last_sign_in_at timestamptz, last_logged_on date,
  suspended_at timestamptz, comped boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.full_name, p.role,
         coalesce(p.beta, false),
         coalesce(s.tier, 'bronze')::text,
         coalesce(s.status, 'none')::text,
         p.referral_code,
         a.name,
         u.created_at,
         u.last_sign_in_at,
         -- greatest() ignores nulls and only returns null when every argument
         -- is, which is exactly the wanted behaviour for somebody who has done
         -- one of the two and not the other.
         greatest(
           (select max(c.check_in_date) from public.daily_check_ins c where c.user_id = p.id),
           (select max(t.log_date) from public.training_logs t where t.user_id = p.id)
         ),
         p.suspended_at,
         -- Comped = has access without paying Stripe. What you can revoke here.
         (s.user_id is not null and s.stripe_subscription_id is null and s.status = 'active')
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    left join public.affiliates a on lower(a.code) = lower(p.referral_code)
   order by u.created_at desc;
end;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- The two lookups above are per-row, so they want the indexes that make them a
-- seek rather than a scan. Both are `if not exists`, and both almost certainly
-- exist already for the app's own queries.
create index if not exists daily_check_ins_user_date on public.daily_check_ins (user_id, check_in_date desc);
create index if not exists training_logs_user_date on public.training_logs (user_id, log_date desc);

notify pgrst, 'reload schema';
