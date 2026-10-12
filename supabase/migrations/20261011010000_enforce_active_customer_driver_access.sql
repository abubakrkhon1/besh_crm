-- A customer suspension or closure must revoke every driver's data access
-- without overwriting each driver's independently managed mobile-access state.

create or replace function public.is_customer_active(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.status = 'active'
  );
$$;

revoke all on function public.is_customer_active(uuid) from public, anon;
grant execute on function public.is_customer_active(uuid) to authenticated;

drop policy if exists drivers_mobile_select_own on public.drivers;
create policy drivers_mobile_select_own
on public.drivers
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and onboarding_status = 'active'
  and status = 'active'
  and public.is_customer_active(customer_id)
);

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
      and public.is_customer_active(driver.customer_id)
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
      and public.is_customer_active(driver.customer_id)
  )
);
