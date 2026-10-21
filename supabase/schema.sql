-- ============================================================================
--  Before I die: database schema for Supabase
--  Paste this whole file into  Supabase dashboard > SQL Editor > New query > Run
--  Safe to run more than once.
-- ============================================================================

-- 1. Who is the owner? Only emails listed here can add, edit or delete anything.
create table if not exists public.owners (
  email text primary key
);
alter table public.owners enable row level security;   -- no policies: nobody can read it from the browser

-- >>> CHANGE THIS to the email you will sign in with, then run the file <<<
insert into public.owners (email) values ('you@example.com') on conflict do nothing;

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_owner() to anon, authenticated;

-- 2. Tables ------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  tagline     text not null default '',
  emoji       text not null default '',
  sort_order  int  not null default 0,
  is_private  boolean not null default false,   -- private chapters are only visible to the owner
  created_at  timestamptz not null default now()
);

create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  section      text not null default 'General',
  title        text not null,
  position     int  not null default 0,
  done         boolean not null default false,
  done_at      date,
  description  text not null default '',
  place        text not null default '',
  lat          double precision,
  lng          double precision,
  rating       int check (rating between 0 and 5),
  mood         text not null default '',
  fields       jsonb not null default '[]'::jsonb,   -- [{label, value}, ...]
  tags         text[] not null default '{}',
  media_count  int  not null default 0,
  cover_url    text,
  cover_kind   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists items_category_position on public.items (category_id, position);
create index if not exists items_done on public.items (done_at) where done;

create table if not exists public.media (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  kind        text not null check (kind in ('image', 'video')),
  path        text not null,
  url         text not null,
  caption     text not null default '',
  position    int  not null default 0,
  width       int,
  height      int,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);
create index if not exists media_item_position on public.media (item_id, position);

-- 3. Row level security ------------------------------------------------------
alter table public.categories enable row level security;
alter table public.items      enable row level security;
alter table public.media      enable row level security;

drop policy if exists "categories read"  on public.categories;
drop policy if exists "categories write" on public.categories;
create policy "categories read"  on public.categories for select using (not is_private or public.is_owner());
create policy "categories write" on public.categories for all    using (public.is_owner()) with check (public.is_owner());

-- Items and media are readable only if their chapter is readable (the sub-select is itself filtered by RLS).
drop policy if exists "items read"  on public.items;
drop policy if exists "items write" on public.items;
create policy "items read"  on public.items for select using (exists (select 1 from public.categories c where c.id = items.category_id));
create policy "items write" on public.items for all    using (public.is_owner()) with check (public.is_owner());

drop policy if exists "media read"  on public.media;
drop policy if exists "media write" on public.media;
create policy "media read"  on public.media for select using (exists (select 1 from public.items i where i.id = media.item_id));
create policy "media write" on public.media for all    using (public.is_owner()) with check (public.is_owner());

-- 4. Helpers the app uses ----------------------------------------------------
create or replace view public.category_stats with (security_invoker = true) as
  select category_id, count(*)::int as total, (count(*) filter (where done))::int as done_count
  from public.items
  group by category_id;
grant select on public.category_stats to anon, authenticated;

create or replace function public.random_items(n int default 20, cat uuid default null, undone boolean default true)
returns setof public.items
language sql stable security invoker
as $$
  select * from public.items
  where (cat is null or category_id = cat) and (not undone or done = false)
  order by random()
  limit n;
$$;
grant execute on function public.random_items(int, uuid, boolean) to anon, authenticated;

grant select on public.categories, public.items, public.media to anon, authenticated;
grant insert, update, delete on public.categories, public.items, public.media to authenticated;

-- 5. Storage bucket for photos and videos ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('bucket-media', 'bucket-media', true, 52428800)       -- 50 MB per file (free plan maximum)
on conflict (id) do update set public = true;

drop policy if exists "media files read"   on storage.objects;
drop policy if exists "media files insert" on storage.objects;
drop policy if exists "media files update" on storage.objects;
drop policy if exists "media files delete" on storage.objects;
create policy "media files read"   on storage.objects for select using (bucket_id = 'bucket-media');
create policy "media files insert" on storage.objects for insert with check (bucket_id = 'bucket-media' and public.is_owner());
create policy "media files update" on storage.objects for update using (bucket_id = 'bucket-media' and public.is_owner());
create policy "media files delete" on storage.objects for delete using (bucket_id = 'bucket-media' and public.is_owner());
