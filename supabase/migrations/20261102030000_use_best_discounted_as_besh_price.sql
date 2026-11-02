comment on column public.fuel_location_prices.pump_price_per_gallon is
  'Retail Price from the provider workbook; this is the public pump price.';
comment on column public.fuel_location_prices.provider_price_per_gallon is
  'Best Discounted Price from the provider workbook; this is the customer-facing BESH fuel-card price.';
comment on column public.fuel_locations.customer_price_per_gallon is
  'Current customer-facing BESH price, synchronized automatically from the latest imported Best Discounted Price.';

create or replace function public.sync_imported_besh_location_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fuel_locations
  set
    customer_price_per_gallon = new.provider_price_per_gallon,
    location_status = 'active',
    updated_at = now()
  where id = new.fuel_location_id;
  return new;
end;
$$;

revoke all on function public.sync_imported_besh_location_price() from public;

drop trigger if exists fuel_location_prices_sync_besh_price on public.fuel_location_prices;
create trigger fuel_location_prices_sync_besh_price
after insert or update of provider_price_per_gallon
on public.fuel_location_prices
for each row execute function public.sync_imported_besh_location_price();

with latest_price as (
  select distinct on (fuel_location_id)
    fuel_location_id,
    provider_price_per_gallon
  from public.fuel_location_prices
  order by fuel_location_id, effective_date desc, created_at desc
)
update public.fuel_locations as location
set
  customer_price_per_gallon = latest_price.provider_price_per_gallon,
  location_status = 'active',
  updated_at = now()
from latest_price
where location.id = latest_price.fuel_location_id;

revoke execute on function public.set_fuel_location_customer_price(uuid, numeric, boolean) from authenticated;

create or replace function public.clear_provider_price_manual_review_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.review_locations := 0;
  return new;
end;
$$;

drop trigger if exists provider_price_imports_clear_manual_review on public.provider_price_imports;
create trigger provider_price_imports_clear_manual_review
before insert or update of review_locations
on public.provider_price_imports
for each row execute function public.clear_provider_price_manual_review_count();

update public.provider_price_imports set review_locations = 0
where review_locations <> 0;
