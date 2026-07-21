-- Sales roles, reporting hierarchy, leads, and row-level security.
--
-- Role source of truth:
--   public.user_role is managed separately and contains owner, admin, driver,
--   general_manager, sales_manager, sales_representative, accounting,
--   compliance, support, and marketing.

-- =====================================================
-- Profile reporting hierarchy
-- =====================================================

alter table public.profiles
  add column if not exists manager_profile_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists department text,
  add column if not exists is_active boolean not null default true;

create index if not exists profiles_auth_user_id_idx
  on public.profiles(auth_user_id);

create index if not exists profiles_manager_profile_id_idx
  on public.profiles(manager_profile_id)
  where manager_profile_id is not null;

create index if not exists profiles_role_active_idx
  on public.profiles(role, is_active);

-- =====================================================
-- Authorization helpers
-- Security definer prevents recursive profiles RLS checks.
-- =====================================================

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.has_any_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(allowed_roles), false);
$$;

create or replace function public.has_full_crm_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(array['owner', 'admin', 'general_manager']);
$$;

create or replace function public.is_direct_report(candidate_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles report
    where report.id = candidate_profile_id
      and report.manager_profile_id = public.current_profile_id()
      and report.role::text = 'sales_representative'
      and report.is_active
  );
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.has_any_role(text[]) from public;
revoke all on function public.has_full_crm_access() from public;
revoke all on function public.is_direct_report(uuid) from public;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.has_full_crm_access() to authenticated;
grant execute on function public.is_direct_report(uuid) to authenticated;

-- Keep existing CRM policies working for every full-access role.
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
      and role::text in ('owner', 'admin', 'general_manager')
      and is_active
  );
$$;

-- =====================================================
-- Leads
-- =====================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  company_name text,
  contact_first_name text not null,
  contact_last_name text not null,
  email text,
  phone text,

  status text not null default 'new'
    check (status in (
      'new',
      'accepted',
      'rejected',
      'inserted_into_crm'
    )),
  source text not null default 'manual',
  notes text,

  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  assigned_to_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  sales_manager_profile_id uuid
    references public.profiles(id) on delete set null,

  application_id uuid
    references public.applications(id) on delete set null,
  customer_id uuid
    references public.customers(id) on delete set null,

  accepted_at timestamptz,
  rejected_at timestamptz,
  inserted_into_crm_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_email_or_phone_required
    check (nullif(btrim(email), '') is not null or nullif(btrim(phone), '') is not null),
  constraint leads_crm_record_required_when_inserted
    check (
      status <> 'inserted_into_crm'
      or application_id is not null
      or customer_id is not null
    )
);

create index if not exists leads_created_by_profile_id_idx
  on public.leads(created_by_profile_id);

create index if not exists leads_assigned_to_profile_id_idx
  on public.leads(assigned_to_profile_id);

create index if not exists leads_sales_manager_profile_id_idx
  on public.leads(sales_manager_profile_id);

create index if not exists leads_status_created_at_idx
  on public.leads(status, created_at desc);

create index if not exists leads_application_id_idx
  on public.leads(application_id)
  where application_id is not null;

create index if not exists leads_customer_id_idx
  on public.leads(customer_id)
  where customer_id is not null;

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

-- Prevent ownership and hierarchy fields from being rewritten after creation.
create or replace function public.protect_lead_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.created_by_profile_id <> old.created_by_profile_id then
    raise exception 'created_by_profile_id cannot be changed';
  end if;

  if not public.has_full_crm_access()
     and new.sales_manager_profile_id is distinct from old.sales_manager_profile_id then
    raise exception 'Full CRM access is required to change a lead manager';
  end if;

  if public.current_user_role() = 'sales_representative'
     and new.assigned_to_profile_id <> old.assigned_to_profile_id then
    raise exception 'Sales representatives cannot reassign leads';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_lead_ownership on public.leads;
create trigger protect_lead_ownership
before update on public.leads
for each row
execute function public.protect_lead_ownership();

-- Automatically maintain status timestamps. Conversion identifiers are written
-- by the application transaction that creates/links the CRM record.
create or replace function public.set_lead_status_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      new.accepted_at = coalesce(new.accepted_at, now());
    elsif new.status = 'rejected' then
      new.rejected_at = coalesce(new.rejected_at, now());
    elsif new.status = 'inserted_into_crm' then
      new.inserted_into_crm_at = coalesce(new.inserted_into_crm_at, now());
    end if;

    return new;
  end if;

  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at = coalesce(new.accepted_at, now());
    new.rejected_at = null;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.rejected_at = coalesce(new.rejected_at, now());
  elsif new.status = 'inserted_into_crm'
        and old.status is distinct from 'inserted_into_crm' then
    new.inserted_into_crm_at = coalesce(new.inserted_into_crm_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_lead_status_timestamps on public.leads;
create trigger set_lead_status_timestamps
before insert or update on public.leads
for each row
execute function public.set_lead_status_timestamps();

-- =====================================================
-- Lead authorization helpers
-- =====================================================

create or replace function public.can_view_lead(
  lead_created_by uuid,
  lead_assigned_to uuid,
  lead_manager uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_full_crm_access() then true
    when public.current_user_role() = 'sales_manager' then
      lead_manager = public.current_profile_id()
      or public.is_direct_report(lead_assigned_to)
      or public.is_direct_report(lead_created_by)
    when public.current_user_role() = 'sales_representative' then
      lead_assigned_to = public.current_profile_id()
      or lead_created_by = public.current_profile_id()
    else false
  end;
$$;

create or replace function public.can_insert_lead(
  lead_created_by uuid,
  lead_assigned_to uuid,
  lead_manager uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_full_crm_access() then
      lead_created_by = public.current_profile_id()
    when public.current_user_role() = 'sales_manager' then
      lead_created_by = public.current_profile_id()
      and lead_manager = public.current_profile_id()
      and public.is_direct_report(lead_assigned_to)
    when public.current_user_role() = 'sales_representative' then
      lead_created_by = public.current_profile_id()
      and lead_assigned_to = public.current_profile_id()
      and lead_manager is not distinct from (
        select manager_profile_id
        from public.profiles
        where id = public.current_profile_id()
      )
    else false
  end;
$$;

create or replace function public.can_update_lead(
  lead_created_by uuid,
  lead_assigned_to uuid,
  lead_manager uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_full_crm_access() then true
    when public.current_user_role() = 'sales_manager' then
      lead_manager = public.current_profile_id()
      and public.is_direct_report(lead_assigned_to)
    when public.current_user_role() = 'sales_representative' then
      lead_created_by = public.current_profile_id()
      and lead_assigned_to = public.current_profile_id()
      and lead_manager is not distinct from (
        select manager_profile_id
        from public.profiles
        where id = public.current_profile_id()
      )
    else false
  end;
$$;

revoke all on function public.can_view_lead(uuid, uuid, uuid) from public;
revoke all on function public.can_insert_lead(uuid, uuid, uuid) from public;
revoke all on function public.can_update_lead(uuid, uuid, uuid) from public;

grant execute on function public.can_view_lead(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_insert_lead(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_update_lead(uuid, uuid, uuid) to authenticated;

-- =====================================================
-- Profiles RLS
-- =====================================================

alter table public.profiles enable row level security;

drop policy if exists profiles_role_select on public.profiles;
drop policy if exists profiles_full_crm_access_all on public.profiles;

create policy profiles_role_select
on public.profiles
for select
to authenticated
using (
  id = public.current_profile_id()
  or public.has_full_crm_access()
  or (
    public.current_user_role() = 'sales_manager'
    and manager_profile_id = public.current_profile_id()
    and role::text = 'sales_representative'
  )
);

create policy profiles_full_crm_access_all
on public.profiles
for all
to authenticated
using (public.has_full_crm_access())
with check (public.has_full_crm_access());

-- =====================================================
-- Leads RLS
-- =====================================================

alter table public.leads enable row level security;

drop policy if exists leads_select_by_hierarchy on public.leads;
drop policy if exists leads_insert_by_hierarchy on public.leads;
drop policy if exists leads_update_by_hierarchy on public.leads;
drop policy if exists leads_delete_by_hierarchy on public.leads;

create policy leads_select_by_hierarchy
on public.leads
for select
to authenticated
using (
  public.can_view_lead(
    created_by_profile_id,
    assigned_to_profile_id,
    sales_manager_profile_id
  )
);

create policy leads_insert_by_hierarchy
on public.leads
for insert
to authenticated
with check (
  public.can_insert_lead(
    created_by_profile_id,
    assigned_to_profile_id,
    sales_manager_profile_id
  )
);

create policy leads_update_by_hierarchy
on public.leads
for update
to authenticated
using (
  public.can_view_lead(
    created_by_profile_id,
    assigned_to_profile_id,
    sales_manager_profile_id
  )
)
with check (
  public.can_update_lead(
    created_by_profile_id,
    assigned_to_profile_id,
    sales_manager_profile_id
  )
);

create policy leads_delete_by_hierarchy
on public.leads
for delete
to authenticated
using (
  public.has_full_crm_access()
  or (
    public.current_user_role() = 'sales_manager'
    and sales_manager_profile_id = public.current_profile_id()
  )
  or (
    public.current_user_role() = 'sales_representative'
    and created_by_profile_id = public.current_profile_id()
    and assigned_to_profile_id = public.current_profile_id()
    and status = 'new'
  )
);

grant select, insert, update, delete on public.leads to authenticated;

-- =====================================================
-- Authorized dashboard aggregates
-- =====================================================

alter table public.customers
  add column if not exists closed_at timestamptz;

create or replace function public.general_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  active_cards bigint,
  gallons_sold numeric,
  customers_joined bigint,
  customers_left bigint,
  total_leads bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.has_full_crm_access() then
    raise exception 'Owner, Admin, or General Manager access required' using errcode = '42501';
  end if;

  if range_start >= range_end then
    raise exception 'range_start must be earlier than range_end' using errcode = '22023';
  end if;

  return query
  select
    (select count(*) from public.fuel_cards where status = 'active'),
    coalesce((
      select sum(gallons)
      from public.fuel_transactions
      where status = 'posted'
        and transaction_date >= range_start
        and transaction_date < range_end
    ), 0),
    (select count(*)
     from public.customers
     where created_at >= range_start
       and created_at < range_end),
    (select count(*)
     from public.customers
     where closed_at >= range_start
       and closed_at < range_end),
    (select count(*)
     from public.leads
     where created_at >= range_start
       and created_at < range_end);
end;
$$;

create or replace function public.sales_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  total_representatives bigint,
  total_leads bigint,
  accepted_leads bigint,
  inserted_leads bigint,
  conversion_rate numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  manager_id uuid := public.current_profile_id();
begin
  if public.current_user_role() <> 'sales_manager' then
    raise exception 'Sales Manager access required' using errcode = '42501';
  end if;

  if range_start >= range_end then
    raise exception 'range_start must be earlier than range_end' using errcode = '22023';
  end if;

  return query
  with manager_leads as (
    select status
    from public.leads
    where sales_manager_profile_id = manager_id
      and created_at >= range_start
      and created_at < range_end
  ), totals as (
    select
      count(*) as total,
      count(*) filter (where status in ('accepted', 'inserted_into_crm')) as accepted,
      count(*) filter (where status = 'inserted_into_crm') as inserted
    from manager_leads
  )
  select
    (select count(*)
     from public.profiles
     where manager_profile_id = manager_id
       and role::text = 'sales_representative'
       and is_active),
    totals.total,
    totals.accepted,
    totals.inserted,
    case
      when totals.total = 0 then 0
      else round((totals.inserted::numeric / totals.total::numeric) * 100, 2)
    end
  from totals;
end;
$$;

revoke all on function public.general_manager_dashboard(timestamptz, timestamptz) from public;
revoke all on function public.sales_manager_dashboard(timestamptz, timestamptz) from public;

grant execute on function public.general_manager_dashboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.sales_manager_dashboard(timestamptz, timestamptz) to authenticated;

-- =====================================================
-- Dashboard query indexes
-- =====================================================

create or replace function public.set_customer_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at = coalesce(new.closed_at, now());
  elsif new.status <> 'closed' and old.status = 'closed' then
    new.closed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_customer_closed_at on public.customers;
create trigger set_customer_closed_at
before update on public.customers
for each row
execute function public.set_customer_closed_at();

create index if not exists fuel_cards_status_dashboard_idx
  on public.fuel_cards(status);

create index if not exists fuel_transactions_posted_date_dashboard_idx
  on public.fuel_transactions(transaction_date desc)
  where status = 'posted';

create index if not exists customers_created_at_dashboard_idx
  on public.customers(created_at desc);

create index if not exists customers_updated_at_dashboard_idx
  on public.customers(updated_at desc);

create index if not exists customers_closed_at_dashboard_idx
  on public.customers(closed_at desc)
  where closed_at is not null;
