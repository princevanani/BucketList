-- ============================================================================
--  Before I die: add map coordinates (needed by the 3D globe)
--  Supabase dashboard > SQL Editor > New query > paste > Run.  Safe to run twice.
-- ============================================================================
alter table public.items add column if not exists lat double precision;
alter table public.items add column if not exists lng double precision;
create index if not exists items_located on public.items (lat, lng) where lat is not null;
