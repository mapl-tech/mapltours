-- 027: Google Drive archive linkage for guest clips.
--
-- drive_file_id records the Drive file created by /api/drive-sync when a
-- clip is copied into the marketing archive folder (a value prefixed
-- "sync:" is an in-flight claim; see the route). It is the idempotency
-- guard that stops a re-sync from duplicating files in Drive.
--
-- Ops only. Nothing in booking, checkout, payments or webhooks reads this
-- column, and the video-status webhook ignores UPDATEs that do not change
-- `status`, so setting it never triggers guest email.

alter table public.user_tour_videos add column if not exists drive_file_id text;

-- Make "server-written only" true rather than asserted. RLS gives users no
-- UPDATE on this table, but the INSERT policy constrains rows, not columns,
-- so a crafted client could pre-set drive_file_id at insert time and its
-- clip would silently skip the archive. Column-level privileges close
-- that: browsers keep exactly the columns the app writes today (the upload
-- insert, and the admin moderation update), the service role bypasses
-- grants, and SELECT/DELETE behavior is unchanged.
revoke insert, update on table public.user_tour_videos from anon, authenticated;
grant insert (user_id, experience_id, video_path, thumbnail_path, size_bytes, duration_seconds, content_hash, caption, status)
  on table public.user_tour_videos to authenticated;
grant update (status, admin_notes, reviewed_by, reviewed_at)
  on table public.user_tour_videos to authenticated;
