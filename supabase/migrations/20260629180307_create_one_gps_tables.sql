-- =========================
-- GPS TABLES FOR RENTME CRM
-- =========================

create table if not exists public.vehicle_gps_devices (
  id uuid primary key default gen_random_uuid(),

  car_id uuid not null references public.cars(id) on delete cascade,

  provider text not null default 'one_step_gps',
  device_id text not null,
  device_label text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(provider, device_id),
  unique(car_id)
);

create table if not exists public.vehicle_latest_locations (
  id uuid primary key default gen_random_uuid(),

  car_id uuid not null references public.cars(id) on delete cascade,
  gps_device_id uuid not null references public.vehicle_gps_devices(id) on delete cascade,

  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,

  speed_mph numeric(8, 2),
  heading numeric(8, 2),
  ignition boolean,
  odometer_miles numeric(12, 2),

  address text,

  recorded_at timestamptz not null,
  updated_at timestamptz not null default now(),

  unique(car_id),
  unique(gps_device_id)
);

create table if not exists public.vehicle_location_history (
  id uuid primary key default gen_random_uuid(),

  car_id uuid not null references public.cars(id) on delete cascade,
  gps_device_id uuid not null references public.vehicle_gps_devices(id) on delete cascade,

  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,

  speed_mph numeric(8, 2),
  heading numeric(8, 2),
  ignition boolean,
  odometer_miles numeric(12, 2),

  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_gps_events (
  id uuid primary key default gen_random_uuid(),

  car_id uuid references public.cars(id) on delete cascade,
  gps_device_id uuid references public.vehicle_gps_devices(id) on delete cascade,

  event_type text not null,
  event_title text,
  payload jsonb,

  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =========================
-- INDEXES
-- =========================

create index if not exists idx_vehicle_gps_devices_car_id
on public.vehicle_gps_devices(car_id);

create index if not exists idx_vehicle_latest_locations_car_id
on public.vehicle_latest_locations(car_id);

create index if not exists idx_vehicle_location_history_car_recorded_at
on public.vehicle_location_history(car_id, recorded_at desc);

create index if not exists idx_vehicle_gps_events_car_recorded_at
on public.vehicle_gps_events(car_id, recorded_at desc);

-- =========================
-- ENABLE RLS
-- =========================

alter table public.vehicle_gps_devices enable row level security;
alter table public.vehicle_latest_locations enable row level security;
alter table public.vehicle_location_history enable row level security;
alter table public.vehicle_gps_events enable row level security;

-- =========================
-- REMOVE OLD POLICIES SAFELY
-- =========================

drop policy if exists "Authenticated users can view gps devices" on public.vehicle_gps_devices;
drop policy if exists "Authenticated users can insert gps devices" on public.vehicle_gps_devices;
drop policy if exists "Authenticated users can update gps devices" on public.vehicle_gps_devices;
drop policy if exists "Authenticated users can delete gps devices" on public.vehicle_gps_devices;

drop policy if exists "Authenticated users can view latest locations" on public.vehicle_latest_locations;
drop policy if exists "Authenticated users can insert latest locations" on public.vehicle_latest_locations;
drop policy if exists "Authenticated users can update latest locations" on public.vehicle_latest_locations;
drop policy if exists "Authenticated users can delete latest locations" on public.vehicle_latest_locations;

drop policy if exists "Authenticated users can view location history" on public.vehicle_location_history;
drop policy if exists "Authenticated users can insert location history" on public.vehicle_location_history;
drop policy if exists "Authenticated users can update location history" on public.vehicle_location_history;
drop policy if exists "Authenticated users can delete location history" on public.vehicle_location_history;

drop policy if exists "Authenticated users can view gps events" on public.vehicle_gps_events;
drop policy if exists "Authenticated users can insert gps events" on public.vehicle_gps_events;
drop policy if exists "Authenticated users can update gps events" on public.vehicle_gps_events;
drop policy if exists "Authenticated users can delete gps events" on public.vehicle_gps_events;

-- =========================
-- BASIC CRM RLS POLICIES
-- Only logged-in CRM users can access
-- =========================

create policy "Authenticated users can view gps devices"
on public.vehicle_gps_devices
for select
to authenticated
using (true);

create policy "Authenticated users can insert gps devices"
on public.vehicle_gps_devices
for insert
to authenticated
with check (true);

create policy "Authenticated users can update gps devices"
on public.vehicle_gps_devices
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete gps devices"
on public.vehicle_gps_devices
for delete
to authenticated
using (true);


create policy "Authenticated users can view latest locations"
on public.vehicle_latest_locations
for select
to authenticated
using (true);

create policy "Authenticated users can insert latest locations"
on public.vehicle_latest_locations
for insert
to authenticated
with check (true);

create policy "Authenticated users can update latest locations"
on public.vehicle_latest_locations
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete latest locations"
on public.vehicle_latest_locations
for delete
to authenticated
using (true);


create policy "Authenticated users can view location history"
on public.vehicle_location_history
for select
to authenticated
using (true);

create policy "Authenticated users can insert location history"
on public.vehicle_location_history
for insert
to authenticated
with check (true);

create policy "Authenticated users can update location history"
on public.vehicle_location_history
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete location history"
on public.vehicle_location_history
for delete
to authenticated
using (true);


create policy "Authenticated users can view gps events"
on public.vehicle_gps_events
for select
to authenticated
using (true);

create policy "Authenticated users can insert gps events"
on public.vehicle_gps_events
for insert
to authenticated
with check (true);

create policy "Authenticated users can update gps events"
on public.vehicle_gps_events
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete gps events"
on public.vehicle_gps_events
for delete
to authenticated
using (true);