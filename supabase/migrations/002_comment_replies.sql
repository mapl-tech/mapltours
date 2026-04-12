-- Add reply support to comments
-- parent_id references another comment (null = top-level comment)
alter table public.comments
  add column parent_id uuid references public.comments(id) on delete cascade;

-- Index for fast reply lookups
create index idx_comments_parent_id on public.comments(parent_id);
