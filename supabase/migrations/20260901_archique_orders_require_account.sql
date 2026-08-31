-- Tie each order to the account that placed it.
--
-- Checkout now requires a signed-in customer, so an order always has an
-- account behind it. Recording the account id rather than relying on the email
-- string means order history survives a customer changing their email, and
-- support can answer "show me everything this person bought" without trusting
-- a field the buyer typed at checkout.
--
-- Nullable on purpose: orders placed before this existed have no account to
-- point at, and a guest order should fail validation rather than a constraint.

alter table if exists public.orders
  add column if not exists user_id bigint references public.user_accounts(id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);

comment on column public.orders.user_id is
  'Account that placed the order. Null only for orders predating required sign-in.';
