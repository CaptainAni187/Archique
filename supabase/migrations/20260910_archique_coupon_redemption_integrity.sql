-- Make a coupon's limits actually enforceable.
--
-- Three faults, compounding:
--
-- 1. A redemption was written with the email exactly as the buyer typed it,
--    while the limit check queried a lowercased copy. One capital letter --
--    which browser autofill preserves -- meant the per-customer count matched
--    nothing, so a "one per customer" coupon could be used indefinitely. This
--    was not a race; it failed every time.
--
-- 2. The limits were read, and the redemption was inserted much later, after
--    payment. Nothing in between was atomic, so two checkouts could both read
--    the same count and both pass it.
--
-- 3. The insert ran after the order had already been recorded and its failure
--    was swallowed with a warning, so a coupon could be spent without ever
--    being recorded -- and then reused forever.
--
-- The fix follows the pattern artwork stock already uses: claim the redemption
-- up front against the checkout's reservation token, release it if the
-- checkout is abandoned, and confirm it once the order exists. Claiming before
-- payment is what makes rejection safe; by the time an order row is written the
-- customer has already been charged and refusing them is not an option.

alter table if exists public.coupon_redemptions
  add column if not exists reservation_token text,
  add column if not exists razorpay_order_id text,
  add column if not exists redemption_index integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists released_at timestamptz;

-- Existing rows first, so the constraint below can be trusted from the moment
-- it is added rather than only for rows written after it.
update public.coupon_redemptions
set customer_email = lower(trim(customer_email))
where customer_email is distinct from lower(trim(customer_email));

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_email_lowercase;

-- Turns the fault above from a silent bypass into a loud failure: a mixed-case
-- address can no longer be stored, so a count can no longer miss it.
alter table public.coupon_redemptions
  add constraint coupon_redemptions_email_lowercase
  check (customer_email = lower(customer_email));

-- The nth use of this coupon by this customer. Combined with the index below,
-- two concurrent claims computing the same index cannot both be stored, so the
-- per-customer limit holds however the application behaves.
create unique index if not exists coupon_redemptions_one_per_index
  on public.coupon_redemptions (coupon_id, customer_email, redemption_index)
  where released_at is null;

create index if not exists coupon_redemptions_token_idx
  on public.coupon_redemptions (reservation_token)
  where released_at is null;

create index if not exists coupon_redemptions_razorpay_order_idx
  on public.coupon_redemptions (razorpay_order_id)
  where released_at is null;

-- Claim a redemption, or say why it cannot be claimed.
--
-- The whole decision happens inside one transaction, and the coupon row is
-- locked first, so every concurrent claim for the same coupon is serialised.
-- That is what read-the-count-then-insert could never be: two requests can no
-- longer both find themselves under the limit.
-- Times are compared as timestamptz throughout, using now() rather than
-- timezone('utc', now()).
--
-- The latter returns a *naive* timestamp, and comparing one against a
-- timestamptz column re-interprets it in the session's time zone -- so every
-- expiry check silently shifts by the server's UTC offset. It reads as correct
-- and behaves correctly only while the database happens to be on UTC, which is
-- true of the hosted instance and was not true of the throwaway cluster this
-- was tested on: reservations there expired five and a half hours late. The
-- rewritten sweep below fixes the same latent fault for artwork reservations.

create or replace function public.claim_coupon_redemption(
  p_coupon_id uuid,
  p_email text,
  p_token text,
  p_razorpay_order_id text default null,
  p_ttl_minutes integer default 15
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_active integer;
  v_by_customer integer;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;

  if not found or v_coupon.is_active = false then
    return 'not_found';
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return 'expired';
  end if;

  -- A claim that has run out of time no longer holds a place, so an abandoned
  -- checkout does not consume a coupon nobody bought anything with.
  select count(*) into v_active
  from public.coupon_redemptions
  where coupon_id = p_coupon_id
    and released_at is null
    and (expires_at is null or expires_at > now());

  if v_coupon.usage_limit is not null and v_active >= v_coupon.usage_limit then
    return 'usage_limit';
  end if;

  select count(*) into v_by_customer
  from public.coupon_redemptions
  where coupon_id = p_coupon_id
    and customer_email = v_email
    and released_at is null
    and (expires_at is null or expires_at > now());

  if v_coupon.per_customer_limit is not null
     and v_email <> ''
     and v_by_customer >= v_coupon.per_customer_limit then
    return 'customer_limit';
  end if;

  insert into public.coupon_redemptions (
    coupon_id, customer_email, reservation_token, razorpay_order_id,
    redemption_index, expires_at
  )
  values (
    p_coupon_id, v_email, p_token, p_razorpay_order_id,
    v_by_customer, now() + make_interval(mins => p_ttl_minutes)
  );

  return 'ok';
end;
$$;

-- The order exists, so the claim stops being provisional. Clearing expires_at
-- is what makes it permanent: nothing sweeps a row that cannot expire.
create or replace function public.confirm_coupon_redemption(
  p_razorpay_order_id text,
  p_order_id bigint,
  p_discount_amount numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed integer := 0;
begin
  update public.coupon_redemptions
  set expires_at = null,
      order_id = p_order_id,
      discount_amount = coalesce(p_discount_amount, 0)
  where razorpay_order_id = p_razorpay_order_id
    and released_at is null;

  get diagnostics confirmed = row_count;
  return confirmed;
end;
$$;

create or replace function public.release_coupon_redemptions(p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer := 0;
begin
  update public.coupon_redemptions
  set released_at = now()
  where reservation_token = p_token
    and released_at is null
    and expires_at is not null; -- never release one an order already confirmed

  get diagnostics released = row_count;
  return released;
end;
$$;

-- Extends the sweep that already runs at the top of every checkout, so coupon
-- claims left behind by an abandoned checkout are freed on the same schedule
-- as the artwork holds beside them, with no new job to run.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer := 0;
  coupons_released integer := 0;
begin
  update public.artwork_reservations
  set released_at = now()
  where released_at is null
    and expires_at < now();

  get diagnostics released = row_count;

  update public.coupon_redemptions
  set released_at = now()
  where released_at is null
    and expires_at is not null
    and expires_at < now();

  get diagnostics coupons_released = row_count;

  return released + coupons_released;
end;
$$;

alter table public.coupon_redemptions enable row level security;
drop policy if exists coupon_redemptions_deny_client_access on public.coupon_redemptions;
create policy coupon_redemptions_deny_client_access on public.coupon_redemptions
  as restrictive for all to anon, authenticated using (false) with check (false);
