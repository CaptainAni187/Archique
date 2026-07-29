create table if not exists public.inquiries (
  id bigserial primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.inquiries enable row level security;

-- Allow inserts from the public client if you want to accept inquiries directly.
-- We still recommend using the `/api/inquiries` route (service role) in production.
drop policy if exists "inquiries_insert_public" on public.inquiries;
create policy "inquiries_insert_public"
on public.inquiries
for insert
to anon, authenticated
with check (true);

