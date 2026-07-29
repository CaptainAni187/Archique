alter table if exists public.artworks
  add column if not exists is_featured boolean not null default false;

update public.artworks
set is_featured = coalesce(is_featured, false)
where is_featured is null;
