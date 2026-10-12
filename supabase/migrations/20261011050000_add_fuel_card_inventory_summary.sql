create or replace function public.get_fuel_card_inventory_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_cards as materialized (
    select card.id, card.card_last4, card.customer_id, card.driver_name,
           card.external_driver_id, card.status, card.policy_number,
           card.is_overridden, card.last_synced_at,
           customer.company_name, customer.contact_name
    from public.fuel_cards as card
    left join public.customers as customer on customer.id = card.customer_id
    where card.provider = 'wex_efs'
  ),
  status_rows as (
    select lower(replace(btrim(status), ' ', '_')) as status, count(*)::integer as count
    from visible_cards group by lower(replace(btrim(status), ' ', '_'))
  ),
  customer_rows as (
    select customer_id as id,
           coalesce(max(company_name), max(contact_name), 'Unknown customer') as name,
           count(*)::integer as count
    from visible_cards where customer_id is not null
    group by customer_id
  ),
  issue_samples as (
    select
      (select to_jsonb(card) from visible_cards card where customer_id is null order by last_synced_at desc limit 1) as unmatched,
      (select to_jsonb(card) from visible_cards card where external_driver_id is null and driver_name is null order by last_synced_at desc limit 1) as missing_driver,
      (select to_jsonb(card) from visible_cards card where is_overridden order by last_synced_at desc limit 1) as overridden
  )
  select jsonb_build_object(
    'statusDistribution', coalesce((select jsonb_agg(to_jsonb(status_rows) order by count desc, status) from status_rows), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(policy_number order by policy_number) from (select distinct policy_number from visible_cards where policy_number is not null) policies), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(customer_rows) order by count desc, name) from customer_rows), '[]'::jsonb),
    'assignedDrivers', (select count(distinct coalesce(external_driver_id, lower(btrim(driver_name))))::integer from visible_cards where external_driver_id is not null or driver_name is not null),
    'unmatchedCount', (select count(*)::integer from visible_cards where customer_id is null),
    'missingDriverCount', (select count(*)::integer from visible_cards where external_driver_id is null and driver_name is null),
    'overriddenCount', (select count(*)::integer from visible_cards where is_overridden),
    'issueSamples', (select to_jsonb(issue_samples) from issue_samples)
  );
$$;

revoke all on function public.get_fuel_card_inventory_summary() from public, anon;
grant execute on function public.get_fuel_card_inventory_summary() to authenticated;
