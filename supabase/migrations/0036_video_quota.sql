-- =============================================================================
-- 0036: Bound what video costs, and let people delete their clips.
--
-- Video ANALYSIS is free — MediaPipe runs in the athlete's browser, so there is
-- no inference bill. What costs money is Supabase storage and egress, and none
-- of it was bounded:
--   * the bucket had no file size limit, so one clip could be a gigabyte;
--   * there was no cap on how many clips a user could upload;
--   * there was no DELETE policy on public.videos at all, so RLS denied every
--     attempt — a user could not remove a clip even if they wanted to, and
--     storage could only ever grow;
--   * nothing expired, so a free account's uploads were a permanent liability.
-- =============================================================================

-- 1) Hard limits at the bucket ------------------------------------------------
-- Enforced by Supabase itself before a byte is stored, which is the only place
-- a client can't argue with. 60 MB is generous for the 30-second clip the
-- analyser actually reads.
update storage.buckets
   set file_size_limit = 60 * 1024 * 1024,
       allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
 where id = 'videos';

update storage.buckets
   set file_size_limit = 8 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'photos';

-- 2) Track size so the bill is attributable ------------------------------------
alter table public.videos add column if not exists size_bytes bigint;

-- 3) Monthly upload quota per tier ---------------------------------------------
create or replace function public.video_quota()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_tier()
    when 'gold' then 40
    when 'silver' then 15
    else 3            -- bronze: enough to see the feature, not enough to be a cost
  end;
$$;

-- Counted in the policy itself so it cannot be bypassed by calling the REST API
-- directly — a client-side check only stops honest users.
drop policy if exists "videos: insert own" on public.videos;
create policy "videos: insert own"
  on public.videos for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      select count(*) from public.videos v
       where v.user_id = auth.uid()
         and v.created_at >= date_trunc('month', now())
    ) < public.video_quota()
  );

-- 4) Let people delete their own clips ------------------------------------------
-- Absent until now, which is why nothing could ever be cleaned up.
drop policy if exists "videos: delete own" on public.videos;
create policy "videos: delete own"
  on public.videos for delete to authenticated
  using (auth.uid() = user_id);

-- 5) Retention ------------------------------------------------------------------
-- Clips are a diagnostic, not an archive. Expiry is per tier, and the storage
-- paths are returned so the Worker can delete the objects through the Storage
-- API — deleting storage.objects rows directly leaves the underlying files
-- orphaned and still billable.
create or replace function public.expired_video_paths()
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.storage_path
    from public.videos v
    left join public.subscriptions s
      on s.user_id = v.user_id and s.status = 'active'
   where v.created_at < now() - (
           case coalesce(s.tier, 'bronze')
             when 'gold' then interval '180 days'
             when 'silver' then interval '60 days'
             else interval '14 days'
           end)
   limit 500;   -- bounded so one cron run can't time out
$$;

revoke execute on function public.expired_video_paths() from public, anon, authenticated;
grant execute on function public.expired_video_paths() to service_role;

-- 6) What storage is actually costing, per user ---------------------------------
drop function if exists public.admin_storage();
create or replace function public.admin_storage()
returns table (user_id uuid, email text, tier text, clips bigint, bytes bigint)
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
  select v.user_id, u.email::text,
    coalesce(case when s.status = 'active' then s.tier else 'bronze' end, 'bronze')::text,
    count(*)::bigint,
    coalesce(sum(v.size_bytes), 0)::bigint
  from public.videos v
  join auth.users u on u.id = v.user_id
  left join public.subscriptions s on s.user_id = v.user_id
  group by v.user_id, u.email, s.status, s.tier
  order by coalesce(sum(v.size_bytes), 0) desc;
end;
$$;

revoke execute on function public.admin_storage() from public, anon;
grant execute on function public.admin_storage() to authenticated;

notify pgrst, 'reload schema';
