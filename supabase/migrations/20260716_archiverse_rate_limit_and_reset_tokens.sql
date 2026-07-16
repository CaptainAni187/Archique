-- Persistent, serverless-safe rate limiting + admin password reset tokens.
-- In-memory Maps do not survive across Vercel function instances, so both
-- brute-force protection and the reset flow are backed by the database here.

-- ── Rate limiting ─────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  bucket_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

-- Atomic "consume one token" for a fixed window. Returns whether the request
-- is allowed plus how long until the window resets. Race-safe via upsert.
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms bigint
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_count integer;
  v_reset_at timestamptz;
begin
  insert into public.rate_limits as rl (bucket_key, count, reset_at, updated_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0), v_now)
  on conflict (bucket_key) do update
    set count = case
                  when rl.reset_at <= v_now then 1
                  else rl.count + 1
                end,
        reset_at = case
                     when rl.reset_at <= v_now
                       then v_now + make_interval(secs => p_window_ms / 1000.0)
                     else rl.reset_at
                   end,
        updated_at = v_now
  returning rl.count, rl.reset_at into v_count, v_reset_at;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  retry_after_seconds := greatest(ceil(extract(epoch from (v_reset_at - v_now)))::integer, 1);
  return next;
end;
$$;

-- ── Admin password reset tokens ───────────────────────────────────────────
-- Only the SHA-256 hash of the token is stored; the plaintext is emailed once.
create table if not exists public.admin_password_reset_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  admin_email text not null,
  admin_id bigint,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_reset_tokens_hash_idx on public.admin_password_reset_tokens (token_hash);
create index if not exists admin_reset_tokens_expires_idx on public.admin_password_reset_tokens (expires_at);

-- Lock everything to the service role (server-side only); no client access.
alter table public.rate_limits enable row level security;
alter table public.admin_password_reset_tokens enable row level security;

drop policy if exists "rate_limits_service_role_only" on public.rate_limits;
create policy "rate_limits_service_role_only"
on public.rate_limits for all to authenticated using (false) with check (false);

drop policy if exists "admin_reset_tokens_service_role_only" on public.admin_password_reset_tokens;
create policy "admin_reset_tokens_service_role_only"
on public.admin_password_reset_tokens for all to authenticated using (false) with check (false);
