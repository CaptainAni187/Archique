alter table if exists public.commissions
  add column if not exists idea_text text,
  add column if not exists structured_brief jsonb not null default '{}'::jsonb,
  add column if not exists clearer_brief text,
  add column if not exists suggested_reply text;
