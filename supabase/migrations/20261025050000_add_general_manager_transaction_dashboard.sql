create index if not exists fuel_transactions_posted_dashboard_idx
  on public.fuel_transactions (transaction_date desc, id)
  where status = 'posted';

create or replace function public.general_manager_transaction_dashboard(
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.has_any_role(array['owner', 'admin', 'general_manager']) then
    raise exception 'General Manager access required' using errcode = '42501';
  end if;
  if p_range_start >= p_range_end then
    raise exception 'p_range_start must be earlier than p_range_end' using errcode = '22023';
  end if;

  with period as materialized (
    select id, fuel_card_id, gallons, amount, savings, transaction_date, merchant_name, merchant_state
    from public.fuel_transactions
    where status = 'posted'
      and transaction_date >= p_range_start
      and transaction_date < p_range_end
  ), totals as (
    select coalesce(sum(gallons), 0) as gallons,
           coalesce(sum(amount), 0) as spending,
           coalesce(sum(savings), 0) as savings
    from period
  ), daily_rows as (
    select transaction_date::date as date,
           coalesce(sum(gallons), 0) as gallons,
           coalesce(sum(amount), 0) as spending
    from period group by transaction_date::date
  ), state_rows as (
    select coalesce(nullif(upper(btrim(merchant_state)), ''), 'Other') as state,
           coalesce(sum(amount), 0) as amount
    from period
    group by coalesce(nullif(upper(btrim(merchant_state)), ''), 'Other')
  ), location_rows as (
    select coalesce(nullif(btrim(merchant_name), ''), 'Unknown location') as name,
           coalesce(sum(gallons), 0) as gallons,
           coalesce(sum(amount), 0) as spending
    from period
    group by coalesce(nullif(btrim(merchant_name), ''), 'Unknown location')
    order by gallons desc, spending desc
    limit 5
  ), recent_rows as (
    select period.id, period.transaction_date, period.merchant_name, period.merchant_state,
           period.gallons, period.amount, period.savings,
           case when cards.id is null then null else jsonb_build_object('card_last4', cards.card_last4) end as fuel_card
    from period
    left join public.fuel_cards cards on cards.id = period.fuel_card_id
    order by period.transaction_date desc, period.id desc
    limit 5
  )
  select jsonb_build_object(
    'gallons', totals.gallons,
    'spending', totals.spending,
    'savings', totals.savings,
    'daily_series', coalesce((select jsonb_agg(to_jsonb(daily_rows) order by date) from daily_rows), '[]'::jsonb),
    'spend_by_state', coalesce((select jsonb_agg(to_jsonb(state_rows) order by amount desc, state) from state_rows), '[]'::jsonb),
    'top_locations', coalesce((select jsonb_agg(to_jsonb(location_rows) order by gallons desc, spending desc) from location_rows), '[]'::jsonb),
    'recent_transactions', coalesce((select jsonb_agg(to_jsonb(recent_rows) order by transaction_date desc, id desc) from recent_rows), '[]'::jsonb)
  ) into result
  from totals;

  return result;
end;
$$;

revoke all on function public.general_manager_transaction_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.general_manager_transaction_dashboard(timestamptz, timestamptz) to authenticated;
