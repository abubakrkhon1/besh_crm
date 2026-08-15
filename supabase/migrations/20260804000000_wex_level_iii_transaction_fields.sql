-- Preserve useful WEX Level III transaction details without storing full card numbers.
alter table public.fuel_transactions add column if not exists authorization_code text;
alter table public.fuel_transactions add column if not exists invoice_number text;
alter table public.fuel_transactions add column if not exists contract_id integer;
alter table public.fuel_transactions add column if not exists billing_currency text;
alter table public.fuel_transactions add column if not exists funded_total numeric(12,2);
alter table public.fuel_transactions add column if not exists settled_amount numeric(12,2);
alter table public.fuel_transactions add column if not exists preferred_total numeric(12,2);
alter table public.fuel_transactions add column if not exists fees_total numeric(12,2) not null default 0;
alter table public.fuel_transactions add column if not exists pre_discount_tax numeric(12,2);
alter table public.fuel_transactions add column if not exists post_discount_tax numeric(12,2);
alter table public.fuel_transactions add column if not exists tax_exempt_amount numeric(12,2);
alter table public.fuel_transactions add column if not exists wex_location_id text;
alter table public.fuel_transactions add column if not exists merchant_city text;
alter table public.fuel_transactions add column if not exists merchant_zip text;
alter table public.fuel_transactions add column if not exists merchant_country text;
alter table public.fuel_transactions add column if not exists merchant_latitude text;
alter table public.fuel_transactions add column if not exists merchant_longitude text;
alter table public.fuel_transactions add column if not exists entry_mode text;
alter table public.fuel_transactions add column if not exists hand_entered boolean not null default false;
alter table public.fuel_transactions add column if not exists original_transaction_id text;
alter table public.fuel_transactions add column if not exists statement_id text;
alter table public.fuel_transactions add column if not exists prompt_values jsonb not null default '[]'::jsonb;
alter table public.fuel_transactions add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table public.fuel_transactions add column if not exists taxes jsonb not null default '[]'::jsonb;

create index if not exists fuel_transactions_contract_id_idx on public.fuel_transactions(contract_id);
create index if not exists fuel_transactions_wex_location_id_idx on public.fuel_transactions(wex_location_id);
