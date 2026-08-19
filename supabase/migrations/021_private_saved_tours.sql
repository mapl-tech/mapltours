-- MAPL TOURS — make saved tours private
-- Idempotent, safe to re-run.
--
-- `experience_likes` began life as a public like counter, so its select
-- policy was `using (true)`: any holder of the site's anon key could list
-- which tours a given user_id had liked. That row now also IS the guest's
-- saved-for-later shortlist, shown on /saved, so it has stopped being a
-- public counter and become personal.
--
-- Reads are therefore narrowed to the owner. The public "how many people
-- saved this" number moves to the experience_like_counts view, which
-- aggregates away the user_id — a count nobody can turn back into a list.
-- Insert and delete policies are unchanged: they were already own-rows-only.

-- 1. Only the owner may read their saved rows.
drop policy if exists "Anyone can read experience likes" on public.experience_likes;
drop policy if exists "Users can read their own saved tours" on public.experience_likes;

create policy "Users can read their own saved tours"
  on public.experience_likes for select
  using (auth.uid() = user_id);

-- 2. The public count, with no user_id in the output.
--
-- Left as a non-security_invoker view on purpose: it must see every row to
-- count them, which is exactly what the policy above now forbids the caller
-- from doing directly. Grouping strips the user_id, so the view exposes the
-- aggregate and nothing that identifies who saved what.
create or replace view public.experience_like_counts as
select
  experience_id,
  count(*)::int as like_count
from public.experience_likes
group by experience_id;

grant select on public.experience_like_counts to anon, authenticated;
