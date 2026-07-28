-- =============================================================================
-- 0057: An email belongs to one referrer, permanently.
--
-- THE HOLE THIS CLOSES. Someone clicks an affiliate's link, joins the waitlist,
-- and three weeks later gets a launch email and signs up from a plain link with
-- no ?ref= on it. Today that attribution is simply gone — the code sat in
-- waitlist.source, which nothing ever reads at signup — and the affiliate who
-- actually brought them in is never paid. They will not accept "the link
-- expired" as an answer, and they will be right.
--
-- THE RULE, and it is deliberately absolute: FIRST TOUCH WINS, FOREVER. The
-- first time we see an email alongside a valid affiliate code, that pairing is
-- recorded and never changes. A later signup carrying a different code does not
-- overwrite it. Nobody can take a referral off the person who earned it — not
-- another affiliate, not the customer, and not by accident.
--
-- That is a business decision as much as a technical one, so it is worth being
-- explicit: if two affiliates both touch the same person, the EARLIER one is
-- paid. The alternative (last touch) rewards whoever shouts most recently and
-- makes attribution an argument. This makes it a fact with a timestamp.
--
-- Everything money-related keys off this table, so it is append-only from the
-- application's point of view. Corrections exist, but only through an audited
-- admin function — never by an UPDATE from a user session.
-- =============================================================================

-- --- The ledger ---------------------------------------------------------------

create table if not exists public.referral_claims (
  -- lower(trim(email)). The primary key IS the normalised email: one row per
  -- person, and the uniqueness is the guarantee rather than something we have
  -- to remember to check.
  email_key   text primary key,

  -- References affiliates(code), which is UNIQUE. `on update cascade` so
  -- renaming a code keeps every claim attached; `on delete restrict` so an
  -- affiliate with earned attribution cannot be deleted out from under it.
  code        text not null references public.affiliates(code) on update cascade on delete restrict,

  source      text not null check (source in ('waitlist', 'signup', 'admin')),
  claimed_at  timestamptz not null default now(),

  -- Set only when an admin has corrected a genuine mistake, so a changed
  -- attribution is always explainable afterwards.
  corrected_at     timestamptz,
  corrected_reason text
);

create index if not exists idx_referral_claims_code on public.referral_claims (code);

alter table public.referral_claims enable row level security;
-- No policies on purpose. Nothing with a user session touches this table
-- directly — only the security-definer functions below, and the service role.

-- --- Claiming -----------------------------------------------------------------

/**
 * Bind an email to an affiliate, if it isn't already bound.
 *
 * Returns the code that ends up owning this email — which may be an EXISTING
 * one, not the code passed in. Callers should use the return value rather than
 * assuming their code won.
 *
 * Silently ignores an unknown, inactive, or self-referring code: those are not
 * errors worth failing a signup over, they simply don't earn anybody anything.
 */
create or replace function public.claim_referral(
  p_email text,
  p_code text,
  p_source text default 'signup'
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key      text := lower(trim(coalesce(p_email, '')));
  v_code     text;
  v_existing text;
begin
  if v_key = '' then return null; end if;

  -- Already spoken for. First touch wins, so stop here and report the winner.
  select rc.code into v_existing from public.referral_claims rc where rc.email_key = v_key;
  if v_existing is not null then return v_existing; end if;

  -- Only a real, active affiliate can hold a claim. Storing an unmatched string
  -- would look like attribution while counting for nobody.
  select a.code into v_code
    from public.affiliates a
   where lower(a.code) = lower(trim(coalesce(p_code, '')))
     and a.active
   limit 1;
  if v_code is null then return null; end if;

  -- Nobody refers themselves. The commission engine blocks this too; blocking
  -- it here means the claim never exists in the first place.
  if exists (
    select 1 from public.affiliates a
     where a.code = v_code and lower(trim(coalesce(a.email, ''))) = v_key
  ) then
    return null;
  end if;

  insert into public.referral_claims (email_key, code, source)
  values (v_key, v_code, coalesce(nullif(p_source, ''), 'signup'))
  on conflict (email_key) do nothing;

  select rc.code into v_existing from public.referral_claims rc where rc.email_key = v_key;
  return v_existing;
end;
$$;

/** Who owns this email, if anyone. */
create or replace function public.referrer_for_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rc.code from public.referral_claims rc
   where rc.email_key = lower(trim(coalesce(p_email, '')));
$$;

revoke all on function public.claim_referral(text, text, text) from public;
revoke all on function public.referrer_for_email(text) from public;
-- anon needs claim_referral: the waitlist trigger runs as the anonymous visitor.
grant execute on function public.claim_referral(text, text, text) to anon, authenticated, service_role;
grant execute on function public.referrer_for_email(text) to authenticated, service_role;

-- --- Nothing rewrites a claim except an audited correction --------------------

create or replace function public.block_claim_rewrite()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'referral claims are permanent — use admin_reassign_referral() to correct one';
  end if;
  -- corrected_at is how the admin function marks a legitimate change. Anything
  -- else changing the code is the mix-up this table exists to prevent.
  if new.code is distinct from old.code and new.corrected_at is not distinct from old.corrected_at then
    raise exception 'a referral claim cannot be reassigned directly — use admin_reassign_referral()';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_claim_rewrite on public.referral_claims;
create trigger trg_block_claim_rewrite
  before update or delete on public.referral_claims
  for each row execute function public.block_claim_rewrite();

/**
 * Correct a genuine mistake. Admin only, reason required, and it leaves a
 * permanent record that it happened. Deliberately awkward: reassigning
 * attribution moves money between people, and should never be routine.
 */
create or replace function public.admin_reassign_referral(
  p_email text,
  p_code text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := lower(trim(coalesce(p_email, '')));
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required to move attribution between affiliates';
  end if;

  select a.code into v_code from public.affiliates a where lower(a.code) = lower(trim(p_code)) limit 1;
  if v_code is null then raise exception 'unknown affiliate code'; end if;

  update public.referral_claims
     set code = v_code, corrected_at = now(), corrected_reason = trim(p_reason)
   where email_key = v_key;

  -- Keep the profile in step, or the two disagree and the ledger stops being
  -- the single answer to "who brought this person in".
  update public.profiles p
     set referral_code = v_code
    from auth.users u
   where u.id = p.id and lower(u.email) = v_key;

  return found;
end;
$$;

revoke all on function public.admin_reassign_referral(text, text, text) from public, anon;
grant execute on function public.admin_reassign_referral(text, text, text) to authenticated;

-- --- The waitlist binds on the way in -----------------------------------------

alter table public.waitlist add column if not exists referral_code text;

create or replace function public.waitlist_claim_referral()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  -- `source` carried the code before this column existed, and the marketing
  -- links in the wild still populate it. Accept either.
  v_code := coalesce(nullif(trim(new.referral_code), ''), nullif(trim(new.source), ''));
  if v_code is not null then
    new.referral_code := public.claim_referral(new.email, v_code, 'waitlist');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_waitlist_claim on public.waitlist;
create trigger trg_waitlist_claim
  before insert on public.waitlist
  for each row execute function public.waitlist_claim_referral();

-- Everyone already on the list who arrived through a link. They were promised
-- to somebody before this table existed and that promise still counts.
insert into public.referral_claims (email_key, code, source, claimed_at)
select lower(trim(w.email)), a.code, 'waitlist', w.created_at
  from public.waitlist w
  join public.affiliates a on lower(a.code) = lower(trim(w.source))
 where a.active
   and lower(trim(coalesce(a.email, ''))) is distinct from lower(trim(w.email))
on conflict (email_key) do nothing;

update public.waitlist w
   set referral_code = rc.code
  from public.referral_claims rc
 where rc.email_key = lower(trim(w.email))
   and w.referral_code is null;

-- --- Signup reads the ledger, and never contradicts it ------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_live boolean;
  v_meta  text;
  v_code  text;
begin
  select coalesce(launched, false) into is_live from public.app_settings where id;

  -- A code typed at signup, or carried from a ?ref= link.
  v_meta := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');

  -- Record it — which does nothing if this email was already claimed, because
  -- first touch wins. Then read back whoever actually owns the email. Doing it
  -- in this order is what makes a waitlist referral outrank a code typed later.
  if v_meta is not null then
    perform public.claim_referral(new.email, v_meta, 'signup');
  end if;
  v_code := public.referrer_for_email(new.email);

  insert into public.profiles (id, full_name, avatar_url, beta, referral_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    not coalesce(is_live, false),
    v_code
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- --- A profile's referrer is not editable by its owner ------------------------

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role
     and not (old.role in ('athlete', 'coach') and new.role in ('athlete', 'coach')) then
    new.role := old.role;
  end if;

  new.beta := old.beta;

  -- Attribution is money. The profiles UPDATE policy lets someone edit their own
  -- row, which without this line let any signed-in user PATCH referral_code to
  -- whatever they liked — pointing their subscription at a friend's affiliate
  -- account, or off someone who had genuinely earned it.
  new.referral_code := old.referral_code;

  return new;
end;
$$;

-- --- What the admin panel reads -----------------------------------------------

/** Every claim, newest first, with whether the person has signed up yet. */
create or replace function public.referral_claim_list(p_limit int default 200)
returns table (email_key text, code text, source text, claimed_at timestamptz,
               corrected_at timestamptz, signed_up boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select rc.email_key, rc.code, rc.source, rc.claimed_at, rc.corrected_at,
         exists (select 1 from auth.users u where lower(u.email) = rc.email_key) as signed_up
    from public.referral_claims rc
   where public.is_admin()
   order by rc.claimed_at desc
   limit greatest(1, least(1000, p_limit));
$$;

revoke all on function public.referral_claim_list(int) from public, anon;
grant execute on function public.referral_claim_list(int) to authenticated;

notify pgrst, 'reload schema';
