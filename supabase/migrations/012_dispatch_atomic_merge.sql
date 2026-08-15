-- 012 — Atomic dispatch-map merges
--
-- Every writer of bookings.dispatch previously did read-merge-write of the
-- WHOLE json map. Adversarial review traced real lost-update races between
-- them: the hourly day-of cron stamping dayof_*_sent could erase a payment
-- record written from the console in the same moment, and vice versa, and a
-- clobbered once-only claim key means a duplicate email to a guest or the
-- driver. This function makes every dispatch write an atomic jsonb merge in
-- one statement, so concurrent writers can interleave in any order without
-- losing keys.
--
--   p_patch          keys to set (jsonb object)
--   p_remove         keys to delete (text[], applied before the patch)
--   p_only_if_absent when set, the whole merge applies only if this key is
--                    not already present: an atomic once-only claim. Zero
--                    rows back means someone else holds the claim.
--
-- SAFETY: touches ONLY the dispatch column. Strictly additive; the old
-- read-merge-write callers keep working until they are migrated. Service
-- role only: execute is revoked from anon and authenticated.

create or replace function public.merge_dispatch(
  p_booking_id uuid,
  p_patch jsonb default '{}'::jsonb,
  p_remove text[] default null,
  p_only_if_absent text default null
)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  update public.bookings
     set dispatch = (coalesce(dispatch, '{}'::jsonb) - coalesce(p_remove, '{}'::text[]))
                    || coalesce(p_patch, '{}'::jsonb)
   where id = p_booking_id
     and (p_only_if_absent is null
          or not (coalesce(dispatch, '{}'::jsonb) ? p_only_if_absent))
  returning dispatch;
$$;

revoke all on function public.merge_dispatch(uuid, jsonb, text[], text) from public;
revoke all on function public.merge_dispatch(uuid, jsonb, text[], text) from anon;
revoke all on function public.merge_dispatch(uuid, jsonb, text[], text) from authenticated;
grant execute on function public.merge_dispatch(uuid, jsonb, text[], text) to service_role;
