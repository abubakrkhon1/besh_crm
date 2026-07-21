-- Baseline for the CRM objects that predate the WEX synchronization migrations.
-- This intentionally excludes the discarded One Step GPS migration.

create type public.user_role as enum (
  'owner',
  'admin',
  'general_manager',
  'sales_manager',
  'sales_representative',
  'accounting',
  'compliance',
  'support',
  'marketing'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'driver'
    check (role in ('admin', 'driver', 'viewer')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = user_id
      and role = 'admin'
  );
$$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  company_legal_name text not null,
  doing_business_as text,
  business_phone text not null,
  first_name text not null,
  last_name text not null,
  title text not null,
  email text not null,
  country text not null,
  business_physical_address text not null,
  address_line_2 text,
  city text not null,
  state_province text not null,
  postal_code text not null,
  total_trucks integer not null,
  total_drivers integer not null,
  team_drivers_slip_seat boolean default false,
  legal_structure text not null,
  business_description text not null,
  year_established integer not null,
  parent_company text,
  promotional_code text,
  taxpayer_id text not null,
  business_identifier_type text,
  business_identifier_number text,
  annual_gross_revenue numeric,
  industry text not null,
  account_type text not null,
  projected_spend numeric not null,
  payment_method text not null,
  days_of_payment text,
  financial_institution text not null,
  checking_account_number text not null,
  aba_routing_number text not null,
  residential_country text not null,
  residential_address text not null,
  residential_city text not null,
  residential_state_province text not null,
  residential_postal_code text not null,
  social_security_number text not null,
  date_of_birth date not null,
  residential_phone text not null,
  mobile_number text,
  authorized_signer boolean not null default false,
  terms_accepted boolean not null default false,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  denial_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  type text not null default 'company' check (type in ('individual', 'company')),
  company_name text,
  contact_name text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'pending', 'suspended', 'closed')),
  current_balance numeric(12,2) not null default 0,
  monthly_spend numeric(12,2) not null default 0,
  lifetime_spend numeric(12,2) not null default 0,
  credit_limit numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  license_number text,
  license_state text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fuel_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  card_last4 text not null,
  card_token text unique,
  provider text default 'internal',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'frozen', 'cancelled', 'expired')),
  daily_limit numeric(12,2) not null default 0,
  weekly_limit numeric(12,2) not null default 0,
  monthly_limit numeric(12,2) not null default 0,
  gallon_limit numeric(12,2) not null default 0,
  issued_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fuel_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  fuel_card_id uuid references public.fuel_cards(id) on delete set null,
  type text not null check (type in ('fuel_purchase', 'payment', 'refund', 'fee', 'adjustment')),
  status text not null default 'posted' check (status in ('pending', 'posted', 'declined', 'reversed')),
  merchant_name text,
  merchant_address text,
  gallons numeric(10,3),
  amount numeric(12,2) not null,
  savings numeric(12,2) not null default 0,
  transaction_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger set_drivers_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

create trigger set_fuel_cards_updated_at
before update on public.fuel_cards
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.customers enable row level security;
alter table public.drivers enable row level security;
alter table public.fuel_cards enable row level security;
alter table public.fuel_transactions enable row level security;

create policy profiles_self_select on public.profiles
for select to authenticated
using (auth_user_id = auth.uid() or public.is_admin(auth.uid()));

create policy applications_admin_all on public.applications
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy customers_admin_all on public.customers
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy drivers_admin_all on public.drivers
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy fuel_cards_admin_all on public.fuel_cards
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy fuel_transactions_admin_all on public.fuel_transactions
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
