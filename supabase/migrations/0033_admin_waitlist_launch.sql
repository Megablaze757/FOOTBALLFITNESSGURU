-- Admin: see the waitlist, attribute waitlist signups to affiliates, and a
-- global "we've launched" switch.

-- 1) Let admins read the waitlist (anon/auth still can't — insert only).
drop policy if exists "waitlist: admin read" on waitlist;
create policy "waitlist: admin read" on waitlist
  for select to authenticated using (public.is_admin());

-- 2) Single-row app settings. `launched` flips the app out of beta.
create table if not exists app_settings (
  id boolean primary key default true,   -- enforces a single row (id = true)
  launched boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);
insert into app_settings (id, launched) values (true, false)
  on conflict (id) do nothing;

alter table app_settings enable row level security;

-- Everyone reads it (the app shows/hides the beta badge); only admins write.
drop policy if exists "app_settings: read" on app_settings;
create policy "app_settings: read" on app_settings
  for select to anon, authenticated using (true);

drop policy if exists "app_settings: admin update" on app_settings;
create policy "app_settings: admin update" on app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) affiliate_stats gains a waitlist count (waitlist rows whose source = code).
-- Return type changes, so the old function must be dropped first.
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
        and s.status = 'active' and s.tier in ('silver', 'gold')) as paid,
    (select count(*) from public.waitlist w where w.source = a.code) as waitlist
  from public.affiliates a
  order by a.created_at desc;
end;
$$;

revoke execute on function public.affiliate_stats() from public, anon;
grant execute on function public.affiliate_stats() to authenticated;

notify pgrst, 'reload schema';
