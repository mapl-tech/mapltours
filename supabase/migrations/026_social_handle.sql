-- 026: guest social attribution, display-only.
--
-- social_handle: an optional Instagram or TikTok handle a guest types
-- themselves; rendered as @handle on their comments and clips instead of a
-- full name in handle costume. tiktok_open_id / tiktok_username /
-- tiktok_connected_at are written only by the server-side TikTok Login Kit
-- callback (app/api/tiktok/callback) when a guest links their account.
--
-- Nothing in booking, checkout, payments or webhooks reads any of these
-- columns; they feed the comment and clip bylines only. All columns are
-- additive and nullable, so this migration cannot change the behavior of
-- any existing query that does not name them.

alter table public.users add column if not exists social_handle text;
alter table public.users add column if not exists tiktok_open_id text;
alter table public.users add column if not exists tiktok_username text;
alter table public.users add column if not exists tiktok_connected_at timestamptz;

-- One normalized shape everywhere: 2-30 chars of lowercase letters, digits,
-- dot, underscore. Covers both Instagram's and TikTok's username alphabets;
-- the app normalizes (strips @, lowercases) before writing.
alter table public.users drop constraint if exists users_social_handle_shape;
alter table public.users add constraint users_social_handle_shape
  check (social_handle is null or social_handle ~ '^[a-z0-9._]{2,30}$');

-- ── Enforce the write path ──────────────────────────────────────────────
-- The header says tiktok_* is written only by the server callback; make
-- Postgres enforce that instead of asserting it. RLS is row-level only, so
-- the browser's anon-key client (authenticated role) could otherwise update
-- its own row's tiktok_username and wear a linked badge it never earned.
-- Column-level privileges close that: browsers keep exactly the columns the
-- app reads and writes today, the service role used by the tiktok routes
-- bypasses grants, and the signup trigger is security definer.
--
-- tiktok_open_id also stays out of the SELECT grant: 004's blanket read
-- policy would otherwise let any anon-key holder enumerate it, against that
-- migration's own "public display data only" note.
revoke select, insert, update on table public.users from anon, authenticated;
grant select (id, name, avatar_url, location, created_at, social_handle, tiktok_username, tiktok_connected_at)
  on table public.users to anon, authenticated;
grant insert (id, name, avatar_url, social_handle)
  on table public.users to authenticated;
grant update (name, avatar_url, location, social_handle)
  on table public.users to authenticated;
