create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  credits integer not null default 7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy "Users can view their own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    7
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.get_user_credits(user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce((select credits from public.profiles where id = user_id), 0);
$$;

create or replace function public.update_user_credits(user_id uuid, delta integer, reason text, metadata jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
begin
  select credits into current_credits
  from public.profiles
  where id = user_id
  for update;

  if current_credits is null then
    insert into public.profiles (id, email, credits)
    values (user_id, (select email from auth.users where id = user_id), 7)
    on conflict (id) do nothing;
    select credits into current_credits
    from public.profiles
    where id = user_id;
  end if;

  update public.profiles
  set credits = greatest(current_credits + delta, 0),
      updated_at = now()
  where id = user_id;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (user_id, delta, reason, metadata);

  return (select credits from public.profiles where id = user_id);
end;
$$;

create or replace function public.consume_user_credits(
  credit_cost integer,
  credit_reason text,
  credit_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  remaining_credits integer;
begin
  if current_user_id is null or credit_cost is null or credit_cost <= 0 then
    return -1;
  end if;

  update public.profiles
  set credits = credits - credit_cost,
      updated_at = now()
  where id = current_user_id
    and credits >= credit_cost
  returning credits into remaining_credits;

  if remaining_credits is null then
    return -1;
  end if;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (current_user_id, -credit_cost, credit_reason, credit_metadata);

  return remaining_credits;
end;
$$;

create or replace function public.refund_user_credits(
  credit_amount integer,
  credit_reason text,
  credit_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  remaining_credits integer;
begin
  if current_user_id is null or credit_amount is null or credit_amount <= 0 then
    return -1;
  end if;

  update public.profiles
  set credits = credits + credit_amount,
      updated_at = now()
  where id = current_user_id
  returning credits into remaining_credits;

  if remaining_credits is null then
    return -1;
  end if;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (current_user_id, credit_amount, credit_reason, credit_metadata);

  return remaining_credits;
end;
$$;

create or replace function public.ensure_user_profile()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_credits integer;
begin
  if current_user_id is null then
    return -1;
  end if;

  insert into public.profiles (id, email, credits)
  values (
    current_user_id,
    coalesce((select email from auth.users where id = current_user_id), ''),
    7
  )
  on conflict (id) do nothing;

  select credits into current_credits
  from public.profiles
  where id = current_user_id;

  return coalesce(current_credits, 0);
end;
$$;

revoke execute on function public.get_user_credits(uuid) from public, anon, authenticated;
revoke execute on function public.update_user_credits(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.consume_user_credits(integer, text, jsonb) to authenticated;
grant execute on function public.refund_user_credits(integer, text, jsonb) to authenticated;
grant execute on function public.ensure_user_profile() to authenticated;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id text not null unique,
  payment_id text not null unique,
  product_id text not null,
  amount_paise integer not null,
  credits integer not null,
  status text not null default 'verified',
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Users can view their own payments"
  on public.payments for select
  using (auth.uid() = user_id);

create or replace function public.record_verified_credit_purchase(
  purchase_order_id text,
  purchase_payment_id text,
  purchase_product_id text,
  purchase_amount_paise integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  expected_amount_paise integer;
  purchase_credits integer;
  current_credits integer;
  existing_payment_id text;
  existing_user_id uuid;
  existing_order_id text;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  insert into public.profiles (id, email, credits)
  values (
    current_user_id,
    coalesce((select email from auth.users where id = current_user_id), ''),
    7
  )
  on conflict (id) do nothing;

  case purchase_product_id
    when 'credits_30' then
      expected_amount_paise := 19900;
      purchase_credits := 30;
    when 'credits_100' then
      expected_amount_paise := 49900;
      purchase_credits := 100;
    when 'credits_250' then
      expected_amount_paise := 99900;
      purchase_credits := 250;
    else
      return jsonb_build_object('ok', false, 'error', 'invalid_product');
  end case;

  if purchase_amount_paise <> expected_amount_paise then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select user_id, payment_id into existing_user_id, existing_payment_id
  from public.payments
  where order_id = purchase_order_id;

  if existing_payment_id is not null then
    if existing_user_id <> current_user_id or existing_payment_id <> purchase_payment_id then
      return jsonb_build_object('ok', false, 'error', 'order_already_processed');
    end if;

    select credits into current_credits
    from public.profiles
    where id = current_user_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'credits', coalesce(current_credits, 0)
    );
  end if;

  select user_id, order_id into existing_user_id, existing_order_id
  from public.payments
  where payment_id = purchase_payment_id;

  if existing_order_id is not null then
    if existing_user_id <> current_user_id or existing_order_id <> purchase_order_id then
      return jsonb_build_object('ok', false, 'error', 'payment_already_processed');
    end if;
  end if;

  insert into public.payments (
    user_id,
    order_id,
    payment_id,
    product_id,
    amount_paise,
    credits
  )
  values (
    current_user_id,
    purchase_order_id,
    purchase_payment_id,
    purchase_product_id,
    purchase_amount_paise,
    purchase_credits
  )
  on conflict (payment_id) do nothing;

  if not found then
    select credits into current_credits
    from public.profiles
    where id = current_user_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'credits', coalesce(current_credits, 0)
    );
  end if;

  update public.profiles
  set credits = credits + purchase_credits,
      updated_at = now()
  where id = current_user_id
  returning credits into current_credits;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (
    current_user_id,
    purchase_credits,
    'razorpay_credit_purchase',
    jsonb_build_object(
      'order_id', purchase_order_id,
      'payment_id', purchase_payment_id,
      'product_id', purchase_product_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'credits', current_credits
  );
end;
$$;

grant execute on function public.record_verified_credit_purchase(text, text, text, integer) to authenticated;
