-- INCOG PLOTLINE — Supabase schema and security policies
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- After creating your own account in the app, run the ADMIN BOOTSTRAP query at the bottom.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_current_user_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to anon, authenticated;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  genre text not null check (genre in ('Horror & Mystery','Love & Drama','Adventure & Fantasy')),
  opening_text text not null,
  story_text text not null,
  reference_header text,
  cover_image_url text,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  prompt text not null,
  scene_description text,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  winning_option_id uuid,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  check (closes_at is null or closes_at > opens_at)
);

create table if not exists public.story_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (label in ('A','B','C')),
  continuation_text text not null check (char_length(continuation_text) between 1 and 1000),
  position smallint not null check (position between 1 and 3),
  unique (poll_id, label),
  unique (poll_id, position),
  unique (id, poll_id)
);

alter table public.polls drop constraint if exists polls_winning_option_same_poll_fk;
alter table public.polls add constraint polls_winning_option_same_poll_fk
  foreign key (winning_option_id, id) references public.story_options(id, poll_id) deferrable initially deferred;

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint votes_one_per_user_per_poll unique (poll_id, user_id),
  constraint votes_option_belongs_to_poll foreign key (option_id, poll_id) references public.story_options(id, poll_id) on delete cascade
);

create index if not exists polls_story_id_idx on public.polls(story_id, created_at desc);
create index if not exists options_poll_idx on public.story_options(poll_id, position);
create index if not exists votes_poll_idx on public.votes(poll_id);

alter table public.admin_users enable row level security;
alter table public.stories enable row level security;
alter table public.polls enable row level security;
alter table public.story_options enable row level security;
alter table public.votes enable row level security;

-- Explicit SQL privileges plus RLS: policies below are the actual access boundary.
grant select on public.stories, public.polls, public.story_options to anon, authenticated;
grant insert, update, delete on public.stories, public.polls, public.story_options to authenticated;
grant select on public.votes to authenticated;

-- Public can read published story material. Admins can read every story.
drop policy if exists "read published stories or admin" on public.stories;
create policy "read published stories or admin" on public.stories for select to anon, authenticated
using (status in ('published','archived') or public.is_current_user_admin());
drop policy if exists "admins create stories" on public.stories;
create policy "admins create stories" on public.stories for insert to authenticated
with check (public.is_current_user_admin() and created_by = (select auth.uid()));
drop policy if exists "admins update stories" on public.stories;
create policy "admins update stories" on public.stories for update to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists "admins delete stories" on public.stories;
create policy "admins delete stories" on public.stories for delete to authenticated
using (public.is_current_user_admin());

-- Public can read polls/options attached to visible stories; only admins manage them.
drop policy if exists "read visible polls" on public.polls;
create policy "read visible polls" on public.polls for select to anon, authenticated
using (exists (select 1 from public.stories s where s.id = story_id and (s.status in ('published','archived') or public.is_current_user_admin())));
drop policy if exists "admins manage polls" on public.polls;
create policy "admins manage polls" on public.polls for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists "read visible options" on public.story_options;
create policy "read visible options" on public.story_options for select to anon, authenticated
using (exists (select 1 from public.polls p join public.stories s on s.id = p.story_id where p.id = poll_id and (s.status in ('published','archived') or public.is_current_user_admin())));
drop policy if exists "admins manage options" on public.story_options;
create policy "admins manage options" on public.story_options for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

-- Votes are never directly writable from the browser. The RPC validates each vote.
drop policy if exists "users read own votes and admins read all" on public.votes;
create policy "users read own votes and admins read all" on public.votes for select to authenticated
using (user_id = (select auth.uid()) or public.is_current_user_admin());

create or replace function public.cast_story_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_poll public.polls%rowtype;
begin
  if v_user is null then raise exception 'Sign in before voting.'; end if;
  select * into v_poll from public.polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found.'; end if;
  if v_poll.status <> 'open' then raise exception 'This poll is closed.'; end if;
  if not exists (select 1 from public.stories s where s.id = v_poll.story_id and s.status = 'published') then raise exception 'This story is not open for voting.'; end if;
  if v_poll.opens_at > now() then raise exception 'Voting has not opened yet.'; end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= now() then raise exception 'The voting deadline has passed.'; end if;
  if not exists (select 1 from public.story_options o where o.id = p_option_id and o.poll_id = p_poll_id) then raise exception 'That option does not belong to this poll.'; end if;
  insert into public.votes(poll_id, option_id, user_id) values (p_poll_id, p_option_id, v_user);
exception when unique_violation then
  raise exception 'You have already voted in this poll.';
end;
$$;
revoke all on function public.cast_story_vote(uuid, uuid) from public;
grant execute on function public.cast_story_vote(uuid, uuid) to authenticated;

create or replace function public.finalize_story_poll(p_poll_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_poll public.polls%rowtype;
  v_winner uuid;
  v_text text;
begin
  if auth.uid() is null or not public.is_current_user_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_poll from public.polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found.'; end if;
  if v_poll.status = 'closed' then raise exception 'This poll has already been finalized.'; end if;
  if (select count(*) from public.story_options where poll_id = p_poll_id) <> 3 then raise exception 'A poll must have exactly three options.'; end if;
  select o.id into v_winner
  from public.story_options o left join public.votes v on v.option_id = o.id and v.poll_id = p_poll_id
  where o.poll_id = p_poll_id
  group by o.id, o.position
  order by count(v.id) desc, o.position asc
  limit 1;
  select continuation_text into v_text from public.story_options where id = v_winner;
  update public.polls set status = 'closed', winning_option_id = v_winner, finalized_at = now() where id = p_poll_id;
  -- Append the poll's unfinished narrative prompt and only the winning continuation once.
  update public.stories
  set story_text = trim(trailing from coalesce(nullif(story_text,''), opening_text, '')) || E'\n\n' || trim(trailing from v_poll.prompt) || ' ' || trim(trailing from v_text) || case when right(trim(v_text),1) in ('.','!','?','”') then '' else '.' end,
      reference_header = v_text,
      updated_at = now()
  where id = v_poll.story_id;
  return v_winner;
end;
$$;
revoke all on function public.finalize_story_poll(uuid) from public;
grant execute on function public.finalize_story_poll(uuid) to authenticated;

-- Return only aggregate counts; never expose individual voter identities to the public.
create or replace function public.get_poll_results(p_poll_id uuid)
returns table(option_id uuid, vote_count bigint)
language sql stable security definer
set search_path = ''
as $$
  select o.id, count(v.id)::bigint
  from public.story_options o
  left join public.votes v on v.option_id = o.id and v.poll_id = p_poll_id
  where o.poll_id = p_poll_id
    and exists (select 1 from public.polls p join public.stories s on s.id = p.story_id where p.id = p_poll_id and (s.status in ('published','archived') or public.is_current_user_admin()))
  group by o.id, o.position
  order by o.position;
$$;
revoke all on function public.get_poll_results(uuid) from public;
grant execute on function public.get_poll_results(uuid) to anon, authenticated;

-- Storage: a public-read bucket for story cover images; only admins may upload/update/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-images', 'story-images', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "public read story images" on storage.objects;
create policy "public read story images" on storage.objects for select to anon, authenticated using (bucket_id = 'story-images');
drop policy if exists "admins upload story images" on storage.objects;
create policy "admins upload story images" on storage.objects for insert to authenticated with check (bucket_id = 'story-images' and public.is_current_user_admin());
drop policy if exists "admins update story images" on storage.objects;
create policy "admins update story images" on storage.objects for update to authenticated using (bucket_id = 'story-images' and public.is_current_user_admin()) with check (bucket_id = 'story-images' and public.is_current_user_admin());
drop policy if exists "admins delete story images" on storage.objects;
create policy "admins delete story images" on storage.objects for delete to authenticated using (bucket_id = 'story-images' and public.is_current_user_admin());

-- IMPORTANT ADMIN BOOTSTRAP:
-- 1. Sign up in Incog Plotline with the email you want to use as the owner account.
-- 2. Confirm the email if Supabase asks you to.
-- 3. Replace the email below with that exact email and run it separately in SQL Editor.
-- 4. Sign out and sign in again in the app to refresh the session.
-- Never share your password or secret/service-role key.
-- insert into public.admin_users(user_id)
-- select id from auth.users where lower(email) = lower('YOUR_OWNER_EMAIL@example.com')
-- on conflict (user_id) do nothing;
