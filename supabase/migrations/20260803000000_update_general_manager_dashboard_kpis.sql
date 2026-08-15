drop function if exists public.general_manager_dashboard(timestamptz, timestamptz);

create function public.general_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  active_cards bigint,
  gallons_sold numeric,
  active_customers bigint,
  spending numeric,
  savings numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.has_full_crm_access() then
    raise exception 'Owner, Admin, or General Manager access required' using errcode = '42501';
  end if;

  if range_start >= range_end then
    raise exception 'range_start must be earlier than range_end' using errcode = '22023';
  end if;

  return query
  select
    (select count(*) from public.fuel_cards where lower(status) = 'active'),
    coalesce((
      select sum(gallons)
      from public.fuel_transactions
      where status = 'posted'
        and transaction_date >= range_start
        and transaction_date < range_end
    ), 0),
    (select count(*) from public.customers where lower(status) = 'active'),
    coalesce((
      select sum(amount)
      from public.fuel_transactions
      where status = 'posted'
        and transaction_date >= range_start
        and transaction_date < range_end
    ), 0),
    coalesce((
      select sum(savings)
      from public.fuel_transactions
      where status = 'posted'
        and transaction_date >= range_start
        and transaction_date < range_end
    ), 0);
end;
$$;

revoke all on function public.general_manager_dashboard(timestamptz, timestamptz) from public;
grant execute on function public.general_manager_dashboard(timestamptz, timestamptz) to authenticated;
