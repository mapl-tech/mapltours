-- 039: @mentions in tour comments (owner, Nov 15 2026).
--
-- A comment can tag any signed-up guest. The tag lives in the comment text as
-- a token, `<@uuid>` (the tagged user's id, lower case), which every comment
-- view renders as "@Name" from public.users. Nothing else identifies the
-- person: names and Instagram handles are neither unique nor verified.
--
-- One rule holds for every stored comment, whoever writes it: a token in the
-- text is a real tag, and every real tag has exactly one comment_mentions row.
-- The BEFORE trigger keeps only tokens of existing users, never the author,
-- at most 5 distinct people per comment and at most 30 tags per author per
-- hour. A token past those limits becomes the person's name as plain text
-- ("@Ana", no tag, nobody told), so the sentence still reads; a token naming
-- nobody is removed. The AFTER trigger records the kept ones. So a page can
-- never render a gold "@Name" that nobody was told about, and a forged token
-- (a user id typed by hand) is either a real tag within the limits or gone.
--
-- comment_mentions is readable only by the person tagged, who may set read_at
-- and nothing else. The email columns are written by the server (service
-- role) through claim_mention_emails(). Deleting a comment, its author or the
-- tagged user deletes the row.
--
-- notification_prefs holds the one switch the profile page and the email's
-- stop link change: mention_emails, on unless the guest turned it off.
--
-- Idempotent: safe to run twice.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  experience_id int not null,
  author_id uuid not null references public.users(id) on delete cascade,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'claimed', 'sent', 'failed', 'skipped')),
  email_attempts int not null default 0,
  email_claimed_at timestamptz,
  emailed_at timestamptz,
  email_note text,
  unique (comment_id, mentioned_user_id)
);

create index if not exists comment_mentions_recipient_idx
  on public.comment_mentions (mentioned_user_id, created_at desc);
create index if not exists comment_mentions_author_idx
  on public.comment_mentions (author_id, created_at desc);
create index if not exists comment_mentions_email_queue_idx
  on public.comment_mentions (created_at)
  where email_status in ('pending', 'failed', 'claimed');

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  mention_emails boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ── Row level security and column grants ───────────────────────────────

alter table public.comment_mentions enable row level security;

drop policy if exists "Tagged guests read their own mentions" on public.comment_mentions;
create policy "Tagged guests read their own mentions"
  on public.comment_mentions for select
  using (auth.uid() = mentioned_user_id);

drop policy if exists "Tagged guests mark their own mentions read" on public.comment_mentions;
create policy "Tagged guests mark their own mentions read"
  on public.comment_mentions for update
  using (auth.uid() = mentioned_user_id)
  with check (auth.uid() = mentioned_user_id);

-- Browsers see the mention itself, never the email bookkeeping, and may
-- change read_at only. No insert or delete grant: rows come from the trigger.
revoke all on table public.comment_mentions from anon, authenticated;
grant select (id, comment_id, experience_id, author_id, mentioned_user_id, created_at, read_at)
  on table public.comment_mentions to authenticated;
grant update (read_at) on table public.comment_mentions to authenticated;

alter table public.notification_prefs enable row level security;

drop policy if exists "Guests read their own notification settings" on public.notification_prefs;
create policy "Guests read their own notification settings"
  on public.notification_prefs for select
  using (auth.uid() = user_id);

drop policy if exists "Guests create their own notification settings" on public.notification_prefs;
create policy "Guests create their own notification settings"
  on public.notification_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Guests change their own notification settings" on public.notification_prefs;
create policy "Guests change their own notification settings"
  on public.notification_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.notification_prefs from anon, authenticated;
grant select, insert, update on table public.notification_prefs to authenticated;

-- ── The token rule, enforced on every insert ────────────────────────────

create or replace function public.comment_mentions_keep_valid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  token_re constant text := '<@([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>';
  m text[];
  raw text;
  cand uuid;
  kept uuid[] := '{}';
  recent int;
  changed boolean := false;
  handle text;
  first_name text;
  plain text;
begin
  if new.text is null or position('<@' in new.text) = 0 then
    return new;
  end if;

  select count(*) into recent
  from public.comment_mentions
  where author_id = new.user_id
    and created_at > now() - interval '1 hour';

  for m in select regexp_matches(new.text, token_re, 'g') loop
    raw := m[1];
    cand := lower(raw)::uuid;
    if cand = any(kept) then
      -- A repeat of a person already kept: keep the token, one mention row.
      if raw <> lower(raw) then
        new.text := replace(new.text, '<@' || raw || '>', '<@' || lower(raw) || '>');
        changed := true;
      end if;
      continue;
    end if;
    if cand <> new.user_id
       and cardinality(kept) < 5
       and recent + cardinality(kept) < 30
       and exists (select 1 from public.users u where u.id = cand) then
      kept := kept || cand;
      if raw <> lower(raw) then
        new.text := replace(new.text, '<@' || raw || '>', '<@' || lower(raw) || '>');
        changed := true;
      end if;
    else
      -- Not a tag: the person's byline as plain text (lib/social-handle
      -- guestLabel: a valid handle, else the first name), or nothing.
      -- No < or > from a name, so a name can never spell a new token here.
      select lower(regexp_replace(btrim(coalesce(u.social_handle, '')), '^@+', '')),
             regexp_replace(split_part(btrim(coalesce(u.name, '')), ' ', 1), '[<>]', '', 'g')
        into handle, first_name
      from public.users u where u.id = cand;
      plain := case
        when handle ~ '^[a-z0-9._]{2,30}$' then '@' || handle
        when coalesce(first_name, '') <> '' then '@' || first_name
        else ''
      end;
      new.text := replace(new.text, '<@' || raw || '>', plain);
      changed := true;
    end if;
  end loop;

  if changed then
    new.text := btrim(regexp_replace(new.text, '[ \t]{2,}', ' ', 'g'));
    if new.text = '' then
      raise exception 'comment is empty once invalid tags are removed'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.comment_mentions_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if position('<@' in new.text) = 0 then
    return null;
  end if;
  insert into public.comment_mentions (comment_id, experience_id, author_id, mentioned_user_id)
  select new.id, new.experience_id, new.user_id, t.id
  from (
    select distinct lower(x[1])::uuid as id
    from regexp_matches(
      new.text,
      '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>',
      'g'
    ) as x
  ) t
  where t.id <> new.user_id
    and exists (select 1 from public.users u where u.id = t.id)
  on conflict (comment_id, mentioned_user_id) do nothing;
  return null;
end;
$$;

drop trigger if exists comments_mentions_keep_valid on public.comments;
create trigger comments_mentions_keep_valid
  before insert on public.comments
  for each row execute function public.comment_mentions_keep_valid();

drop trigger if exists comments_mentions_record on public.comments;
create trigger comments_mentions_record
  after insert on public.comments
  for each row execute function public.comment_mentions_record();

-- Comments are not editable (there is no UPDATE policy), so the token rule
-- only needs insert. If an UPDATE policy is ever added, both triggers must
-- run on update too, or edited text could carry tags nobody was told about.

-- ── Email queue: one claim, used by the immediate send and the sweep ────

create or replace function public.claim_mention_emails(p_comment_id uuid default null, p_limit int default 50)
returns setof public.comment_mentions
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.comment_mentions m
  set email_status = 'claimed',
      email_claimed_at = now(),
      email_attempts = m.email_attempts + 1
  where m.id in (
    select q.id
    from public.comment_mentions q
    where (p_comment_id is null or q.comment_id = p_comment_id)
      and q.created_at > now() - interval '24 hours'
      -- The sweep leaves the first minute to the immediate send.
      and (p_comment_id is not null or q.created_at < now() - interval '1 minute')
      and (
        q.email_status = 'pending'
        or (q.email_status = 'failed' and q.email_attempts < 3)
        or (q.email_status = 'claimed' and q.email_claimed_at < now() - interval '10 minutes' and q.email_attempts < 3)
      )
    order by q.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  )
  returning m.*;
$$;

revoke all on function public.claim_mention_emails(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_mention_emails(uuid, int) to service_role;
revoke all on function public.comment_mentions_keep_valid() from public, anon, authenticated;
revoke all on function public.comment_mentions_record() from public, anon, authenticated;
