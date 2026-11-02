drop policy if exists station_savings_prices_owner_gm_select on public.station_savings_prices;
drop policy if exists station_savings_prices_pricing_team_select on public.station_savings_prices;

create policy station_savings_prices_pricing_team_select
on public.station_savings_prices
for select to authenticated
using (public.has_any_role(array['owner', 'admin', 'general_manager']));

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
  if not public.has_any_role(array['owner', 'admin', 'general_manager']) then
    raise exception 'Owner, administrator, or General Manager access required' using errcode = '42501';
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
