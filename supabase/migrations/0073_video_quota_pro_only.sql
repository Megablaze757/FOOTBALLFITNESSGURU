-- Video analysis is a Pro feature, so free gets none of it — and `silver` is
-- Pro.
--
-- 0036 set this to gold 40 / silver 15 / bronze 3, with the comment "enough to
-- see the feature, not enough to be a cost". Two things were wrong with that.
--
-- THREE FREE CLIPS IS THE WORST OF BOTH. It teaches a free athlete that form
-- analysis exists, lets them build a habit on it, and then takes it away on the
-- fourth clip — while the paywall in front of the feature tells them they never
-- had it. A capability that is off is honest; a capability that works three
-- times is a trap. Free now gets the same answer every time, and it is the same
-- answer the paywall gives.
--
-- SILVER IS NOT A LESSER PLAN. It was the £15 middle tier for a few hours, was
-- never sold to anyone, and grants access identical to Pro everywhere else in
-- the app. Any account still holding that value was being told it had a quarter
-- of the allowance — a downgrade nobody bought and cannot leave, since the plan
-- is not for sale. It gets Pro's number because it has Pro's access.
--
-- The quota is enforced in the insert policy on public.videos (see 0036), so
-- this is the real gate; lib/subscription.ts carries a copy only so the app can
-- say "0 of 0 used" before making someone wait out a 60MB upload that RLS is
-- going to reject. A test reads the LAST definition in this directory and fails
-- if the two disagree.
create or replace function public.video_quota()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_tier()
    when 'gold' then 40
    when 'silver' then 40
    else 0            -- bronze: video analysis is Pro
  end;
$$;
