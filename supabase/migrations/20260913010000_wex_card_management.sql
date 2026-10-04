-- Audited WEX card management. Provider writes are performed only by trusted
-- server code; CRM users receive read-only access to the operation history.

alter table public.fuel_cards
  add column if not exists refreshing_limit_source text,
  add column if not exists daily_transaction_limit integer,
  add column if not exists weekly_transaction_limit integer,
  add column if not exists monthly_transaction_limit integer;

create table if not exists public.fuel_card_operations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'wex_efs',
  fuel_card_id uuid references public.fuel_cards(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  operation_type text not null check (operation_type in ('freeze', 'unfreeze', 'set_limits', 'issue')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'succeeded', 'failed', 'needs_attention')),
  idempotency_key uuid not null unique,
  request_summary jsonb not null default '{}'::jsonb,
  previous_state jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  provider_reference text,
  error_code text,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists fuel_card_operations_card_requested_idx
  on public.fuel_card_operations(fuel_card_id, requested_at desc);
create index if not exists fuel_card_operations_customer_requested_idx
  on public.fuel_card_operations(customer_id, requested_at desc);
create index if not exists fuel_card_operations_status_requested_idx
  on public.fuel_card_operations(status, requested_at desc);

alter table public.fuel_card_operations enable row level security;

drop policy if exists fuel_card_operations_management_select on public.fuel_card_operations;
create policy fuel_card_operations_management_select
on public.fuel_card_operations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active
      and profiles.role in ('owner', 'general_manager')
  )
);

revoke all on table public.fuel_card_operations from public, anon, authenticated;
grant select on table public.fuel_card_operations to authenticated;
grant all on table public.fuel_card_operations to service_role;

comment on table public.fuel_card_operations is
  'Append-only audit trail for provider-backed fuel card status, limit, and issuance operations.';
comment on column public.fuel_card_operations.request_summary is
  'Non-secret request details only. Full card numbers and complete street addresses must never be stored here.';
