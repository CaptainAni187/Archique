create table if not exists public.admins (
  id bigserial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_sessions (
  id bigserial primary key,
  admin_id bigint not null references public.admins(id) on delete cascade,
  session_token_id uuid not null unique,
  email text not null,
  name text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  logged_out_at timestamptz
);

create table if not exists public.admin_activity_logs (
  id bigserial primary key,
  admin_id bigint references public.admins(id) on delete set null,
  admin_session_id bigint references public.admin_sessions(id) on delete set null,
  admin_name text not null,
  admin_email text not null,
  action_type text not null,
  resource_type text not null,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.inquiries
add column if not exists is_read boolean not null default false;

create index if not exists admins_email_idx on public.admins (email);
create index if not exists admin_sessions_admin_id_idx on public.admin_sessions (admin_id, created_at desc);
create index if not exists admin_sessions_token_idx on public.admin_sessions (session_token_id);
create index if not exists admin_activity_logs_admin_id_idx on public.admin_activity_logs (admin_id, created_at desc);
create index if not exists admin_activity_logs_created_at_idx on public.admin_activity_logs (created_at desc);
create index if not exists inquiries_is_read_idx on public.inquiries (is_read, created_at desc);

alter table public.admins enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_activity_logs enable row level security;

drop policy if exists "admins_service_role_only" on public.admins;
create policy "admins_service_role_only"
on public.admins
for all
to authenticated
using (false)
with check (false);

drop policy if exists "admin_sessions_service_role_only" on public.admin_sessions;
create policy "admin_sessions_service_role_only"
on public.admin_sessions
for all
to authenticated
using (false)
with check (false);

drop policy if exists "admin_activity_logs_service_role_only" on public.admin_activity_logs;
create policy "admin_activity_logs_service_role_only"
on public.admin_activity_logs
for all
to authenticated
using (false)
with check (false);
