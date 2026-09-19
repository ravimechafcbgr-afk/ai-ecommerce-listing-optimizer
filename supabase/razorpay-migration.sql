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
