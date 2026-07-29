alter table public.artworks
  add column if not exists quantity integer not null default 1;

update public.artworks
set quantity = 0
where status = 'sold'
  and quantity <> 0;

alter table public.artworks
  drop constraint if exists artworks_quantity_check;

alter table public.artworks
  add constraint artworks_quantity_check
  check (quantity >= 0);

create or replace function public.mark_artwork_sold_when_out_of_stock()
returns trigger
language plpgsql
as $$
begin
  if new.quantity <= 0 then
    new.status = 'sold';
  end if;

  return new;
end;
$$;

drop trigger if exists artworks_auto_sold_when_out_of_stock on public.artworks;

create trigger artworks_auto_sold_when_out_of_stock
before insert or update of quantity on public.artworks
for each row
execute function public.mark_artwork_sold_when_out_of_stock();
