-- Company portal users must never read the raw CRM tables. RLS is a row
-- boundary, not a column boundary, so expose only an explicit portal contract.

drop policy if exists customers_customer_portal_select on public.customers;
drop policy if exists drivers_customer_portal_select on public.drivers;
drop policy if exists fuel_cards_customer_portal_select on public.fuel_cards;
drop policy if exists fuel_transactions_customer_portal_select on public.fuel_transactions;
drop policy if exists driver_invitations_customer_portal_select on public.driver_invitations;
drop policy if exists fuel_card_restrictions_customer_portal_select on public.fuel_card_restrictions;
drop policy if exists fuel_card_operations_customer_portal_select on public.fuel_card_operations;

create or replace view public.customer_portal_customer
with (security_barrier = true)
as
select
  customer.id,
  customer.company_name,
  customer.contact_name,
  customer.email,
  customer.phone,
  customer.status,
  customer.current_balance,
  customer.credit_limit,
  customer.monthly_spend,
  customer.last_synced_at
from public.customers as customer
where customer.id = public.current_customer_id();

create or replace view public.customer_portal_drivers
with (security_barrier = true)
as
select
  driver.id,
  driver.customer_id,
  driver.first_name,
  driver.last_name,
  driver.display_name,
  driver.email,
  driver.phone,
  driver.status,
  driver.onboarding_status,
  (driver.auth_user_id is not null) as mobile_account_linked,
  driver.external_driver_id,
  driver.provider_status,
  driver.last_synced_at
from public.drivers as driver
where driver.customer_id = public.current_customer_id();

create or replace view public.customer_portal_fuel_cards
with (security_barrier = true)
as
select
  card.id,
  card.customer_id,
  card.driver_id,
  card.card_last4,
  card.status,
  card.driver_name,
  card.external_driver_id,
  card.unit_number,
  card.policy_number,
  card.daily_limit,
  card.weekly_limit,
  card.monthly_limit,
  card.gallon_limit,
  card.daily_transaction_limit,
  card.weekly_transaction_limit,
  card.monthly_transaction_limit,
  card.last_synced_at
from public.fuel_cards as card
where card.customer_id = public.current_customer_id()
  and card.provider = 'wex_efs';

create or replace view public.customer_portal_fuel_transactions
with (security_barrier = true)
as
select
  transaction.id,
  transaction.customer_id,
  transaction.fuel_card_id,
  transaction.driver_id,
  transaction.transaction_date,
  transaction.status,
  transaction.merchant_name,
  transaction.merchant_address,
  transaction.merchant_city,
  transaction.merchant_state,
  transaction.merchant_zip,
  transaction.gallons,
  transaction.amount,
  transaction.savings,
  transaction.provider_transaction_type,
  card.card_last4
from public.fuel_transactions as transaction
left join public.fuel_cards as card on card.id = transaction.fuel_card_id
where transaction.customer_id = public.current_customer_id();

create or replace view public.customer_portal_driver_invitations
with (security_barrier = true)
as
select
  invitation.id,
  invitation.driver_id,
  driver.customer_id,
  invitation.recipient_email,
  invitation.status,
  invitation.expires_at,
  invitation.sent_at,
  invitation.claimed_at,
  invitation.revoked_at,
  invitation.created_at
from public.driver_invitations as invitation
join public.drivers as driver on driver.id = invitation.driver_id
where driver.customer_id = public.current_customer_id();

create or replace view public.customer_portal_card_restrictions
with (security_barrier = true)
as
select
  restriction.id,
  restriction.fuel_card_id,
  card.customer_id,
  restriction.fuel_only,
  restriction.allow_def,
  restriction.allow_maintenance,
  restriction.allowed_states,
  restriction.blocked_states,
  restriction.allowed_merchants,
  restriction.blocked_merchants,
  restriction.start_time,
  restriction.end_time
from public.fuel_card_restrictions as restriction
join public.fuel_cards as card on card.id = restriction.fuel_card_id
where card.customer_id = public.current_customer_id();

create or replace view public.customer_portal_card_operations
with (security_barrier = true)
as
select
  operation.id,
  operation.fuel_card_id,
  operation.customer_id,
  operation.operation_type,
  operation.status,
  operation.requested_at,
  operation.completed_at
from public.fuel_card_operations as operation
where operation.customer_id = public.current_customer_id();

revoke all on public.customer_portal_customer from public, anon;
revoke all on public.customer_portal_drivers from public, anon;
revoke all on public.customer_portal_fuel_cards from public, anon;
revoke all on public.customer_portal_fuel_transactions from public, anon;
revoke all on public.customer_portal_driver_invitations from public, anon;
revoke all on public.customer_portal_card_restrictions from public, anon;
revoke all on public.customer_portal_card_operations from public, anon;

grant select on public.customer_portal_customer to authenticated;
grant select on public.customer_portal_drivers to authenticated;
grant select on public.customer_portal_fuel_cards to authenticated;
grant select on public.customer_portal_fuel_transactions to authenticated;
grant select on public.customer_portal_driver_invitations to authenticated;
grant select on public.customer_portal_card_restrictions to authenticated;
grant select on public.customer_portal_card_operations to authenticated;
