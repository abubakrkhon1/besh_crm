create table public.station_savings_prices (
  id uuid primary key default gen_random_uuid(),
  station_brand text not null check (station_brand in ('loves', 'pilot', 'flying_j')),
  our_price_per_gallon numeric(8,3) not null check (our_price_per_gallon > 0 and our_price_per_gallon <= 20),
  effective_from date not null,
  effective_until date,
  change_reason text check (change_reason is null or char_length(change_reason) <= 160),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_savings_prices_valid_period check (
    effective_until is null or effective_until >= effective_from
  ),
  constraint station_savings_prices_brand_date_unique unique (station_brand, effective_from)
);
create index station_savings_prices_current_lookup
  on public.station_savings_prices (station_brand, effective_from desc, effective_until);
alter table public.station_savings_prices enable row level security;
create policy station_savings_prices_owner_gm_select
on public.station_savings_prices
for select to authenticated
using (public.has_any_role(array['owner', 'general_manager']));
create or replace function public.resequence_station_savings_price_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_brand text;
begin
  affected_brand := case when tg_op = 'DELETE' then old.station_brand else new.station_brand end;

  with sequenced as (
    select
      id,
      lead(effective_from) over (partition by station_brand order by effective_from) as next_effective_from
    from public.station_savings_prices
    where station_brand = affected_brand
  )
  update public.station_savings_prices as price
  set effective_until = sequenced.next_effective_from - 1
  from sequenced
  where price.id = sequenced.id
    and price.effective_until is distinct from sequenced.next_effective_from - 1;

  if tg_op = 'UPDATE' and old.station_brand is distinct from new.station_brand then
    with sequenced as (
      select
        id,
        lead(effective_from) over (partition by station_brand order by effective_from) as next_effective_from
      from public.station_savings_prices
      where station_brand = old.station_brand
    )
    update public.station_savings_prices as price
    set effective_until = sequenced.next_effective_from - 1
    from sequenced
    where price.id = sequenced.id
      and price.effective_until is distinct from sequenced.next_effective_from - 1;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
revoke all on function public.resequence_station_savings_price_periods() from public;
create trigger station_savings_prices_resequence
after insert or update of station_brand, effective_from or delete
on public.station_savings_prices
for each row execute function public.resequence_station_savings_price_periods();
create or replace function public.set_station_savings_price(
  p_station_brand text,
  p_our_price_per_gallon numeric,
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

  if p_our_price_per_gallon <= 0 or p_our_price_per_gallon > 20 then
    raise exception 'Price must be greater than zero and no more than twenty dollars' using errcode = '22023';
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
    our_price_per_gallon,
    effective_from,
    change_reason,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    p_station_brand,
    round(p_our_price_per_gallon, 3),
    p_effective_from,
    nullif(trim(p_change_reason), ''),
    actor_profile_id,
    actor_profile_id
  )
  on conflict (station_brand, effective_from) do update
  set
    our_price_per_gallon = excluded.our_price_per_gallon,
    change_reason = excluded.change_reason,
    updated_by_profile_id = actor_profile_id,
    updated_at = now()
  returning * into saved_price;

  return saved_price;
end;
$$;
revoke all on function public.set_station_savings_price(text, numeric, date, text) from public;
grant execute on function public.set_station_savings_price(text, numeric, date, text) to authenticated;
grant select on public.station_savings_prices to authenticated;
