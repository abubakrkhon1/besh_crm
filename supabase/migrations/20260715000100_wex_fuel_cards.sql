-- WEX/EFS card synchronization. Full card numbers are intentionally not stored.
alter table public.fuel_cards alter column customer_id drop not null;
alter table public.fuel_cards drop constraint if exists fuel_cards_status_check;
alter table public.fuel_cards alter column status set default 'UNKNOWN';
alter table public.fuel_cards add column if not exists provider_card_id text;
alter table public.fuel_cards add column if not exists card_fingerprint text;
alter table public.fuel_cards add column if not exists policy_number text;
alter table public.fuel_cards add column if not exists unit_number text;
alter table public.fuel_cards add column if not exists external_driver_id text;
alter table public.fuel_cards add column if not exists driver_name text;
alter table public.fuel_cards add column if not exists company_xref text;
alter table public.fuel_cards add column if not exists payroll_status text;
alter table public.fuel_cards add column if not exists payroll_use text;
alter table public.fuel_cards add column if not exists is_overridden boolean not null default false;
alter table public.fuel_cards add column if not exists override_code text;
alter table public.fuel_cards add column if not exists gps_id text;
alter table public.fuel_cards add column if not exists vin text;
alter table public.fuel_cards add column if not exists zone_id text;
alter table public.fuel_cards add column if not exists info_source text;
alter table public.fuel_cards add column if not exists policy_subfleet text;
alter table public.fuel_cards add column if not exists card_subfleet text;
alter table public.fuel_cards add column if not exists last_synced_at timestamptz not null default now();
alter table public.fuel_cards alter column provider set default 'wex_efs';

create unique index if not exists fuel_cards_provider_fingerprint_unique on public.fuel_cards(provider, card_fingerprint);
create index if not exists fuel_cards_external_driver_id_idx on public.fuel_cards(external_driver_id);
create index if not exists fuel_cards_unit_number_idx on public.fuel_cards(unit_number);
create index if not exists fuel_cards_last_synced_at_idx on public.fuel_cards(last_synced_at desc);

alter table public.customers add column if not exists wex_external_driver_id text;
create unique index if not exists customers_wex_external_driver_id_unique on public.customers(wex_external_driver_id) where wex_external_driver_id is not null;

create table if not exists public.fuel_card_customer_mappings (
  id uuid primary key default gen_random_uuid(),
  fuel_card_id uuid not null unique references public.fuel_cards(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  external_driver_id text,
  match_method text not null check (match_method in ('external_driver_id', 'manual')),
  match_confidence text not null check (match_confidence in ('high', 'confirmed')),
  is_confirmed boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fuel_card_customer_mappings_customer_idx on public.fuel_card_customer_mappings(customer_id);
create index if not exists fuel_card_customer_mappings_external_driver_idx on public.fuel_card_customer_mappings(external_driver_id);
drop trigger if exists set_fuel_card_customer_mappings_updated_at on public.fuel_card_customer_mappings;
create trigger set_fuel_card_customer_mappings_updated_at before update on public.fuel_card_customer_mappings
for each row execute function public.set_updated_at();

create table if not exists public.fuel_card_sync_runs (
  id uuid primary key default gen_random_uuid(), provider text not null, status text not null,
  started_at timestamptz not null default now(), completed_at timestamptz,
  cards_received integer not null default 0, cards_created integer not null default 0,
  cards_updated integer not null default 0, cards_unmatched integer not null default 0,
  error_message text, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists fuel_card_sync_runs_started_idx on public.fuel_card_sync_runs(started_at desc);

alter table public.fuel_card_customer_mappings enable row level security;
alter table public.fuel_card_sync_runs enable row level security;

-- Replace the old broad fuel-card policy. Provider fields are service-role controlled.
drop policy if exists fuel_cards_admin_all on public.fuel_cards;
create policy fuel_cards_admin_select on public.fuel_cards for select to authenticated using (public.is_admin(auth.uid()));
create policy fuel_card_mappings_admin_select on public.fuel_card_customer_mappings for select to authenticated using (public.is_admin(auth.uid()));
create policy fuel_card_mappings_admin_insert on public.fuel_card_customer_mappings for insert to authenticated with check (public.is_admin(auth.uid()) and is_confirmed and confirmed_by = auth.uid());
create policy fuel_card_mappings_admin_update on public.fuel_card_customer_mappings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()) and is_confirmed and confirmed_by = auth.uid());
create policy fuel_card_mappings_admin_delete on public.fuel_card_customer_mappings for delete to authenticated using (public.is_admin(auth.uid()));
create policy fuel_card_sync_runs_admin_select on public.fuel_card_sync_runs for select to authenticated using (public.is_admin(auth.uid()));

-- No authenticated insert/update/delete policies exist for cards or sync runs.
-- Trusted synchronization bypasses RLS with the server-only service role.
