-- Add reply support to comments
-- parent_id references another comment (null = top-level comment)
-- Idempotent — safe to re-run.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- Index for fast reply lookups
create index if not exists idx_comments_parent_id on public.comments(parent_id);
