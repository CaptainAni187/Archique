alter table public.artworks
  drop constraint if exists artworks_price_positive;

alter table public.artworks
  add constraint artworks_price_positive check (price > 0);

alter table public.artworks
  drop constraint if exists artworks_status_check;

alter table public.artworks
  add constraint artworks_status_check check (status in ('available', 'sold'));

alter table public.orders
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists order_code text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_signature text,
  add column if not exists payment_provider text not null default 'razorpay',
  add column if not exists payment_verified_at timestamptz;

update public.orders
set order_code = concat(
  'ARC-',
  extract(year from coalesce(created_at, timezone('utc', now())))::int,
  '-',
  lpad(id::text, 4, '0')
)
where order_code is null;

alter table public.orders
  alter column order_code set not null;

alter table public.orders
  drop constraint if exists orders_total_amount_positive;

alter table public.orders
  add constraint orders_total_amount_positive check (total_amount > 0);

alter table public.orders
  drop constraint if exists orders_advance_amount_positive;

alter table public.orders
  add constraint orders_advance_amount_positive check (advance_amount > 0);

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'advance_paid', 'fully_paid', 'cancelled'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'status'
  ) then
    execute 'alter table public.orders drop constraint if exists orders_status_check';
    execute 'alter table public.orders add constraint orders_status_check check (status in (''new'', ''processing'', ''fulfilled'', ''cancelled''))';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'orders'
      and constraint_name = 'orders_product_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_product_id_fkey
      foreign key (product_id) references public.artworks(id) on delete restrict;
  end if;
end $$;

create unique index if not exists orders_order_code_key
  on public.orders(order_code);

create unique index if not exists orders_razorpay_payment_id_key
  on public.orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

create or replace function public.prevent_order_immutable_changes()
returns trigger
language plpgsql
as $$
begin
  if new.product_id is distinct from old.product_id then
    raise exception 'product_id cannot be changed after order creation';
  end if;

  if new.total_amount is distinct from old.total_amount then
    raise exception 'total_amount cannot be changed after order creation';
  end if;

  if new.advance_amount is distinct from old.advance_amount then
    raise exception 'advance_amount cannot be changed after order creation';
  end if;

  return new;
end;
$$;

drop trigger if exists lock_order_critical_fields on public.orders;

create trigger lock_order_critical_fields
before update on public.orders
for each row
execute function public.prevent_order_immutable_changes();
