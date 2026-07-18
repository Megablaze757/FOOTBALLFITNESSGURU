-- =============================================================================
-- 0024: Affiliates / referral tracking. Admins create an affiliate with a
-- unique code; that code rides in a share link (?ref=CODE), gets stashed in the
-- browser and written onto the profile at signup, so the admin panel can see
-- who brought in which clients (and how many converted to paid).
-- =============================================================================

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

-- The referral code a user signed up with (free text so signup needs no lookup).
alter table public.profiles
  add column if not exists referral_code text;

create index if not exists idx_profiles_referral_code on public.profiles (referral_code);

alter table public.affiliates enable row level security;

-- Only admins manage affiliates.
drop policy if exists "affiliates: admin all" on public.affiliates;
create policy "affiliates: admin all" on public.affiliates for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Per-affiliate signup + paid-conversion counts. SECURITY DEFINER so it can
-- aggregate across users, but refuses to run for non-admins.
create or replace function public.affiliate_stats()
returns table (code text, name text, email text, signups bigint, paid bigint)
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
        and s.status = 'active' and s.tier in ('silver', 'gold')) as paid
  from public.affiliates a
  order by a.created_at desc;
end;
$$;

revoke execute on function public.affiliate_stats() from public, anon;
grant execute on function public.affiliate_stats() to authenticated;
