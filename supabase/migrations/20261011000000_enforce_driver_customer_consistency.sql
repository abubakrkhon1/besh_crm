-- Prevent a card or transaction from retaining a driver from another customer
-- after customer reassignment. Mobile authorization relies on this invariant.

create or replace function public.clear_cross_customer_driver_binding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_customer_id uuid;
begin
  if new.driver_id is not null then
    select driver.customer_id into v_driver_customer_id
    from public.drivers as driver
    where driver.id = new.driver_id
    for key share;

    if not found or v_driver_customer_id is distinct from new.customer_id then
      new.driver_id := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.clear_cross_customer_driver_binding() from public, anon, authenticated;

drop trigger if exists fuel_cards_clear_cross_customer_driver on public.fuel_cards;
create trigger fuel_cards_clear_cross_customer_driver
before insert or update of customer_id, driver_id on public.fuel_cards
for each row execute function public.clear_cross_customer_driver_binding();

drop trigger if exists fuel_transactions_clear_cross_customer_driver on public.fuel_transactions;

create or replace function public.clear_cross_customer_transaction_bindings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_customer_id uuid;
  v_card_customer_id uuid;
begin
  if new.driver_id is not null then
    select driver.customer_id into v_driver_customer_id
    from public.drivers as driver
    where driver.id = new.driver_id
    for key share;

    if not found or v_driver_customer_id is distinct from new.customer_id then
      new.driver_id := null;
    end if;
  end if;

  if new.fuel_card_id is not null then
    select card.customer_id into v_card_customer_id
    from public.fuel_cards as card
    where card.id = new.fuel_card_id
    for key share;

    if not found or v_card_customer_id is distinct from new.customer_id then
      new.fuel_card_id := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.clear_cross_customer_transaction_bindings() from public, anon, authenticated;

create trigger fuel_transactions_clear_cross_customer_driver
before insert or update of customer_id, driver_id, fuel_card_id on public.fuel_transactions
for each row execute function public.clear_cross_customer_transaction_bindings();

create or replace function public.prevent_linked_driver_customer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is distinct from old.customer_id and (
    exists (select 1 from public.fuel_cards where driver_id = old.id)
    or exists (select 1 from public.fuel_transactions where driver_id = old.id)
  ) then
    raise exception 'A linked driver cannot be moved to another customer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_linked_driver_customer_change() from public, anon, authenticated;

drop trigger if exists drivers_prevent_linked_customer_change on public.drivers;
create trigger drivers_prevent_linked_customer_change
before update of customer_id on public.drivers
for each row execute function public.prevent_linked_driver_customer_change();

-- Repair inconsistent rows created before the invariant existed.
update public.fuel_cards as card
set driver_id = null
where card.driver_id is not null
  and not exists (
    select 1
    from public.drivers as driver
    where driver.id = card.driver_id
      and driver.customer_id = card.customer_id
  );

update public.fuel_transactions as transaction
set driver_id = case
      when transaction.driver_id is not null and not exists (
        select 1
        from public.drivers as driver
        where driver.id = transaction.driver_id
          and driver.customer_id = transaction.customer_id
      ) then null
      else transaction.driver_id
    end,
    fuel_card_id = case
      when transaction.fuel_card_id is not null and not exists (
        select 1
        from public.fuel_cards as card
        where card.id = transaction.fuel_card_id
          and card.customer_id = transaction.customer_id
      ) then null
      else transaction.fuel_card_id
    end
where (
  transaction.driver_id is not null and not exists (
    select 1 from public.drivers as driver
    where driver.id = transaction.driver_id
      and driver.customer_id = transaction.customer_id
  )
) or (
  transaction.fuel_card_id is not null and not exists (
    select 1 from public.fuel_cards as card
    where card.id = transaction.fuel_card_id
      and card.customer_id = transaction.customer_id
  )
);

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

  update public.fuel_cards
  set customer_id = p_customer_id,
      driver_id = case
        when exists (
          select 1
          from public.drivers as driver
          where driver.id = fuel_cards.driver_id
            and driver.customer_id = p_customer_id
        ) then fuel_cards.driver_id
        else null
      end
  where id = p_fuel_card_id;
end;
$$;

revoke all on function public.assign_fuel_card_customer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_fuel_card_customer(uuid, uuid, uuid) to service_role;

drop policy if exists fuel_cards_mobile_select_own on public.fuel_cards;
create policy fuel_cards_mobile_select_own
on public.fuel_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers as driver
    where driver.id = fuel_cards.driver_id
      and driver.auth_user_id = auth.uid()
      and driver.customer_id = fuel_cards.customer_id
      and driver.onboarding_status = 'active'
      and driver.status = 'active'
  )
);

drop policy if exists fuel_transactions_mobile_select_own on public.fuel_transactions;
create policy fuel_transactions_mobile_select_own
on public.fuel_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers as driver
    where driver.id = fuel_transactions.driver_id
      and driver.auth_user_id = auth.uid()
      and driver.customer_id = fuel_transactions.customer_id
      and driver.onboarding_status = 'active'
      and driver.status = 'active'
  )
);
