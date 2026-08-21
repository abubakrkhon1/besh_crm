-- Durable WEX driver identities and secure mobile-account onboarding.
-- WEX synchronization creates operational driver rows, but never Auth users.

alter table public.drivers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provider text not null default 'internal',
  add column if not exists external_driver_id text,
  add column if not exists display_name text,
  add column if not exists provider_status text,
  add column if not exists onboarding_status text not null default 'unclaimed',
  add column if not exists invited_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_seen_at timestamptz;

alter table public.drivers
  drop constraint if exists drivers_onboarding_status_check;

alter table public.drivers
  add constraint drivers_onboarding_status_check
  check (onboarding_status in ('unclaimed', 'invited', 'active', 'disabled'));

create unique index if not exists drivers_auth_user_id_unique
  on public.drivers(auth_user_id)
  where auth_user_id is not null;

-- WEX driver IDs are scoped to a carrier/customer, not assumed globally unique.
create unique index if not exists drivers_provider_customer_external_unique
  on public.drivers(provider, customer_id, external_driver_id)
  where external_driver_id is not null;

create index if not exists drivers_external_driver_id_idx
  on public.drivers(provider, external_driver_id)
  where external_driver_id is not null;

create index if not exists drivers_onboarding_status_idx
  on public.drivers(onboarding_status, customer_id);

create table if not exists public.driver_invitations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  recipient_email text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivery_failed', 'claimed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by_auth_user_id uuid references auth.users(id) on delete set null,
  delivery_provider_id text,
  delivery_error text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_invitations_driver_created_idx
  on public.driver_invitations(driver_id, created_at desc);

create index if not exists driver_invitations_active_idx
  on public.driver_invitations(driver_id, expires_at)
  where status in ('pending', 'sent', 'delivery_failed');

drop trigger if exists driver_invitations_set_updated_at on public.driver_invitations;
create trigger driver_invitations_set_updated_at
before update on public.driver_invitations
for each row execute function public.set_updated_at();

alter table public.driver_invitations enable row level security;

drop policy if exists driver_invitations_crm_all on public.driver_invitations;
create policy driver_invitations_crm_all
on public.driver_invitations
for all
to authenticated
using (public.has_full_crm_access())
with check (public.has_full_crm_access());

-- Drivers may read only their own operational identity. Writes remain service
-- controlled so a mobile user cannot change customer/auth ownership.
drop policy if exists drivers_mobile_select_own on public.drivers;
create policy drivers_mobile_select_own
on public.drivers
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and onboarding_status = 'active'
  and status = 'active'
);

drop policy if exists fuel_cards_mobile_select_own on public.fuel_cards;
create policy fuel_cards_mobile_select_own
on public.fuel_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers driver
    where driver.id = fuel_cards.driver_id
      and driver.auth_user_id = auth.uid()
      and driver.onboarding_status = 'active'
      and driver.status = 'active'
  )
);

drop policy if exists fuel_transactions_mobile_select_own on public.fuel_transactions;
create policy fuel_transactions_mobile_select_own
on public.fuel_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers driver
    where driver.id = fuel_transactions.driver_id
      and driver.auth_user_id = auth.uid()
      and driver.onboarding_status = 'active'
      and driver.status = 'active'
  )
);

-- Materialize WEX card identities as driver rows and repair card/transaction
-- foreign keys. The input timestamp scopes the operation to one completed card
-- snapshot, keeping retries idempotent and avoiding stale-card resurrection.
create or replace function public.reconcile_wex_driver_profiles(p_synchronized_at timestamptz)
returns table(drivers_upserted integer, cards_linked integer, transactions_linked integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drivers integer := 0;
  v_cards integer := 0;
  v_transactions integer := 0;
begin
  with source_cards as (
    select
      card.customer_id,
      card.external_driver_id,
      coalesce(nullif(btrim(max(card.driver_name)), ''), 'Driver ' || card.external_driver_id) as display_name,
      case when bool_or(lower(card.status) = 'active') then 'active' else 'inactive' end as provider_status
    from public.fuel_cards card
    where card.provider = 'wex_efs'
      and card.customer_id is not null
      and nullif(btrim(card.external_driver_id), '') is not null
      and card.last_synced_at = p_synchronized_at
    group by card.customer_id, card.external_driver_id
  ), upserted as (
    insert into public.drivers (
      customer_id,
      first_name,
      last_name,
      display_name,
      provider,
      external_driver_id,
      provider_status,
      status,
      last_synced_at,
      last_seen_at
    )
    select
      source.customer_id,
      split_part(source.display_name, ' ', 1),
      case
        when position(' ' in source.display_name) > 0
          then btrim(substr(source.display_name, position(' ' in source.display_name) + 1))
        else ''
      end,
      source.display_name,
      'wex_efs',
      source.external_driver_id,
      source.provider_status,
      source.provider_status,
      p_synchronized_at,
      p_synchronized_at
    from source_cards source
    on conflict (provider, customer_id, external_driver_id)
      where external_driver_id is not null
    do update set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      provider_status = excluded.provider_status,
      status = case
        when drivers.status = 'suspended' then drivers.status
        else excluded.status
      end,
      last_synced_at = excluded.last_synced_at,
      last_seen_at = excluded.last_seen_at,
      updated_at = now()
    returning 1
  )
  select count(*)::integer into v_drivers from upserted;

  with linked as (
    update public.fuel_cards card
    set driver_id = driver.id,
        updated_at = now()
    from public.drivers driver
    where card.provider = 'wex_efs'
      and card.last_synced_at = p_synchronized_at
      and driver.provider = card.provider
      and driver.customer_id = card.customer_id
      and driver.external_driver_id = card.external_driver_id
      and card.driver_id is distinct from driver.id
    returning 1
  )
  select count(*)::integer into v_cards from linked;

  with linked as (
    update public.fuel_transactions transaction
    set driver_id = card.driver_id
    from public.fuel_cards card
    where transaction.fuel_card_id = card.id
      and card.driver_id is not null
      and transaction.driver_id is distinct from card.driver_id
    returning 1
  )
  select count(*)::integer into v_transactions from linked;

  return query select v_drivers, v_cards, v_transactions;
end;
$$;

revoke all on function public.reconcile_wex_driver_profiles(timestamptz) from public;
revoke all on function public.reconcile_wex_driver_profiles(timestamptz) from anon;
revoke all on function public.reconcile_wex_driver_profiles(timestamptz) from authenticated;
grant execute on function public.reconcile_wex_driver_profiles(timestamptz) to service_role;

revoke all on table public.driver_invitations from anon;
grant select, insert, update, delete on table public.driver_invitations to authenticated;
grant all on table public.driver_invitations to service_role;
