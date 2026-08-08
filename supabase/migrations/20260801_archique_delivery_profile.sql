-- Archique: delivery profile on user accounts
--
-- Checkout previously collected the whole address as one free-text box and kept
-- nothing, so a returning buyer retyped everything and the stored address could
-- not be validated or reused. Structured fields let checkout autofill, and let
-- a pincode actually be checked.

begin;

alter table public.user_accounts
  add column if not exists phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists landmark text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists pincode text,
  add column if not exists delivery_profile_completed_at timestamptz;

-- Indian pincodes are exactly six digits and never start with zero. Allow null
-- so an account can exist before checkout details are supplied.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'user_accounts'
      and constraint_name = 'user_accounts_pincode_format'
  ) then
    alter table public.user_accounts
      add constraint user_accounts_pincode_format
      check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
  end if;
end $$;

-- Finding accounts that still need details before a nudge email.
create index if not exists user_accounts_delivery_profile_idx
  on public.user_accounts (delivery_profile_completed_at)
  where delivery_profile_completed_at is null;

commit;
