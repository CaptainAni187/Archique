create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artwork_ids bigint[] not null,
  discount_percent integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists combos_is_active_idx on public.combos (is_active);
