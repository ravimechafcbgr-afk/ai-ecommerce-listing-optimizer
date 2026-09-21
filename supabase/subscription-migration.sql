alter table public.profiles
  add column if not exists plan text not null default 'free';

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id text not null unique,
  payment_id text not null unique,
  plan text not null,
  amount_paise integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create or replace function public.record_verified_subscription(
  purchase_subscription_id text,
  purchase_payment_id text,
  purchase_plan_id text,
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
  plan_credits integer;
  current_credits integer;
  existing_user_id uuid;
  existing_payment_id text;
  existing_plan text;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  case purchase_plan_id
    when 'starter' then
      expected_amount_paise := 29900;
      plan_credits := 50;
    when 'pro' then
      expected_amount_paise := 69900;
      plan_credits := 200;
    else
      return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end case;

  if purchase_amount_paise <> expected_amount_paise then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select user_id, payment_id, plan
  into existing_user_id, existing_payment_id, existing_plan
  from public.subscriptions
  where subscription_id = purchase_subscription_id;

  if existing_payment_id is not null then
    if existing_user_id <> current_user_id or existing_payment_id <> purchase_payment_id then
      return jsonb_build_object('ok', false, 'error', 'subscription_already_processed');
    end if;

    select credits into current_credits
    from public.profiles
    where id = current_user_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'plan', existing_plan,
      'credits', coalesce(current_credits, 0)
    );
  end if;

  select user_id, subscription_id
  into existing_user_id, existing_plan
  from public.subscriptions
  where payment_id = purchase_payment_id;

  if existing_plan is not null then
    if existing_user_id <> current_user_id or existing_plan <> purchase_subscription_id then
      return jsonb_build_object('ok', false, 'error', 'payment_already_processed');
    end if;
  end if;

  insert into public.subscriptions (
    user_id,
    subscription_id,
    payment_id,
    plan,
    amount_paise,
    status
  )
  values (
    current_user_id,
    purchase_subscription_id,
    purchase_payment_id,
    purchase_plan_id,
    purchase_amount_paise,
    'active'
  )
  on conflict (payment_id) do nothing;

  if not found then
    select credits, plan into current_credits, existing_plan
    from public.profiles
    where id = current_user_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'plan', existing_plan,
      'credits', coalesce(current_credits, 0)
    );
  end if;

  select credits into current_credits
  from public.profiles
  where id = current_user_id
  for update;

  update public.profiles
  set plan = purchase_plan_id,
      credits = plan_credits,
      updated_at = now()
  where id = current_user_id;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (
    current_user_id,
    plan_credits - coalesce(current_credits, 0),
    'razorpay_subscription_purchase',
    jsonb_build_object(
      'subscription_id', purchase_subscription_id,
      'payment_id', purchase_payment_id,
      'plan', purchase_plan_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'plan', purchase_plan_id,
    'credits', plan_credits
  );
end;
$$;

grant execute on function public.record_verified_subscription(text, text, text, integer) to authenticated;
