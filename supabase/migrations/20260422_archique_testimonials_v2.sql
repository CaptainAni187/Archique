alter table if exists public.testimonials
  add column if not exists name text,
  add column if not exists content text,
  add column if not exists artwork_id bigint,
  add column if not exists is_featured boolean not null default false;

update public.testimonials
set
  name = coalesce(nullif(name, ''), customer_name),
  content = coalesce(nullif(content, ''), review_text);

update public.testimonials
set
  is_visible = coalesce(is_visible, true),
  is_featured = coalesce(is_featured, false)
where is_visible is null or is_featured is null;

alter table public.testimonials
  alter column name set not null,
  alter column content set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'testimonials_artwork_id_fkey'
  ) then
    alter table public.testimonials
      add constraint testimonials_artwork_id_fkey
      foreign key (artwork_id) references public.artworks(id) on delete set null;
  end if;
end $$;

create index if not exists testimonials_visible_featured_created_idx
  on public.testimonials (is_visible, is_featured, created_at desc);
