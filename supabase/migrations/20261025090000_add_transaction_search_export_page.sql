create or replace function public.export_fuel_transaction_search_page(
  p_query text, p_provider text, p_range_start timestamptz, p_range_end timestamptz,
  p_status text default null, p_customer_id uuid default null, p_card_id uuid default null,
  p_fuel_type text default null, p_cursor_date timestamptz default null,
  p_cursor_id uuid default null, p_limit integer default 1000
)
returns table (
  id uuid, provider_transaction_id text, transaction_date timestamptz, status text,
  merchant_name text, merchant_address text, merchant_state text, gallons numeric,
  amount numeric, savings numeric, provider_transaction_type text,
  customer_company_name text, customer_contact_name text, card_last4 text,
  card_driver_name text, driver_first_name text, driver_last_name text
)
language sql stable security invoker set search_path = ''
as $$
  select t.id, t.provider_transaction_id, t.transaction_date, t.status,
    t.merchant_name, t.merchant_address, t.merchant_state, t.gallons, t.amount, t.savings,
    t.provider_transaction_type, customer.company_name, customer.contact_name, card.card_last4,
    card.driver_name, driver.first_name, driver.last_name
  from public.fuel_transactions t
  left join public.customers customer on customer.id = t.customer_id
  left join public.fuel_cards card on card.id = t.fuel_card_id
  left join public.drivers driver on driver.id = t.driver_id
  where t.provider = p_provider and t.transaction_date >= p_range_start and t.transaction_date < p_range_end
    and (p_status is null or t.status = p_status)
    and (p_customer_id is null or t.customer_id = p_customer_id)
    and (p_card_id is null or t.fuel_card_id = p_card_id)
    and (p_fuel_type is null or t.provider_transaction_type = p_fuel_type)
    and (p_cursor_date is null or (t.transaction_date, t.id) < (p_cursor_date, p_cursor_id))
    and btrim(p_query) <> ''
    and (t.provider_transaction_id ilike '%' || p_query || '%' or t.merchant_name ilike '%' || p_query || '%'
      or t.merchant_state ilike '%' || p_query || '%' or t.wex_carrier_id ilike '%' || p_query || '%'
      or customer.company_name ilike '%' || p_query || '%' or customer.contact_name ilike '%' || p_query || '%'
      or card.card_last4 ilike '%' || p_query || '%' or card.driver_name ilike '%' || p_query || '%'
      or driver.first_name ilike '%' || p_query || '%' or driver.last_name ilike '%' || p_query || '%')
  order by t.transaction_date desc, t.id desc
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke all on function public.export_fuel_transaction_search_page(text, text, timestamptz, timestamptz, text, uuid, uuid, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.export_fuel_transaction_search_page(text, text, timestamptz, timestamptz, text, uuid, uuid, text, timestamptz, uuid, integer) to authenticated;
