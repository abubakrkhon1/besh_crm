-- Customer company portal identities and tenant-scoped read access.
-- All provider mutations continue to run through audited server actions; these
-- policies only expose rows that belong to the signed-in company administrator.

alter type public.user_role
  add value if not exists 'customer_admin';

alter table public.profiles
  add column if not exists customer_id uuid references public.customers(id) on delete restrict;

create index if not exists profiles_customer_id_idx
  on public.profiles(customer_id)
  where customer_id is not null;

alter table public.profiles
  drop constraint if exists profiles_customer_admin_tenant_check;

alter table public.profiles
  add constraint profiles_customer_admin_tenant_check
  check (
    (role::text = 'customer_admin' and customer_id is not null)
    or (role::text <> 'customer_admin' and customer_id is null)
  );

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.customer_id
  from public.profiles as profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and profile.role::text = 'customer_admin'
  limit 1;
$$;

revoke all on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to authenticated;

drop policy if exists customers_customer_portal_select on public.customers;
create policy customers_customer_portal_select
on public.customers
for select
to authenticated
using (id = public.current_customer_id());

drop policy if exists drivers_customer_portal_select on public.drivers;
create policy drivers_customer_portal_select
on public.drivers
for select
to authenticated
using (customer_id = public.current_customer_id());

drop policy if exists fuel_cards_customer_portal_select on public.fuel_cards;
create policy fuel_cards_customer_portal_select
on public.fuel_cards
for select
to authenticated
using (customer_id = public.current_customer_id());

drop policy if exists fuel_transactions_customer_portal_select on public.fuel_transactions;
create policy fuel_transactions_customer_portal_select
on public.fuel_transactions
for select
to authenticated
using (customer_id = public.current_customer_id());

drop policy if exists driver_invitations_customer_portal_select on public.driver_invitations;
create policy driver_invitations_customer_portal_select
on public.driver_invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers as driver
    where driver.id = driver_invitations.driver_id
      and driver.customer_id = public.current_customer_id()
  )
);

drop policy if exists fuel_card_restrictions_customer_portal_select on public.fuel_card_restrictions;
create policy fuel_card_restrictions_customer_portal_select
on public.fuel_card_restrictions
for select
to authenticated
using (
  exists (
    select 1
    from public.fuel_cards as card
    where card.id = fuel_card_restrictions.fuel_card_id
      and card.customer_id = public.current_customer_id()
  )
);

drop policy if exists fuel_card_operations_customer_portal_select on public.fuel_card_operations;
create policy fuel_card_operations_customer_portal_select
on public.fuel_card_operations
for select
to authenticated
using (customer_id = public.current_customer_id());

grant select on table public.driver_invitations to authenticated;
grant select on table public.fuel_card_restrictions to authenticated;
grant select on table public.fuel_card_operations to authenticated;
