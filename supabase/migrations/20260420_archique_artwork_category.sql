-- Adds explicit category tagging for CANVAS vs SKETCH routing.
-- Safe default: existing rows become 'canvas' unless specified.

alter table if exists public.artworks
add column if not exists category text;

update public.artworks
set category = coalesce(nullif(category, ''), 'canvas')
where category is null or category = '';

alter table if exists public.artworks
alter column category set default 'canvas';

