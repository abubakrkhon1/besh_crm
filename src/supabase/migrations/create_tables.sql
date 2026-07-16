-- =====================================================
-- Fuel CRM Core Tables + RLS + Realtime
-- =====================================================

create extension if not exists "pgcrypto";

-- =====================================================
-- Admin helper
-- =====================================================

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
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

grant execute on function public.is_admin(uuid) to authenticated;

-- =====================================================
-- updated_at helper
-- =====================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================
-- Customers
-- =====================================================

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),

  auth_user_id uuid references auth.users(id) on delete set null,

  type text not null default 'company'
    check (type in ('individual', 'company')),

  company_name text,
  contact_name text,
  email text,
  phone text,

  status text not null default 'active'
    check (status in ('active', 'pending', 'suspended', 'closed')),

  current_balance numeric(12,2) not null default 0,
  monthly_spend numeric(12,2) not null default 0,
  lifetime_spend numeric(12,2) not null default 0,
  credit_limit numeric(12,2) not null default 0,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);
create index if not exists customers_email_idx on public.customers(lower(email));
create index if not exists customers_status_idx on public.customers(status);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

-- =====================================================
-- Drivers
-- =====================================================

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.customers(id) on delete cascade,

  first_name text not null,
  last_name text not null,
  email text,
  phone text,

  license_number text,
  license_state text,

  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drivers_customer_id_idx on public.drivers(customer_id);
create index if not exists drivers_email_idx on public.drivers(lower(email));
create index if not exists drivers_status_idx on public.drivers(status);

drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at
before update on public.drivers
for each row
execute function public.set_updated_at();

-- =====================================================
-- Fuel Cards
-- =====================================================

create table if not exists public.fuel_cards (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.customers(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,

  card_last4 text not null,
  card_token text unique,
  provider text,

  status text not null default 'pending'
    check (status in ('pending', 'active', 'frozen', 'cancelled', 'replaced')),

  daily_limit numeric(12,2) not null default 0,
  weekly_limit numeric(12,2) not null default 0,
  monthly_limit numeric(12,2) not null default 0,
  gallon_limit numeric(12,2) not null default 0,

  issued_at timestamptz,
  activated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fuel_cards_customer_id_idx on public.fuel_cards(customer_id);
create index if not exists fuel_cards_driver_id_idx on public.fuel_cards(driver_id);
create index if not exists fuel_cards_status_idx on public.fuel_cards(status);
create index if not exists fuel_cards_last4_idx on public.fuel_cards(card_last4);

drop trigger if exists set_fuel_cards_updated_at on public.fuel_cards;
create trigger set_fuel_cards_updated_at
before update on public.fuel_cards
for each row
execute function public.set_updated_at();

-- =====================================================
-- Fuel Card Restrictions
-- =====================================================

create table if not exists public.fuel_card_restrictions (
  id uuid primary key default gen_random_uuid(),

  fuel_card_id uuid not null references public.fuel_cards(id) on delete cascade,

  fuel_only boolean not null default true,
  allow_def boolean not null default true,
  allow_maintenance boolean not null default false,

  allowed_states text[],
  blocked_states text[],
  allowed_merchants text[],
  blocked_merchants text[],

  start_time time,
  end_time time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fuel_card_restrictions_card_unique
on public.fuel_card_restrictions(fuel_card_id);

drop trigger if exists set_fuel_card_restrictions_updated_at on public.fuel_card_restrictions;
create trigger set_fuel_card_restrictions_updated_at
before update on public.fuel_card_restrictions
for each row
execute function public.set_updated_at();

-- =====================================================
-- Fuel Transactions
-- Named fuel_transactions to avoid conflicts with existing transactions table
-- =====================================================

create table if not exists public.fuel_transactions (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.customers(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  fuel_card_id uuid references public.fuel_cards(id) on delete set null,

  type text not null
    check (type in ('fuel_purchase', 'payment', 'refund', 'fee', 'adjustment')),

  status text not null default 'posted'
    check (status in ('pending', 'posted', 'declined', 'reversed')),

  merchant_name text,
  merchant_address text,

  gallons numeric(10,3),
  amount numeric(12,2) not null,
  savings numeric(12,2) not null default 0,

  transaction_date timestamptz not null default now(),

  created_at timestamptz not null default now()
);

create index if not exists fuel_transactions_customer_id_idx on public.fuel_transactions(customer_id);
create index if not exists fuel_transactions_driver_id_idx on public.fuel_transactions(driver_id);
create index if not exists fuel_transactions_fuel_card_id_idx on public.fuel_transactions(fuel_card_id);
create index if not exists fuel_transactions_date_idx on public.fuel_transactions(transaction_date desc);
create index if not exists fuel_transactions_status_idx on public.fuel_transactions(status);

-- =====================================================
-- Notes
-- =====================================================

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),

  entity_type text not null
    check (entity_type in ('customer', 'driver', 'fuel_card', 'application', 'transaction')),

  entity_id uuid not null,

  body text not null,
  created_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists notes_entity_idx on public.notes(entity_type, entity_id);
create index if not exists notes_created_by_idx on public.notes(created_by);

-- =====================================================
-- Activity Logs
-- =====================================================

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),

  entity_type text not null
    check (entity_type in ('customer', 'driver', 'fuel_card', 'application', 'transaction')),

  entity_id uuid not null,

  action text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);

-- =====================================================
-- Documents
-- =====================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),

  entity_type text not null
    check (entity_type in ('customer', 'driver', 'fuel_card', 'application')),

  entity_id uuid not null,

  name text not null,
  file_path text not null,
  file_type text,

  uploaded_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists documents_entity_idx on public.documents(entity_type, entity_id);
create index if not exists documents_uploaded_by_idx on public.documents(uploaded_by);

-- =====================================================
-- Enable RLS
-- =====================================================

alter table public.customers enable row level security;
alter table public.drivers enable row level security;
alter table public.fuel_cards enable row level security;
alter table public.fuel_card_restrictions enable row level security;
alter table public.fuel_transactions enable row level security;
alter table public.notes enable row level security;
alter table public.activity_logs enable row level security;
alter table public.documents enable row level security;

-- =====================================================
-- Drop old policies if rerunning migration
-- =====================================================

drop policy if exists customers_admin_all on public.customers;
drop policy if exists drivers_admin_all on public.drivers;
drop policy if exists fuel_cards_admin_all on public.fuel_cards;
drop policy if exists fuel_card_restrictions_admin_all on public.fuel_card_restrictions;
drop policy if exists fuel_transactions_admin_all on public.fuel_transactions;
drop policy if exists notes_admin_all on public.notes;
drop policy if exists activity_logs_admin_all on public.activity_logs;
drop policy if exists documents_admin_all on public.documents;

-- =====================================================
-- Admin-only CRM policies
-- =====================================================

create policy customers_admin_all
on public.customers
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy drivers_admin_all
on public.drivers
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy fuel_cards_admin_all
on public.fuel_cards
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy fuel_card_restrictions_admin_all
on public.fuel_card_restrictions
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy fuel_transactions_admin_all
on public.fuel_transactions
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy notes_admin_all
on public.notes
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy activity_logs_admin_all
on public.activity_logs
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy documents_admin_all
on public.documents
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- =====================================================
-- Optional: customer self-read policy
-- Keep commented for now because CRM is admin-only.
-- Enable later if customers log into their own portal.
-- =====================================================

-- create policy customers_select_own
-- on public.customers
-- for select
-- to authenticated
-- using (auth_user_id = auth.uid());

-- =====================================================
-- Enable realtime
-- =====================================================

alter table public.customers replica identity full;
alter table public.drivers replica identity full;
alter table public.fuel_cards replica identity full;
alter table public.fuel_card_restrictions replica identity full;
alter table public.fuel_transactions replica identity full;
alter table public.notes replica identity full;
alter table public.activity_logs replica identity full;
alter table public.documents replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drivers'
  ) then
    alter publication supabase_realtime add table public.drivers;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fuel_cards'
  ) then
    alter publication supabase_realtime add table public.fuel_cards;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fuel_transactions'
  ) then
    alter publication supabase_realtime add table public.fuel_transactions;
  end if;
end $$;