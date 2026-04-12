-- ============================================
-- MAPL Tours Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. USERS (extends Supabase auth.users)
-- Stores profile data for authenticated users
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  name text,
  avatar_url text,
  location text,
  created_at timestamptz default now() not null
);

alter table public.users enable row level security;

create policy "Users can read their own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- Auto-create a user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. BOOKINGS
-- A completed checkout becomes a booking
create table public.bookings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  country text,
  pickup text,
  dropoff text,
  special_requests text,
  total_paid numeric(10, 2) not null,
  stripe_payment_id text,
  created_at timestamptz default now() not null
);

alter table public.bookings enable row level security;

create policy "Users can read their own bookings"
  on public.bookings for select
  using (auth.uid() = user_id);

create policy "Users can create their own bookings"
  on public.bookings for insert
  with check (auth.uid() = user_id);


-- 3. BOOKING ITEMS
-- Individual experiences within a booking
create table public.booking_items (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade not null,
  experience_id int not null,
  title text not null,
  destination text not null,
  travelers int not null default 2,
  date date not null,
  price_per_person numeric(10, 2) not null
);

alter table public.booking_items enable row level security;

create policy "Users can read their own booking items"
  on public.booking_items for select
  using (
    exists (
      select 1 from public.bookings
      where bookings.id = booking_items.booking_id
      and bookings.user_id = auth.uid()
    )
  );

create policy "Users can create their own booking items"
  on public.booking_items for insert
  with check (
    exists (
      select 1 from public.bookings
      where bookings.id = booking_items.booking_id
      and bookings.user_id = auth.uid()
    )
  );


-- 4. COMMENTS
-- User comments on experiences
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  experience_id int not null,
  user_id uuid references public.users(id) on delete cascade not null,
  text text not null,
  created_at timestamptz default now() not null
);

alter table public.comments enable row level security;

create policy "Anyone can read comments"
  on public.comments for select
  using (true);

create policy "Authenticated users can create comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own comments"
  on public.comments for delete
  using (auth.uid() = user_id);


-- 5. COMMENT LIKES
-- One like per user per comment
create table public.comment_likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  comment_id uuid references public.comments(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique (user_id, comment_id)
);

alter table public.comment_likes enable row level security;

create policy "Anyone can read comment likes"
  on public.comment_likes for select
  using (true);

create policy "Authenticated users can like comments"
  on public.comment_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike comments"
  on public.comment_likes for delete
  using (auth.uid() = user_id);


-- 6. EXPERIENCE LIKES
-- One like per user per experience
create table public.experience_likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  experience_id int not null,
  created_at timestamptz default now() not null,
  unique (user_id, experience_id)
);

alter table public.experience_likes enable row level security;

create policy "Anyone can read experience likes"
  on public.experience_likes for select
  using (true);

create policy "Authenticated users can like experiences"
  on public.experience_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike experiences"
  on public.experience_likes for delete
  using (auth.uid() = user_id);


-- 7. SAVED CREATORS
-- Users can follow/save creators
create table public.saved_creators (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  creator_handle text not null,
  created_at timestamptz default now() not null,
  unique (user_id, creator_handle)
);

alter table public.saved_creators enable row level security;

create policy "Users can read their own saved creators"
  on public.saved_creators for select
  using (auth.uid() = user_id);

create policy "Users can save creators"
  on public.saved_creators for insert
  with check (auth.uid() = user_id);

create policy "Users can unsave creators"
  on public.saved_creators for delete
  using (auth.uid() = user_id);


-- 8. USER BADGES
-- Achievement badges earned by users
create table public.user_badges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  badge_name text not null,
  earned_at timestamptz default now() not null,
  unique (user_id, badge_name)
);

alter table public.user_badges enable row level security;

create policy "Users can read their own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);

-- Badges are granted by the system, not by users directly
-- Use a service role key or database function to insert badges


-- ============================================
-- USEFUL VIEWS
-- ============================================

-- Comment with like count
create or replace view public.comments_with_likes as
select
  c.*,
  u.name as user_name,
  u.avatar_url as user_avatar,
  count(cl.id)::int as like_count
from public.comments c
left join public.users u on u.id = c.user_id
left join public.comment_likes cl on cl.comment_id = c.id
group by c.id, u.name, u.avatar_url;

-- Experience like counts
create or replace view public.experience_like_counts as
select
  experience_id,
  count(*)::int as like_count
from public.experience_likes
group by experience_id;
