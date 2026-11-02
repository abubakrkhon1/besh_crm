create table public.provider_price_file_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('loves', 'pilot', 'flying_j')),
  name text not null,
  worksheet_name text not null,
  column_mapping jsonb not null check (jsonb_typeof(column_mapping) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, name)
);

insert into public.provider_price_file_mappings (provider, name, worksheet_name, column_mapping)
values (
  'loves',
  'Love''s daily pricing v1',
  'LovesPrices',
  '{"providerLocationId":"Loves Store No.","billingStationCode":"Billing Card Station Code","city":"City","state":"State","latitude":"Latitude","longitude":"Longitude","pumpPrice":"Retail Price","providerPrice":"Best Discounted Price","effectiveDate":"Effective Date","pricingMethod":"Discounted Type Applied","customerAccount":"Customer","rackId":"OPIS Rack ID"}'::jsonb
);

create table public.fuel_locations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('loves', 'pilot', 'flying_j')),
  brand text not null check (brand in ('loves', 'pilot', 'flying_j')),
  provider_location_id text not null,
  billing_station_code text,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location_status text not null default 'pending_review'
    check (location_status in ('pending_review', 'active', 'inactive')),
  customer_price_per_gallon numeric(8,3)
    check (customer_price_per_gallon is null or customer_price_per_gallon > 0 and customer_price_per_gallon <= 20),
  customer_price_updated_by_profile_id uuid references public.profiles(id) on delete set null,
  customer_price_updated_at timestamptz,
  last_seen_import_at timestamptz,
  missing_from_latest_import boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_location_id)
);

create unique index fuel_locations_provider_billing_code_unique
  on public.fuel_locations (provider, billing_station_code)
  where billing_station_code is not null;
create index fuel_locations_provider_status_idx on public.fuel_locations (provider, location_status);
create index fuel_locations_coordinates_idx on public.fuel_locations (latitude, longitude);

create table public.provider_price_imports (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('loves', 'pilot', 'flying_j')),
  mapping_id uuid references public.provider_price_file_mappings(id) on delete restrict,
  original_filename text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  effective_date date not null,
  status text not null check (status in ('completed', 'completed_with_errors', 'failed')),
  received_rows integer not null check (received_rows >= 0),
  imported_rows integer not null check (imported_rows >= 0),
  rejected_rows integer not null check (rejected_rows >= 0),
  new_locations integer not null default 0 check (new_locations >= 0),
  review_locations integer not null default 0 check (review_locations >= 0),
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (provider, file_sha256)
);

create index provider_price_imports_provider_created_idx
  on public.provider_price_imports (provider, created_at desc);

create table public.fuel_location_prices (
  id uuid primary key default gen_random_uuid(),
  fuel_location_id uuid not null references public.fuel_locations(id) on delete cascade,
  import_id uuid not null references public.provider_price_imports(id) on delete restrict,
  fuel_grade text not null default 'diesel' check (fuel_grade = 'diesel'),
  pump_price_per_gallon numeric(8,3) not null check (pump_price_per_gallon > 0 and pump_price_per_gallon <= 20),
  provider_price_per_gallon numeric(8,3) not null check (provider_price_per_gallon > 0 and provider_price_per_gallon <= 20),
  effective_date date not null,
  pricing_method text,
  rack_id text,
  source_row_number integer not null check (source_row_number > 1),
  created_at timestamptz not null default now(),
  check (provider_price_per_gallon <= pump_price_per_gallon),
  unique (fuel_location_id, fuel_grade, effective_date)
);

create index fuel_location_prices_current_idx
  on public.fuel_location_prices (fuel_location_id, fuel_grade, effective_date desc);

create table public.provider_price_import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.provider_price_imports(id) on delete cascade,
  source_row_number integer not null,
  provider_location_id text,
  fuel_location_id uuid references public.fuel_locations(id) on delete set null,
  status text not null check (status in ('imported', 'rejected')),
  error_message text,
  normalized_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row_number)
);

alter table public.provider_price_file_mappings enable row level security;
alter table public.fuel_locations enable row level security;
alter table public.provider_price_imports enable row level security;
alter table public.fuel_location_prices enable row level security;
alter table public.provider_price_import_rows enable row level security;

create policy provider_price_file_mappings_crm_manage on public.provider_price_file_mappings
  for all to authenticated
  using (public.has_any_role(array['owner', 'admin', 'general_manager']))
  with check (public.has_any_role(array['owner', 'admin', 'general_manager']));
create policy fuel_locations_crm_manage on public.fuel_locations
  for all to authenticated
  using (public.has_any_role(array['owner', 'admin', 'general_manager']))
  with check (public.has_any_role(array['owner', 'admin', 'general_manager']));
create policy provider_price_imports_crm_select on public.provider_price_imports
  for select to authenticated using (public.has_any_role(array['owner', 'admin', 'general_manager']));
create policy fuel_location_prices_crm_select on public.fuel_location_prices
  for select to authenticated using (public.has_any_role(array['owner', 'admin', 'general_manager']));
create policy provider_price_import_rows_crm_select on public.provider_price_import_rows
  for select to authenticated using (public.has_any_role(array['owner', 'admin', 'general_manager']));

grant select, insert, update on public.provider_price_file_mappings to authenticated;
grant select, insert, update on public.fuel_locations to authenticated;
grant select on public.provider_price_imports, public.fuel_location_prices, public.provider_price_import_rows to authenticated;

create or replace function public.import_provider_station_prices(
  p_provider text,
  p_mapping_id uuid,
  p_original_filename text,
  p_file_sha256 text,
  p_rows jsonb,
  p_rejected_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  import_record public.provider_price_imports;
  item jsonb;
  location_record public.fuel_locations;
  effective_dates date[];
  import_effective_date date;
  received_count integer;
  imported_count integer := 0;
  rejected_count integer := 0;
  new_count integer := 0;
  review_count integer := 0;
  was_new boolean;
begin
  if not public.has_any_role(array['owner', 'admin', 'general_manager']) then
    raise exception 'Owner, administrator, or General Manager access required' using errcode = '42501';
  end if;
  if p_provider not in ('loves', 'pilot', 'flying_j') then
    raise exception 'Unsupported provider' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one valid price row is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rejected_rows) <> 'array' then
    raise exception 'Rejected rows must be an array' using errcode = '22023';
  end if;
  if exists (select 1 from public.provider_price_imports where provider = p_provider and file_sha256 = p_file_sha256) then
    raise exception 'This file has already been imported' using errcode = '23505';
  end if;

  select array_agg(distinct (entry.value->>'effectiveDate')::date)
  into effective_dates from jsonb_array_elements(p_rows) as entry(value);
  if coalesce(array_length(effective_dates, 1), 0) <> 1 then
    raise exception 'A daily import must contain exactly one effective date' using errcode = '22023';
  end if;
  import_effective_date := effective_dates[1];
  received_count := jsonb_array_length(p_rows) + jsonb_array_length(p_rejected_rows);

  select id into actor_profile_id from public.profiles
  where auth_user_id = auth.uid() and is_active is true;
  if actor_profile_id is null then
    raise exception 'Active CRM profile required' using errcode = '42501';
  end if;

  insert into public.provider_price_imports (
    provider, mapping_id, original_filename, file_sha256, effective_date, status,
    received_rows, imported_rows, rejected_rows, uploaded_by_profile_id
  ) values (
    p_provider, p_mapping_id, left(p_original_filename, 255), p_file_sha256, import_effective_date,
    case when jsonb_array_length(p_rejected_rows) > 0 then 'completed_with_errors' else 'completed' end,
    received_count, 0, jsonb_array_length(p_rejected_rows), actor_profile_id
  ) returning * into import_record;

  update public.fuel_locations set missing_from_latest_import = true
  where provider = p_provider and location_status <> 'inactive';

  for item in select value from jsonb_array_elements(p_rows)
  loop
    select * into location_record from public.fuel_locations
    where provider = p_provider and provider_location_id = item->>'providerLocationId';
    was_new := location_record.id is null;

    insert into public.fuel_locations (
      provider, brand, provider_location_id, billing_station_code, city, state,
      latitude, longitude, last_seen_import_at, missing_from_latest_import
    ) values (
      p_provider, p_provider, item->>'providerLocationId', nullif(item->>'billingStationCode', ''),
      item->>'city', item->>'state', (item->>'latitude')::numeric, (item->>'longitude')::numeric,
      now(), false
    )
    on conflict (provider, provider_location_id) do update set
      billing_station_code = excluded.billing_station_code,
      city = excluded.city,
      state = excluded.state,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      last_seen_import_at = now(),
      missing_from_latest_import = false,
      updated_at = now()
    returning * into location_record;

    if was_new then new_count := new_count + 1; end if;
    insert into public.fuel_location_prices (
      fuel_location_id, import_id, pump_price_per_gallon, provider_price_per_gallon,
      effective_date, pricing_method, rack_id, source_row_number
    ) values (
      location_record.id, import_record.id, (item->>'pumpPrice')::numeric,
      (item->>'providerPrice')::numeric, (item->>'effectiveDate')::date,
      nullif(item->>'pricingMethod', ''), nullif(item->>'rackId', ''),
      (item->>'sourceRowNumber')::integer
    )
    on conflict (fuel_location_id, fuel_grade, effective_date) do update set
      import_id = excluded.import_id,
      pump_price_per_gallon = excluded.pump_price_per_gallon,
      provider_price_per_gallon = excluded.provider_price_per_gallon,
      pricing_method = excluded.pricing_method,
      rack_id = excluded.rack_id,
      source_row_number = excluded.source_row_number;

    insert into public.provider_price_import_rows (
      import_id, source_row_number, provider_location_id, fuel_location_id, status, normalized_data
    ) values (
      import_record.id, (item->>'sourceRowNumber')::integer, item->>'providerLocationId',
      location_record.id, 'imported', item
    );
    imported_count := imported_count + 1;
  end loop;

  for item in select value from jsonb_array_elements(p_rejected_rows)
  loop
    insert into public.provider_price_import_rows (
      import_id, source_row_number, provider_location_id, status, error_message, normalized_data
    ) values (
      import_record.id, (item->>'row')::integer, nullif(item->>'providerLocationId', ''),
      'rejected', item->>'message', item
    );
    rejected_count := rejected_count + 1;
  end loop;

  update public.provider_price_imports set
    imported_rows = imported_count,
    rejected_rows = rejected_count,
    new_locations = new_count,
    review_locations = review_count
  where id = import_record.id;

  return jsonb_build_object(
    'importId', import_record.id,
    'importedRows', imported_count,
    'rejectedRows', rejected_count,
    'newLocations', new_count,
    'reviewLocations', review_count
  );
end;
$$;

revoke all on function public.import_provider_station_prices(text, uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.import_provider_station_prices(text, uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.set_fuel_location_customer_price(
  p_location_id uuid,
  p_customer_price numeric,
  p_activate_location boolean default true
)
returns public.fuel_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  saved public.fuel_locations;
begin
  if not public.has_any_role(array['owner', 'admin', 'general_manager']) then
    raise exception 'Owner, administrator, or General Manager access required' using errcode = '42501';
  end if;
  if p_customer_price is null or p_customer_price <= 0 or p_customer_price > 20 then
    raise exception 'Customer price must be greater than zero and no more than twenty dollars' using errcode = '22023';
  end if;
  select id into actor_profile_id from public.profiles
  where auth_user_id = auth.uid() and is_active is true;
  update public.fuel_locations set
    customer_price_per_gallon = round(p_customer_price, 3),
    customer_price_updated_by_profile_id = actor_profile_id,
    customer_price_updated_at = now(),
    location_status = case when p_activate_location then 'active' else location_status end,
    updated_at = now()
  where id = p_location_id returning * into saved;
  if saved.id is null then raise exception 'Location not found' using errcode = 'P0002'; end if;
  return saved;
end;
$$;

revoke all on function public.set_fuel_location_customer_price(uuid, numeric, boolean) from public;
grant execute on function public.set_fuel_location_customer_price(uuid, numeric, boolean) to authenticated;
