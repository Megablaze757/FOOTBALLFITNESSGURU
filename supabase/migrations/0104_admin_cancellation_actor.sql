-- =============================================================================
-- Who cancelled it.
--
-- Cancellations were always self-serve, so cancellation_feedback.user_id was
-- both the person who left and the person who pressed the button. Admins can
-- now cancel on a customer's behalf — somebody emails and asks, and the answer
-- should not be "log in and do it yourself".
--
-- That makes those two different people, and the difference matters. A refund
-- dispute, a "I never asked you to cancel that", or simply reading the churn
-- numbers: a cancellation an admin performed is not the same event as one the
-- customer performed, and without this column they are indistinguishable
-- afterwards.
--
-- Null means self-serve, which is what every existing row is and what the
-- athlete-facing path keeps writing. Nothing backfills, because inventing an
-- actor for rows that never had one would be worse than the gap.
-- =============================================================================

alter table public.cancellation_feedback
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

comment on column public.cancellation_feedback.actor_id is
  'The admin who performed this cancellation. Null when the athlete did it themselves.';

-- Finding "everything an admin did to somebody else's billing" is the query
-- this exists to answer, so it gets an index rather than a sequential scan of
-- every cancellation the product has ever had.
create index if not exists idx_cancellation_feedback_actor
  on public.cancellation_feedback (actor_id, created_at desc)
  where actor_id is not null;

-- --- What the admin page needs to show a billing control ----------------------
--
-- admin_users() returned tier and status, which is enough to say "they are on
-- Pro and it is not being paid for" and not enough to offer a button. Three
-- more facts decide what that button says:
--
--   has_billing        Is there a Stripe subscription at all? Comped and free
--                      accounts have nothing to cancel, and offering it would
--                      produce a 404 from the Worker and a confused admin.
--   cancel_at_period_end  Already ending. The action is then "don't", not
--                      "cancel again".
--   current_period_end When they lose access, which is the first thing anybody
--                      asks after "did it work".
--
-- The return type changes, so the function is dropped and recreated. The app
-- treats all three as optional and renders nothing rather than guessing when
-- this migration has not been applied yet.

drop function if exists public.admin_users();

create function public.admin_users()
returns table (
  user_id uuid, email text, full_name text, role text, beta boolean,
  tier text, status text, referral_code text, affiliate_name text,
  created_at timestamptz, last_sign_in_at timestamptz, last_logged_on date,
  suspended_at timestamptz, comped boolean,
  has_billing boolean, cancel_at_period_end boolean, current_period_end timestamptz
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
         greatest(
           (select max(c.check_in_date) from public.daily_check_ins c where c.user_id = p.id),
           (select max(t.log_date) from public.training_logs t where t.user_id = p.id)
         ),
         p.suspended_at,
         (s.user_id is not null and s.stripe_subscription_id is null and s.status = 'active'),
         (s.stripe_subscription_id is not null),
         coalesce(s.cancel_at_period_end, false),
         s.current_period_end
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    left join public.affiliates a on lower(a.code) = lower(p.referral_code)
   order by u.created_at desc;
end;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

notify pgrst, 'reload schema';
