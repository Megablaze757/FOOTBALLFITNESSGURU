-- =============================================================================
-- 0076 — announcing the launch to the waitlist, once, with a way out.
--
-- The waitlist has only ever been written to. There is no way to email it and
-- no way for anyone on it to leave, which is the wrong shape for a table you
-- are about to send bulk mail to.
--
-- THREE THINGS, and each exists because of a specific way this goes wrong:
--
--   unsubscribed_at   Every marketing email must carry a working opt-out, and
--                     it has to work WITHOUT a login — these people do not have
--                     accounts yet, which is the entire point of emailing them.
--                     So the link carries a token and the RPC below is callable
--                     by anon.
--
--   launch_emailed_at Idempotency. The alternative is a button that mails your
--                     whole list again every time it is pressed, and the first
--                     press is exactly when someone reloads because nothing
--                     appeared to happen. Stamped per row as it sends, so a
--                     re-run picks up only who is left — which also makes the
--                     send resumable when the function hits its wall clock.
--
--   unsub_token       Random per row and never derived from the email, so a
--                     link cannot be guessed for somebody else's address, and
--                     the token in the URL leaks nothing about who it belongs
--                     to.
--
-- ATTRIBUTION NEEDS NOTHING HERE. 0057 already binds a waitlist email to the
-- affiliate who brought them in, first touch wins, and `handle_new_user` reads
-- that ledger at signup — so someone Tobi put on the list signs up as Tobi's
-- referral even from a plain link with no ?ref= on it. The launch email still
-- carries ?ref= as a belt-and-braces for anyone who signs up with a DIFFERENT
-- address from the one they joined with, which the ledger cannot match.
-- =============================================================================

alter table public.waitlist add column if not exists unsubscribed_at   timestamptz;
alter table public.waitlist add column if not exists launch_emailed_at timestamptz;
alter table public.waitlist add column if not exists unsub_token       uuid not null default gen_random_uuid();

-- Backfill is implicit: the DEFAULT applies to existing rows when the column is
-- added, and each gets its own value because gen_random_uuid() is volatile.
create unique index if not exists idx_waitlist_unsub_token on public.waitlist (unsub_token);

-- The send picks rows by this predicate, on every batch.
create index if not exists idx_waitlist_pending_launch
  on public.waitlist (launch_emailed_at) where launch_emailed_at is null;

-- --- Leaving, without an account ---------------------------------------------

/**
 * Unsubscribe by token. Callable by anon on purpose: the recipient has no
 * login, and an opt-out that requires one is not an opt-out.
 *
 * Returns true when a row was actually changed, false for an unknown token, so
 * the page can tell "you're unsubscribed" from "that link is wrong" instead of
 * claiming success either way. Already-unsubscribed counts as true — pressing
 * it twice should not look like a failure.
 */
create or replace function public.unsubscribe_waitlist(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  update public.waitlist
     set unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsub_token = p_token;
  get diagnostics v_found = row_count;
  return coalesce(v_found, false);
end;
$$;

revoke execute on function public.unsubscribe_waitlist(uuid) from public;
grant execute on function public.unsubscribe_waitlist(uuid) to anon, authenticated;

-- --- What the admin screen shows before anyone presses anything ---------------

/**
 * Counts only. The admin page needs to say "this will email 412 people" BEFORE
 * the button is pressed — a bulk send whose size you learn afterwards is one
 * you cannot sanity-check.
 *
 * Deliberately returns no addresses: the admin list view already has its own
 * policy for that, and this is called just to render a number.
 */
create or replace function public.waitlist_launch_stats()
returns table (total bigint, unsubscribed bigint, emailed bigint, pending bigint)
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
  select
    count(*)::bigint,
    count(*) filter (where w.unsubscribed_at is not null)::bigint,
    count(*) filter (where w.launch_emailed_at is not null)::bigint,
    count(*) filter (where w.unsubscribed_at is null and w.launch_emailed_at is null)::bigint
  from public.waitlist w;
end;
$$;

revoke execute on function public.waitlist_launch_stats() from public, anon;
grant execute on function public.waitlist_launch_stats() to authenticated;

notify pgrst, 'reload schema';
