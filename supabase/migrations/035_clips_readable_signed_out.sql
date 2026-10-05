-- Guest clips: signed-out visitors can see approved clips again, and only
-- the columns a clip needs.
--
-- 1. The policy. Migration 030 revoked EXECUTE on public.is_admin from anon,
-- because the function was an admin-enumeration oracle. The policy "Admins
-- can read all tour videos" was created for PUBLIC, so Postgres evaluated
-- is_admin() for signed-out readers too and refused the whole query:
-- "permission denied for function is_admin". Every gallery read by a
-- signed-out visitor failed, the client dropped the error, and the Clips
-- sheet said "No guest clips here yet" while approved clips existed. Found
-- Oct 4 2026, when the first two approved clips (Blue Hole & Secret Falls)
-- did not appear. Scoped to authenticated, anon never evaluates the
-- function; admins are always signed in, so they still read every clip.
--
-- 2. The columns. With the gallery readable again, anon could also read
-- reviewed_by (the reviewing administrator's user id; public.users is
-- readable, so that names the administrator, the reconnaissance 030 closed)
-- and admin_notes (the reviewer's own words). anon keeps SELECT on the nine
-- columns a clip on the page needs, which is all the site asks for
-- (lib/tour-videos PUBLIC_CLIP_COLUMNS), and loses the rest. Signed-in
-- users, uploads and moderation are untouched.
--
-- Deploy the code that asks only for those columns first; this migration is
-- safe to re-run.

alter policy "Admins can read all tour videos" on public.user_tour_videos to authenticated;

revoke select on public.user_tour_videos from anon;
grant select (id, user_id, experience_id, video_path, thumbnail_path, duration_seconds, caption, status, created_at)
  on public.user_tour_videos to anon;
