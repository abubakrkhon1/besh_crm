-- Serialize card ownership changes with provider mutations. Whichever operation
-- locks the card first wins; the other must re-evaluate the current tenant.

create or replace function public.begin_fuel_card_operation(
  p_fuel_card_id uuid,
  p_expected_customer_id uuid,
  p_operation_type text,
  p_idempotency_key uuid,
  p_request_summary jsonb,
  p_requested_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_customer_id uuid;
  v_operation public.fuel_card_operations%rowtype;
  v_existing boolean := false;
begin
  select card.customer_id
  into v_current_customer_id
  from public.fuel_cards as card
  where card.id = p_fuel_card_id
    and card.provider = 'wex_efs'
  for update;

  if not found then
    raise exception 'Fuel card is unavailable' using errcode = 'P0002';
  end if;
  if v_current_customer_id is distinct from p_expected_customer_id then
    raise exception 'Fuel card customer changed before the operation started' using errcode = '42501';
  end if;

  begin
    insert into public.fuel_card_operations (
      provider, fuel_card_id, customer_id, operation_type, status,
      idempotency_key, request_summary, requested_by, started_at
    ) values (
      'wex_efs', p_fuel_card_id, v_current_customer_id, p_operation_type,
      'in_progress', p_idempotency_key, coalesce(p_request_summary, '{}'::jsonb),
      p_requested_by, now()
    )
    returning * into v_operation;
  exception when unique_violation then
    select operation.*
    into v_operation
    from public.fuel_card_operations as operation
    where operation.idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    v_existing := true;
  end;

  return jsonb_build_object(
    'id', v_operation.id,
    'status', v_operation.status,
    'error_message', v_operation.error_message,
    'provider_reference', v_operation.provider_reference,
    'existing', v_existing
  );
end;
$$;

create or replace function public.assign_fuel_card_customer(
  p_fuel_card_id uuid,
  p_customer_id uuid,
  p_confirmed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
begin
  select card.id into v_card_id
  from public.fuel_cards as card
  where card.id = p_fuel_card_id
  for update;
  if not found then
    raise exception 'Fuel card is unavailable' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.fuel_card_operations as operation
    where operation.fuel_card_id = p_fuel_card_id
      and operation.status in ('pending', 'in_progress')
  ) then
    raise exception 'Fuel card has a provider operation in progress' using errcode = '55000';
  end if;

  if p_customer_id is null then
    delete from public.fuel_card_customer_mappings where fuel_card_id = p_fuel_card_id;
  else
    insert into public.fuel_card_customer_mappings (
      fuel_card_id, customer_id, match_method, match_confidence,
      is_confirmed, confirmed_by, confirmed_at
    ) values (
      p_fuel_card_id, p_customer_id, 'manual', 'confirmed', true,
      p_confirmed_by, now()
    )
    on conflict (fuel_card_id) do update set
      customer_id = excluded.customer_id,
      match_method = excluded.match_method,
      match_confidence = excluded.match_confidence,
      is_confirmed = excluded.is_confirmed,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = excluded.confirmed_at;
  end if;

  update public.fuel_cards set customer_id = p_customer_id where id = p_fuel_card_id;
end;
$$;

create or replace function public.prevent_card_reassignment_during_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is distinct from old.customer_id and exists (
    select 1 from public.fuel_card_operations as operation
    where operation.fuel_card_id = old.id
      and operation.status in ('pending', 'in_progress')
  ) then
    raise exception 'Fuel card has a provider operation in progress' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.begin_fuel_card_operation(uuid, uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.assign_fuel_card_customer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.prevent_card_reassignment_during_operation() from public, anon, authenticated;
grant execute on function public.begin_fuel_card_operation(uuid, uuid, text, uuid, jsonb, uuid) to service_role;
grant execute on function public.assign_fuel_card_customer(uuid, uuid, uuid) to service_role;

drop trigger if exists fuel_cards_prevent_reassignment_during_operation on public.fuel_cards;
create trigger fuel_cards_prevent_reassignment_during_operation
before update of customer_id on public.fuel_cards
for each row execute function public.prevent_card_reassignment_during_operation();
