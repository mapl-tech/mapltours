-- 030 — Stop anonymous visitors enumerating the site's administrators
--
-- Idempotent, safe to re-run.
--
-- `public.is_admin(uuid)` is SECURITY DEFINER and, like every Postgres
-- function by default, was EXECUTE-granted to PUBLIC. That default reaches
-- the `anon` role, and PostgREST exposes every executable function as an RPC
-- endpoint, so the function was a free oracle at
-- POST /rest/v1/rpc/is_admin {"uid": "<any user id>"}.
--
-- Demonstrated against production on 2026-09-09, using only the public anon
-- key and no account: read 10 ids from public.users, which the public profile
-- grant allows on purpose, then call is_admin() on each, and both
-- administrators fall out by name. That hands an attacker the exact two
-- accounts worth phishing or credential-stuffing, which is reconnaissance
-- they should have to work for.
--
-- `authenticated` KEEPS execute, because three RLS policies evaluate this
-- function as the calling role and would otherwise stop working for real
-- admins: user_rewards INSERT, and user_tour_videos SELECT and UPDATE. No
-- application code calls it directly, so nothing else is affected. A signed-in
-- attacker can still enumerate, but only from an account that is traceable,
-- and closing that would mean rewriting three policies to avoid a helper they
-- legitimately need.

revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.is_admin(uuid) from anon;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to service_role;
