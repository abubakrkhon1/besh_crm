-- WEX customers and transaction synchronization.
alter table public.customers add column if not exists wex_carrier_id text;
alter table public.customers add column if not exists wex_company_xref text;
alter table public.customers add column if not exists provider text;
alter table public.customers add column if not exists last_synced_at timestamptz;
create unique index if not exists customers_wex_carrier_id_unique
  on public.customers(wex_carrier_id) where wex_carrier_id is not null;
create index if not exists customers_wex_company_xref_idx on public.customers(wex_company_xref);

alter table public.fuel_transactions add column if not exists provider text;
alter table public.fuel_transactions add column if not exists provider_transaction_id text;
alter table public.fuel_transactions add column if not exists provider_transaction_type text;
alter table public.fuel_transactions add column if not exists wex_carrier_id text;
alter table public.fuel_transactions add column if not exists company_xref text;
alter table public.fuel_transactions add column if not exists merchant_state text;
alter table public.fuel_transactions add column if not exists last_synced_at timestamptz not null default now();
create unique index if not exists fuel_transactions_provider_id_unique
  on public.fuel_transactions(provider, provider_transaction_id);
create index if not exists fuel_transactions_wex_carrier_idx on public.fuel_transactions(wex_carrier_id);

alter table public.fuel_card_sync_runs add column if not exists customers_received integer not null default 0;
alter table public.fuel_card_sync_runs add column if not exists transactions_received integer not null default 0;
