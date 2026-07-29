-- User-facing password reset tokens. Only the SHA-256 hash of the token is
-- stored; the plaintext is emailed once. Single-use + short expiry.
create table if not exists public.user_password_reset_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  user_id bigint references public.user_accounts(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_reset_tokens_hash_idx on public.user_password_reset_tokens (token_hash);
create index if not exists user_reset_tokens_expires_idx on public.user_password_reset_tokens (expires_at);

alter table public.user_password_reset_tokens enable row level security;

drop policy if exists "user_reset_tokens_service_role_only" on public.user_password_reset_tokens;
create policy "user_reset_tokens_service_role_only"
on public.user_password_reset_tokens for all to authenticated using (false) with check (false);
