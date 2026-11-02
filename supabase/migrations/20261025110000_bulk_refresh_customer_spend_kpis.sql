create index if not exists fuel_transactions_posted_customer_date_idx
  on public.fuel_transactions (customer_id, transaction_date)
  include (amount)
  where status = 'posted' and customer_id is not null;

create or replace function public.refresh_customer_spend_kpis(
  p_customer_ids uuid[],
  p_synchronized_at timestamptz
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with requested as (
    select distinct customer_id
    from unnest(coalesce(p_customer_ids, array[]::uuid[])) as customer_id
    where customer_id is not null
  ),
  totals as (
    select requested.customer_id,
      coalesce(sum(transaction.amount), 0)::numeric as lifetime_spend,
      coalesce(sum(transaction.amount) filter (
        where transaction.transaction_date >= (date_trunc('month', p_synchronized_at at time zone 'UTC') at time zone 'UTC')
      ), 0)::numeric as monthly_spend
    from requested
    left join public.fuel_transactions transaction
      on transaction.customer_id = requested.customer_id and transaction.status = 'posted'
    group by requested.customer_id
  ),
  updated as (
    update public.customers customer
    set monthly_spend = totals.monthly_spend,
        lifetime_spend = totals.lifetime_spend,
        last_synced_at = p_synchronized_at
    from totals
    where customer.id = totals.customer_id
    returning customer.id
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.refresh_customer_spend_kpis(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_customer_spend_kpis(uuid[], timestamptz) to service_role;
