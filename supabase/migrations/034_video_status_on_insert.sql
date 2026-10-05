-- Guest clips: the video_status webhook also fires when a clip is posted.
--
-- video_status is the Supabase Database Webhook that calls
-- /api/hooks/video-status. It was created in the dashboard to fire on UPDATE
-- only, so the route's INSERT branch never ran: the guest was never sent
-- "Your MAPL Tours clip is in review", and nobody was told a clip was waiting
-- in /admin/videos. Found Oct 4 2026, with no clips posted yet, so nobody
-- missed a mail.
--
-- The webhook's arguments carry the shared secret and this repository is
-- public, so the trigger is not written out here. The block reads the live
-- definition and recreates it with INSERT added; the URL, headers and timeout
-- stay exactly as they were. The drop and the create run in one transaction.
-- Running it again changes nothing, and on a database without the webhook it
-- only says so. A webhook switched off in the dashboard stays off. No error
-- path prints the definition: a failed CREATE would quote it, secret and all,
-- so the block re-raises with the error code only (the transaction rolls
-- back and the webhook is left exactly as it was).
--
-- With INSERT on, every new clip emails us and the guest (hourly caps in the
-- route). Those caps count rows, so an account that could delete its clips
-- could insert and delete in a loop and never be counted: uploaders lose the
-- delete they never used (nothing on the site deletes a clip), in the same
-- transaction that turns the emails on.
--
-- Apply by name, never through the script's default list (which re-runs old
-- booking migrations): node scripts/apply-migrations.mjs 034_video_status_on_insert.sql
-- or paste this file into the SQL editor. Then check, read-only:
--   select tgenabled, (tgtype & 4) > 0 as on_insert, (tgtype & 16) > 0 as on_update
--     from pg_trigger where tgname = 'video_status';

drop policy if exists "Users can delete their own pending tour videos" on public.user_tour_videos;
revoke delete on public.user_tour_videos from anon, authenticated;

do $$
declare
  def text;
  enabled "char";
begin
  select pg_get_triggerdef(t.oid), t.tgenabled
    into def, enabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'user_tour_videos'
     and t.tgname = 'video_status'
     and not t.tgisinternal;

  if def is null then
    raise notice 'video_status webhook not found on public.user_tour_videos, nothing to change';
    return;
  end if;

  if def like '%AFTER INSERT OR UPDATE ON public.user_tour_videos FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(%' then
    raise notice 'video_status already fires on INSERT and UPDATE';
    return;
  end if;

  -- Never echo def: its arguments hold the secret.
  if def not like 'CREATE TRIGGER video_status AFTER UPDATE ON public.user_tour_videos FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(%' then
    raise exception 'video_status does not have the expected shape; add INSERT to it in the dashboard instead';
  end if;

  begin
    execute 'drop trigger video_status on public.user_tour_videos';
    execute regexp_replace(def,
      '^CREATE TRIGGER video_status AFTER UPDATE ON ',
      'CREATE TRIGGER video_status AFTER INSERT OR UPDATE ON ');
    if enabled = 'D' then
      execute 'alter table public.user_tour_videos disable trigger video_status';
    end if;
  exception when others then
    -- Never sqlerrm or the context: both can quote the definition.
    raise exception 'could not add INSERT to video_status (SQLSTATE %); nothing changed', sqlstate;
  end;
end
$$;
