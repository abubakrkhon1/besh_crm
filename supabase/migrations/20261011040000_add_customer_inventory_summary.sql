create or replace function public.get_customer_inventory_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_customers as materialized (
    select id, company_name, contact_name, status, last_synced_at, monthly_spend
    from public.customers
  ),
  status_rows as (
    select lower(status) as status, count(*)::integer as count
    from visible_customers
    group by lower(status)
  ),
  top_rows as (
    select id, company_name, contact_name, coalesce(monthly_spend, 0)::numeric as monthly_spend
    from visible_customers
    order by coalesce(monthly_spend, 0) desc, id
    limit 5
  ),
  card_total as (
    select count(*)::integer as count
    from public.fuel_cards as card
    join visible_customers as customer on customer.id = card.customer_id
  )
  select jsonb_build_object(
    'totalCustomers', (select count(*)::integer from visible_customers),
    'totalCards', (select count from card_total),
    'monthlySpend', (select coalesce(sum(monthly_spend), 0)::numeric from visible_customers),
    'latestSync', (select max(last_synced_at) from visible_customers),
    'synchronizedCustomers', (select count(*)::integer from visible_customers where last_synced_at is not null),
    'statusCounts', coalesce((select jsonb_agg(to_jsonb(status_rows) order by count desc, status) from status_rows), '[]'::jsonb),
    'topCustomers', coalesce((select jsonb_agg(to_jsonb(top_rows) order by monthly_spend desc, id) from top_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.get_customer_inventory_summary() from public, anon;
grant execute on function public.get_customer_inventory_summary() to authenticated;
