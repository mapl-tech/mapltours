-- Guest clips: one review email a day per guest, not one per clip.
--
-- Approving or rejecting a clip used to email the guest at once, so a guest
-- whose five clips were reviewed in one sitting got five emails. The video
-- status webhook now sends nothing on a review; a nightly job
-- (app/api/clip-digest, 8 pm Jamaica time) sends each guest one email with
-- every outcome since their last one: the clips that went live, the ones that
-- could not be published, and the 5% reward if one of them unlocked it. A
-- clip approved and then rejected before the email goes out is reported once,
-- as it ended.
--
-- review_emailed_at is when the guest was last emailed about this clip's
-- review. A clip is due when it is approved or rejected and was reviewed after
-- that (or never emailed). Reviews made before this existed were emailed one
-- by one already (the owner's two clips, Oct 4 2026), so they are marked done.
--
-- claim_clip_reviews marks one guest's due clips in a single statement and
-- returns them, so two runs can never both email the same review. A send that
-- fails is released by the job (the stamp set back to null where it is still
-- the one it set), and the next run tries again. reviewed_at comes from the
-- reviewer's browser clock, so the mark is never earlier than it: a clock a
-- few minutes fast would otherwise leave a review "after" its own email, and
-- it would be sent again the next night.
--
-- No grants to anon or authenticated: the column is read through table
-- SELECT only by signed-in users (harmless), and only the service role
-- writes it or runs the function.

alter table public.user_tour_videos add column if not exists review_emailed_at timestamptz;

update public.user_tour_videos
   set review_emailed_at = reviewed_at
 where status in ('approved', 'rejected')
   and reviewed_at is not null
   and review_emailed_at is null;

-- Dropped first so a re-run can change what it returns.
drop function if exists public.claim_clip_reviews(uuid, timestamptz);

create function public.claim_clip_reviews(p_user uuid, p_stamp timestamptz)
returns table (
  id uuid,
  experience_id integer,
  status text,
  admin_notes text,
  caption text,
  reviewed_at timestamptz,
  review_emailed_at timestamptz
)
language sql
as $$
  update public.user_tour_videos v
     set review_emailed_at = greatest(p_stamp, v.reviewed_at)
   where v.user_id = p_user
     and v.status in ('approved', 'rejected')
     and v.reviewed_at is not null
     and (v.review_emailed_at is null or v.reviewed_at > v.review_emailed_at)
  returning v.id, v.experience_id, v.status, v.admin_notes, v.caption, v.reviewed_at, v.review_emailed_at;
$$;

revoke all on function public.claim_clip_reviews(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_clip_reviews(uuid, timestamptz) to service_role;
