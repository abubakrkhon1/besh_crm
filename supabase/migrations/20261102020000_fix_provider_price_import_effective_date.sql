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
