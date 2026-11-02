create extension if not exists pg_trgm with schema extensions;

-- Leading-wildcard transaction search needs trigram indexes once SaaS datasets grow.
create index if not exists fuel_transactions_provider_id_search_idx
  on public.fuel_transactions using gin (provider_transaction_id extensions.gin_trgm_ops)
  where provider_transaction_id is not null;
create index if not exists fuel_transactions_merchant_name_search_idx
  on public.fuel_transactions using gin (merchant_name extensions.gin_trgm_ops)
  where merchant_name is not null;
create index if not exists fuel_transactions_merchant_state_search_idx
  on public.fuel_transactions using gin (merchant_state extensions.gin_trgm_ops)
  where merchant_state is not null;
create index if not exists fuel_transactions_carrier_search_idx
  on public.fuel_transactions using gin (wex_carrier_id extensions.gin_trgm_ops)
  where wex_carrier_id is not null;
create index if not exists customers_company_name_search_idx
  on public.customers using gin (company_name extensions.gin_trgm_ops)
  where company_name is not null;
create index if not exists customers_contact_name_search_idx
  on public.customers using gin (contact_name extensions.gin_trgm_ops)
  where contact_name is not null;
create index if not exists fuel_cards_last4_search_idx
  on public.fuel_cards using gin (card_last4 extensions.gin_trgm_ops)
  where card_last4 is not null;
create index if not exists fuel_cards_driver_name_search_idx
  on public.fuel_cards using gin (driver_name extensions.gin_trgm_ops)
  where driver_name is not null;
create index if not exists drivers_first_name_search_idx
  on public.drivers using gin (first_name extensions.gin_trgm_ops)
  where first_name is not null;
create index if not exists drivers_last_name_search_idx
  on public.drivers using gin (last_name extensions.gin_trgm_ops)
  where last_name is not null;

create or replace function public.search_fuel_transaction_page(
  p_query text,
  p_provider text,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_status text default null,
  p_customer_id uuid default null,
  p_card_id uuid default null,
  p_fuel_type text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (id uuid, total_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with matches as (
    select t.id, t.transaction_date
    from public.fuel_transactions t
    left join public.customers customer on customer.id = t.customer_id
    left join public.fuel_cards card on card.id = t.fuel_card_id
    left join public.drivers driver on driver.id = t.driver_id
    where t.provider = p_provider
      and t.transaction_date >= p_range_start
      and t.transaction_date < p_range_end
      and (p_status is null or t.status = p_status)
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_card_id is null or t.fuel_card_id = p_card_id)
      and (p_fuel_type is null or t.provider_transaction_type = p_fuel_type)
      and btrim(p_query) <> ''
      and (
        t.provider_transaction_id ilike '%' || p_query || '%'
        or t.merchant_name ilike '%' || p_query || '%'
        or t.merchant_state ilike '%' || p_query || '%'
        or t.wex_carrier_id ilike '%' || p_query || '%'
        or customer.company_name ilike '%' || p_query || '%'
        or customer.contact_name ilike '%' || p_query || '%'
        or card.card_last4 ilike '%' || p_query || '%'
        or card.driver_name ilike '%' || p_query || '%'
        or driver.first_name ilike '%' || p_query || '%'
        or driver.last_name ilike '%' || p_query || '%'
      )
  )
  select matches.id, count(*) over () as total_count
  from matches
  order by matches.transaction_date desc, matches.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_fuel_transaction_page(text, text, timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.search_fuel_transaction_page(text, text, timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) to authenticated;
