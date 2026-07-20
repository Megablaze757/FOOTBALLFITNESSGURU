-- Pre-launch email waitlist. Anyone (signed in or not) can add their email;
-- nobody can read the list through the API. Reading is done by you in the
-- Supabase dashboard, or server-side with the service role.

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,               -- optional: where they came from (?ref=, campaign)
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

-- Anyone may add themselves. `with check (true)` on INSERT only — there is no
-- SELECT policy, so the anon/auth roles cannot read anyone's email back out.
drop policy if exists "anyone can join the waitlist" on waitlist;
create policy "anyone can join the waitlist" on waitlist
  for insert to anon, authenticated with check (true);

notify pgrst, 'reload schema';
