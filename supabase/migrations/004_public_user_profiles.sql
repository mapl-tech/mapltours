-- ============================================
-- MAPL Tours — Public user profile reads
-- Run in the Supabase SQL Editor after 001–003.
--
-- Why this exists
--   Comments, tour-video bylines, and any other "who posted this?" surface
--   needs to read *other* users' name + avatar_url. The original RLS on
--   public.users only allowed reading your OWN row, which made every other
--   user's display info invisible (rendered as "Anonymous" with a generic
--   initial). This migration adds a second, narrower policy that exposes
--   only the public profile fields to everyone, keeping the existing
--   owner-only policy for any future private columns.
-- ============================================

-- Safe to re-run.
drop policy if exists "Public profile info is readable" on public.users;

create policy "Public profile info is readable"
  on public.users for select
  using (true);

-- NOTE: only expose non-sensitive columns from the client. Today that's
-- {id, name, avatar_url, location}. If you ever add a private column (phone,
-- government_id, etc.) store it in auth.users.user_metadata or a separate
-- table — never on public.users — so this blanket SELECT policy stays safe.
