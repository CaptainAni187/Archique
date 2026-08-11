-- Record every artwork an order contains, so a cancellation can return the
-- right pieces to the catalogue.
--
-- An order row previously stored a single product_id, the first piece in the
-- selection, so a multi-piece order had no record of the rest. product_id is
-- retained as the primary/display artwork; product_ids is authoritative.

alter table if exists public.orders
  add column if not exists product_ids jsonb not null default '[]'::jsonb;

-- Backfill historical rows with their single known artwork, so the
-- cancellation path has a consistent shape to read for every order.
update public.orders
set product_ids = to_jsonb(array[product_id])
where product_ids = '[]'::jsonb
  and product_id is not null;

comment on column public.orders.product_ids is
  'Every artwork id in this order. Authoritative for restoring stock on cancellation.';
