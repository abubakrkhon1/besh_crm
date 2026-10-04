alter table public.station_savings_prices
  add column if not exists pump_price_per_gallon numeric(8,3),
  add column if not exists wex_price_per_gallon numeric(8,3),
  add column if not exists customer_savings_per_gallon numeric(8,3)
    generated always as (pump_price_per_gallon - our_price_per_gallon) stored,
  add column if not exists gross_profit_per_gallon numeric(8,3)
    generated always as (our_price_per_gallon - wex_price_per_gallon) stored;

alter table public.station_savings_prices
  add constraint station_savings_prices_pump_price_valid
    check (pump_price_per_gallon is null or (pump_price_per_gallon > 0 and pump_price_per_gallon <= 20)),
  add constraint station_savings_prices_wex_price_valid
    check (wex_price_per_gallon is null or (wex_price_per_gallon > 0 and wex_price_per_gallon <= 20)),
  add constraint station_savings_prices_price_order_valid
    check (
      (pump_price_per_gallon is null and wex_price_per_gallon is null)
      or (
        pump_price_per_gallon is not null
        and wex_price_per_gallon is not null
        and wex_price_per_gallon <= our_price_per_gallon
        and our_price_per_gallon <= pump_price_per_gallon
      )
    );

comment on column public.station_savings_prices.our_price_per_gallon is
  'Price charged to the customer. Kept under the original name for mobile-client compatibility.';
comment on column public.station_savings_prices.pump_price_per_gallon is
  'Public pump price used to calculate customer savings.';
comment on column public.station_savings_prices.wex_price_per_gallon is
  'Discounted WEX cost used to calculate BESH gross profit.';
comment on column public.station_savings_prices.customer_savings_per_gallon is
  'Pump price minus the price charged to the customer.';
comment on column public.station_savings_prices.gross_profit_per_gallon is
  'Price charged to the customer minus the WEX cost.';

create or replace function public.set_station_margin_price(
  p_station_brand text,
  p_pump_price_per_gallon numeric,
  p_wex_price_per_gallon numeric,
  p_customer_price_per_gallon numeric,
  p_effective_from date,
  p_change_reason text default null
)
returns public.station_savings_prices
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  saved_price public.station_savings_prices;
begin
  if not public.has_any_role(array['owner', 'general_manager']) then
    raise exception 'Owner or General Manager access required' using errcode = '42501';
  end if;

  if p_station_brand not in ('loves', 'pilot', 'flying_j') then
    raise exception 'Unsupported station brand' using errcode = '22023';
  end if;

  if p_pump_price_per_gallon is null or p_pump_price_per_gallon <= 0 or p_pump_price_per_gallon > 20
    or p_wex_price_per_gallon is null or p_wex_price_per_gallon <= 0 or p_wex_price_per_gallon > 20
    or p_customer_price_per_gallon is null or p_customer_price_per_gallon <= 0 or p_customer_price_per_gallon > 20 then
    raise exception 'All prices must be greater than zero and no more than twenty dollars' using errcode = '22023';
  end if;

  if p_wex_price_per_gallon > p_customer_price_per_gallon then
    raise exception 'Customer price cannot be lower than the WEX price' using errcode = '22023';
  end if;

  if p_customer_price_per_gallon > p_pump_price_per_gallon then
    raise exception 'Customer price cannot be higher than the pump price' using errcode = '22023';
  end if;

  if p_effective_from is null then
    raise exception 'Effective date is required' using errcode = '22023';
  end if;

  if p_change_reason is not null and char_length(trim(p_change_reason)) > 160 then
    raise exception 'Change reason must be 160 characters or fewer' using errcode = '22001';
  end if;

  select id into actor_profile_id
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active = true;

  if actor_profile_id is null then
    raise exception 'Active CRM profile required' using errcode = '42501';
  end if;

  insert into public.station_savings_prices (
    station_brand,
    pump_price_per_gallon,
    wex_price_per_gallon,
    our_price_per_gallon,
    effective_from,
    change_reason,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    p_station_brand,
    round(p_pump_price_per_gallon, 3),
    round(p_wex_price_per_gallon, 3),
    round(p_customer_price_per_gallon, 3),
    p_effective_from,
    nullif(trim(p_change_reason), ''),
    actor_profile_id,
    actor_profile_id
  )
  on conflict (station_brand, effective_from) do update
  set
    pump_price_per_gallon = excluded.pump_price_per_gallon,
    wex_price_per_gallon = excluded.wex_price_per_gallon,
    our_price_per_gallon = excluded.our_price_per_gallon,
    change_reason = excluded.change_reason,
    updated_by_profile_id = actor_profile_id,
    updated_at = now()
  returning * into saved_price;

  return saved_price;
end;
$$;

revoke all on function public.set_station_margin_price(text, numeric, numeric, numeric, date, text) from public;
grant execute on function public.set_station_margin_price(text, numeric, numeric, numeric, date, text) to authenticated;

drop function if exists public.get_current_station_savings_prices(date);

create function public.get_current_station_savings_prices(
  p_as_of date default current_date
)
returns table (
  station_brand text,
  pump_price_per_gallon numeric,
  our_price_per_gallon numeric,
  customer_savings_per_gallon numeric,
  effective_from date,
  effective_until date,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_as_of is null then
    raise exception 'p_as_of is required' using errcode = '22004';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.auth_user_id = auth.uid()
      and profile.is_active is true
      and profile.role::text in ('driver', 'owner', 'general_manager')
  ) then
    raise exception 'Active driver or manager profile required' using errcode = '42501';
  end if;

  return query
  select distinct on (price.station_brand)
    price.station_brand::text,
    price.pump_price_per_gallon,
    price.our_price_per_gallon,
    price.customer_savings_per_gallon,
    price.effective_from,
    price.effective_until,
    price.updated_at
  from public.station_savings_prices as price
  where price.effective_from <= p_as_of
    and (price.effective_until is null or price.effective_until >= p_as_of)
  order by
    price.station_brand,
    price.effective_from desc,
    price.updated_at desc;
end;
$$;

revoke all on function public.get_current_station_savings_prices(date) from public;
revoke all on function public.get_current_station_savings_prices(date) from anon;
revoke all on function public.get_current_station_savings_prices(date) from service_role;
grant execute on function public.get_current_station_savings_prices(date) to authenticated;

comment on function public.get_current_station_savings_prices(date) is
  'Returns current customer-facing station pricing to active drivers and managers without exposing WEX cost or BESH profit.';
