create index if not exists fuel_transactions_provider_date_idx
  on public.fuel_transactions (provider, transaction_date desc);

create index if not exists fuel_transactions_card_date_idx
  on public.fuel_transactions (fuel_card_id, transaction_date desc)
  where fuel_card_id is not null;

create or replace function public.get_transaction_period_summary(
  p_provider text,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_previous_start timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with period as materialized (
    select transaction.id, transaction.transaction_date, transaction.status,
           transaction.amount, transaction.savings, transaction.gallons,
           transaction.merchant_name, transaction.customer_id,
           transaction.fuel_card_id, transaction.provider_transaction_type,
           coalesce(customer.company_name, customer.contact_name, 'Customer') as customer_name,
           card.card_last4
    from public.fuel_transactions as transaction
    left join public.customers as customer on customer.id = transaction.customer_id
    left join public.fuel_cards as card on card.id = transaction.fuel_card_id
    where transaction.provider = p_provider
      and transaction.transaction_date >= p_range_start
      and transaction.transaction_date < p_range_end
  ),
  current_stats as (
    select count(*)::integer as total,
           coalesce(sum(amount), 0)::numeric as spending,
           coalesce(sum(savings), 0)::numeric as savings,
           coalesce(sum(gallons), 0)::numeric as gallons,
           coalesce(avg(amount), 0)::numeric as average_ticket
    from period
  ),
  previous_stats as (
    select count(*)::integer as total,
           coalesce(sum(amount), 0)::numeric as spending,
           coalesce(sum(savings), 0)::numeric as savings,
           coalesce(sum(gallons), 0)::numeric as gallons,
           coalesce(avg(amount), 0)::numeric as average_ticket
    from public.fuel_transactions
    where provider = p_provider
      and transaction_date >= p_previous_start
      and transaction_date < p_range_start
  ),
  daily_rows as (
    select transaction_date::date as date, count(*)::integer as count,
           coalesce(sum(amount), 0)::numeric as spending,
           coalesce(sum(savings), 0)::numeric as savings,
           coalesce(sum(gallons), 0)::numeric as gallons,
           coalesce(avg(amount), 0)::numeric as average_ticket
    from period group by transaction_date::date
  ),
  status_rows as (
    select status, count(*)::integer as count from period group by status
  ),
  merchant_rows as (
    select coalesce(nullif(btrim(merchant_name), ''), 'Unknown merchant') as name,
           coalesce(sum(amount), 0)::numeric as amount
    from period group by coalesce(nullif(btrim(merchant_name), ''), 'Unknown merchant')
    order by amount desc limit 5
  ),
  customer_rows as (
    select customer_id as id, max(customer_name) as name,
           coalesce(sum(amount), 0)::numeric as amount
    from period where customer_id is not null group by customer_id
    order by amount desc limit 5
  ),
  threshold as (
    select greatest(500::numeric, average_ticket * 2) as amount from current_stats
  ),
  flag_stats as (
    select count(*) filter (where lower(period.status) = 'reversed')::integer as reversed,
           count(*) filter (where period.amount >= threshold.amount)::integer as high_ticket,
           count(*) filter (where period.customer_id is null)::integer as unmatched,
           count(distinct period.fuel_card_id)::integer as active_cards
    from period cross join threshold
  ),
  exception_rows as (
    select period.id,
           case when lower(period.status) = 'reversed' then 'Reversed transaction'
                when period.customer_id is null then 'Unmatched transaction'
                else 'High ticket transaction' end as type,
           coalesce(period.merchant_name, 'Card ending ' || coalesce(period.card_last4, '—')) as detail,
           period.transaction_date as date, period.amount,
           case when period.customer_id is null then 'warning' else 'danger' end as tone
    from period cross join threshold
    where lower(period.status) = 'reversed'
       or period.customer_id is null
       or period.amount >= threshold.amount
    order by period.transaction_date desc
    limit 3
  ),
  card_stats as (
    select count(*)::integer as total_cards
    from public.fuel_cards where provider = p_provider
  )
  select jsonb_build_object(
    'current', (select to_jsonb(current_stats) from current_stats),
    'previous', (select to_jsonb(previous_stats) from previous_stats),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily_rows) order by date) from daily_rows), '[]'::jsonb),
    'statuses', coalesce((select jsonb_agg(to_jsonb(status_rows) order by count desc, status) from status_rows), '[]'::jsonb),
    'fuelTypes', coalesce((select jsonb_agg(provider_transaction_type order by provider_transaction_type) from (select distinct provider_transaction_type from period where provider_transaction_type is not null) types), '[]'::jsonb),
    'topMerchants', coalesce((select jsonb_agg(to_jsonb(merchant_rows) order by amount desc) from merchant_rows), '[]'::jsonb),
    'topCustomers', coalesce((select jsonb_agg(to_jsonb(customer_rows) order by amount desc) from customer_rows), '[]'::jsonb),
    'flags', jsonb_build_object(
      'reversed', (select reversed from flag_stats),
      'highTicket', (select high_ticket from flag_stats),
      'unmatched', (select unmatched from flag_stats),
      'cardsWithoutActivity', greatest(0, (select total_cards from card_stats) - (select active_cards from flag_stats))
    ),
    'recentExceptions', coalesce((select jsonb_agg(to_jsonb(exception_rows) order by date desc) from exception_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.get_transaction_period_summary(text, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_transaction_period_summary(text, timestamptz, timestamptz, timestamptz) to authenticated;
