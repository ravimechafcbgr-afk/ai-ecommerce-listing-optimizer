create or replace function public.record_verified_plan_purchase(
  purchase_order_id text,
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
  existing_product_id text;
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

  select user_id, payment_id, product_id
  into existing_user_id, existing_payment_id, existing_product_id
  from public.payments
  where order_id = purchase_order_id;

  if existing_payment_id is not null then
    if existing_user_id <> current_user_id or existing_payment_id <> purchase_payment_id or existing_product_id <> purchase_plan_id then
      return jsonb_build_object('ok', false, 'error', 'order_already_processed');
    end if;

    select credits into current_credits from public.profiles where id = current_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'plan', purchase_plan_id, 'credits', coalesce(current_credits, 0));
  end if;

  select user_id, order_id into existing_user_id, existing_product_id
  from public.payments
  where payment_id = purchase_payment_id;

  if existing_product_id is not null then
    return jsonb_build_object('ok', false, 'error', 'payment_already_processed');
  end if;

  insert into public.payments (user_id, order_id, payment_id, product_id, amount_paise, credits)
  values (current_user_id, purchase_order_id, purchase_payment_id, purchase_plan_id, purchase_amount_paise, plan_credits);

  select credits into current_credits from public.profiles where id = current_user_id for update;

  update public.profiles
  set plan = purchase_plan_id, credits = plan_credits, updated_at = now()
  where id = current_user_id;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (
    current_user_id,
    plan_credits - coalesce(current_credits, 0),
    'razorpay_plan_purchase',
    jsonb_build_object('order_id', purchase_order_id, 'payment_id', purchase_payment_id, 'plan', purchase_plan_id)
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'plan', purchase_plan_id, 'credits', plan_credits);
exception
  when unique_violation then
    select credits into current_credits from public.profiles where id = current_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'plan', purchase_plan_id, 'credits', coalesce(current_credits, 0));
end;
$$;

grant execute on function public.record_verified_plan_purchase(text, text, text, integer) to authenticated;