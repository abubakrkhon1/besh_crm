create index if not exists fuel_transactions_customer_date_idx
  on public.fuel_transactions (customer_id, transaction_date desc)
  where customer_id is not null;

create or replace function public.get_customer_daily_spend(
  p_customer_id uuid,
  p_start_date timestamptz
)
returns table(spend_date date, amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select transaction.transaction_date::date as spend_date,
         coalesce(sum(transaction.amount), 0)::numeric as amount
  from public.fuel_transactions as transaction
  where transaction.customer_id = p_customer_id
    and transaction.transaction_date >= p_start_date
  group by transaction.transaction_date::date
  order by spend_date;
$$;

revoke all on function public.get_customer_daily_spend(uuid, timestamptz) from public, anon;
grant execute on function public.get_customer_daily_spend(uuid, timestamptz) to authenticated;
