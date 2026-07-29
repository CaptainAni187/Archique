-- Coupons, admin-editable shop settings (shipping rates), and order columns
-- for coupon tracking. Also supports the move to full payment upfront (no
-- schema change needed there — advance_amount is simply set equal to
-- total_amount going forward).

create table if not exists public.shop_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.shop_settings (key, value)
values ('shipping_rates', jsonb_build_object('canvas', 1200, 'sketch', 350))
on conflict (key) do nothing;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default '',
  discount_type text not null,
  discount_value numeric not null,
  expires_at timestamptz,
  usage_limit integer,
  per_customer_limit integer,
  min_order_value numeric not null default 0,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coupons_discount_type_check check (discount_type in ('percent', 'flat')),
  constraint coupons_discount_value_positive check (discount_value > 0),
  constraint coupons_percent_range check (
    discount_type <> 'percent' or (discount_value > 0 and discount_value <= 100)
  ),
  constraint coupons_usage_limit_positive check (usage_limit is null or usage_limit > 0),
  constraint coupons_per_customer_limit_positive check (
    per_customer_limit is null or per_customer_limit > 0
  ),
  constraint coupons_min_order_value_nonnegative check (min_order_value >= 0)
);

create index if not exists coupons_code_idx on public.coupons (code);
create index if not exists coupons_is_active_idx on public.coupons (is_active);

create table if not exists public.coupon_redemptions (
  id bigserial primary key,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  customer_email text not null,
  order_id bigint,
  discount_amount numeric not null default 0,
  redeemed_at timestamptz not null default timezone('utc', now())
);

create index if not exists coupon_redemptions_coupon_id_idx on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_customer_email_idx
  on public.coupon_redemptions (coupon_id, customer_email);

alter table if exists public.orders
  add column if not exists coupon_code text,
  add column if not exists coupon_discount_amount numeric not null default 0;

alter table public.shop_settings enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

drop policy if exists "shop_settings_service_role_only" on public.shop_settings;
create policy "shop_settings_service_role_only"
on public.shop_settings for all to authenticated using (false) with check (false);

drop policy if exists "coupons_service_role_only" on public.coupons;
create policy "coupons_service_role_only"
on public.coupons for all to authenticated using (false) with check (false);

drop policy if exists "coupon_redemptions_service_role_only" on public.coupon_redemptions;
create policy "coupon_redemptions_service_role_only"
on public.coupon_redemptions for all to authenticated using (false) with check (false);
