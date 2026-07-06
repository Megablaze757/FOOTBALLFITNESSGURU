-- =============================================================================
-- 0019: Lock down bump_ai_usage(). By default Postgres grants EXECUTE on new
-- functions to PUBLIC, which would let any authenticated user call the RPC with
-- an arbitrary p_user and inflate another athlete's daily AI counter (locking
-- them out of the coach). Only the Worker (service_role) should call it.
-- =============================================================================

revoke execute on function public.bump_ai_usage(uuid, int) from public;
revoke execute on function public.bump_ai_usage(uuid, int) from anon;
revoke execute on function public.bump_ai_usage(uuid, int) from authenticated;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;
