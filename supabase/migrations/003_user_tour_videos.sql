-- ============================================
-- MAPL Tours — User Tour Videos + Reward System
-- Run in the Supabase SQL Editor after 001 + 002.
--
-- What this adds
--   • user_tour_videos  — user-submitted clips tied to an experience
--   • user_rewards      — discount coupons unlocked by milestones
--   • admins            — allowlist of moderator user ids
--   • storage bucket    — "tour-videos" (public read once approved)
--   • triggers          — unlock 5%-off reward every 5 approved videos
-- ============================================

-- ─────────────────────────────────────────────
-- 1. ADMINS allowlist — a row per moderator uid
-- ─────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid references public.users(id) on delete cascade primary key,
  created_at timestamptz default now() not null
);

alter table public.admins enable row level security;

-- Anyone authenticated can check *their own* admin status (needed by client
-- to toggle the moderation UI). They cannot read anybody else's row.
create policy "Users can read their own admin row"
  on public.admins for select
  using (auth.uid() = user_id);

-- Helper function used by other RLS policies
create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable security definer
as $$
  select exists (select 1 from public.admins where user_id = uid);
$$;


-- ─────────────────────────────────────────────
-- 2. USER TOUR VIDEOS
-- ─────────────────────────────────────────────
create table if not exists public.user_tour_videos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  experience_id int not null,
  -- Storage path within the `tour-videos` bucket
  video_path text not null,
  -- Optional pre-generated poster frame
  thumbnail_path text,
  duration_seconds int,
  size_bytes bigint,
  -- File hash (sha256 hex) used to block duplicate submissions per user
  content_hash text,
  caption text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'flagged')),
  admin_notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null
);

-- One user cannot submit the exact same file twice (abuse guard).
create unique index if not exists user_tour_videos_user_hash_unique
  on public.user_tour_videos (user_id, content_hash)
  where content_hash is not null;

create index if not exists user_tour_videos_experience_status_idx
  on public.user_tour_videos (experience_id, status, created_at desc);

create index if not exists user_tour_videos_user_status_idx
  on public.user_tour_videos (user_id, status);

alter table public.user_tour_videos enable row level security;

-- Everyone can read APPROVED videos (for the public swipe gallery)
create policy "Anyone can read approved tour videos"
  on public.user_tour_videos for select
  using (status = 'approved');

-- Uploaders can read their own uploads regardless of status
create policy "Users can read their own tour videos"
  on public.user_tour_videos for select
  using (auth.uid() = user_id);

-- Admins can read everything
create policy "Admins can read all tour videos"
  on public.user_tour_videos for select
  using (public.is_admin(auth.uid()));

-- Authenticated users can submit their own pending videos
create policy "Users can submit their own tour videos"
  on public.user_tour_videos for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Only admins can change status / notes (approve / reject / flag)
create policy "Admins can moderate tour videos"
  on public.user_tour_videos for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Users can delete their own uploads while still pending
create policy "Users can delete their own pending tour videos"
  on public.user_tour_videos for delete
  using (auth.uid() = user_id and status = 'pending');


-- ─────────────────────────────────────────────
-- 3. USER REWARDS
-- ─────────────────────────────────────────────
create table if not exists public.user_rewards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  kind text not null default 'video_upload_5pct',   -- future-proof
  percent int not null default 5,
  -- The "milestone bucket" that created this reward. A user gets one reward
  -- per {5, 10, 15, ...} approved videos — never two rewards for the same
  -- milestone so (user_id, milestone) is unique.
  milestone int not null,
  code text not null,                               -- user-visible coupon code
  status text not null default 'available'
    check (status in ('available', 'used', 'expired')),
  used_on_booking_id uuid references public.bookings(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now() not null,
  unique (user_id, kind, milestone)
);

create index if not exists user_rewards_user_status_idx
  on public.user_rewards (user_id, status);

alter table public.user_rewards enable row level security;

create policy "Users can read their own rewards"
  on public.user_rewards for select
  using (auth.uid() = user_id);

-- Only the system trigger or the admin can insert — no direct client insert
create policy "Admins can insert rewards"
  on public.user_rewards for insert
  with check (public.is_admin(auth.uid()));

-- Users can mark their own reward as "used" when applying to a booking
create policy "Users can consume their own rewards"
  on public.user_rewards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 4. TRIGGER — Unlock rewards on 5/10/15… approved videos
-- ─────────────────────────────────────────────
-- Runs when a video's status changes. If the user's approved count crosses
-- a new multiple of 5, we create the corresponding reward row. The UNIQUE
-- (user_id, kind, milestone) constraint makes this idempotent.
create or replace function public.maybe_grant_video_reward()
returns trigger
language plpgsql
security definer
as $$
declare
  approved_count int;
  new_milestone  int;
  generated_code text;
begin
  -- Only react to a transition *into* approved
  if (new.status = 'approved') and (old.status is distinct from 'approved') then
    select count(*)
      into approved_count
      from public.user_tour_videos
      where user_id = new.user_id and status = 'approved';

    -- Which 5-bucket milestone did we just land on?
    new_milestone := (approved_count / 5) * 5;

    if new_milestone >= 5 then
      -- Short human-friendly code, e.g. MAPL-AB12-5
      generated_code := 'MAPL-' ||
        upper(substr(md5(random()::text || new.user_id::text), 1, 4)) ||
        '-' || new_milestone::text;

      insert into public.user_rewards
        (user_id, kind, percent, milestone, code, expires_at)
      values
        (new.user_id, 'video_upload_5pct', 5, new_milestone, generated_code,
         now() + interval '1 year')
      on conflict (user_id, kind, milestone) do nothing;
    end if;
  end if;

  -- Symmetric rollback: if an approved video is later rejected/removed, we
  -- revoke the latest unused reward bucket that is no longer backed by
  -- enough approved videos. Used rewards are never revoked.
  if (old.status = 'approved') and (new.status is distinct from 'approved') then
    select count(*)
      into approved_count
      from public.user_tour_videos
      where user_id = new.user_id and status = 'approved';

    delete from public.user_rewards
      where user_id = new.user_id
        and kind = 'video_upload_5pct'
        and status = 'available'
        and milestone > approved_count;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maybe_grant_video_reward on public.user_tour_videos;
create trigger trg_maybe_grant_video_reward
  after update on public.user_tour_videos
  for each row execute function public.maybe_grant_video_reward();


-- ─────────────────────────────────────────────
-- 5. STORAGE BUCKET
-- ─────────────────────────────────────────────
-- Public-read bucket so approved videos stream without signed URLs.
-- Uploads are gated by RLS policies below — only the owner can write to
-- `<their-uid>/*` and only approved rows are discoverable through the table.
insert into storage.buckets (id, name, public)
  values ('tour-videos', 'tour-videos', true)
  on conflict (id) do nothing;

-- NOTE: Postgres does not support `CREATE POLICY IF NOT EXISTS`, so we drop
-- first and re-create. Safe to re-run.

-- Authenticated users can upload to a path that starts with their own uid.
-- Example: "a9f3.../reel-1700000000000.mp4"
drop policy if exists "Users can upload their own tour videos" on storage.objects;
create policy "Users can upload their own tour videos"
  on storage.objects for insert
  with check (
    bucket_id = 'tour-videos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own tour videos" on storage.objects;
create policy "Users can update their own tour videos"
  on storage.objects for update
  using (
    bucket_id = 'tour-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own tour videos" on storage.objects;
create policy "Users can delete their own tour videos"
  on storage.objects for delete
  using (
    bucket_id = 'tour-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read so the <video> tag can stream without a signed URL.
drop policy if exists "Public can read tour videos" on storage.objects;
create policy "Public can read tour videos"
  on storage.objects for select
  using (bucket_id = 'tour-videos');
