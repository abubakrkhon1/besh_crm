-- Complete the manager-to-agent assignment boundary without changing the
-- existing lead pipeline or application workflow.

alter table public.leads
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by_profile_id uuid
    references public.profiles(id) on delete set null;

create index if not exists leads_assigned_by_profile_id_idx
  on public.leads(assigned_by_profile_id)
  where assigned_by_profile_id is not null;

-- Preserve visibility for older assigned leads that predate the manager field.
update public.leads as lead
set sales_manager_profile_id = agent.manager_profile_id
from public.profiles as agent
where lead.sales_manager_profile_id is null
  and lead.assigned_to_profile_id = agent.id
  and agent.role::text = 'sales_agent'
  and agent.manager_profile_id is not null;

-- Backfill metadata for leads that were already assigned before this migration.
update public.leads
set
  assigned_at = coalesce(assigned_at, created_at),
  assigned_by_profile_id = coalesce(assigned_by_profile_id, created_by_profile_id)
where assigned_to_profile_id is not null
  and (assigned_at is null or assigned_by_profile_id is null);

create or replace function public.set_lead_assignment_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to_profile_id is not null then
      if auth.role() = 'service_role' then
        new.assigned_at = coalesce(new.assigned_at, now());
        new.assigned_by_profile_id = coalesce(new.assigned_by_profile_id, new.created_by_profile_id);
      else
        new.assigned_at = now();
        new.assigned_by_profile_id = new.created_by_profile_id;
      end if;
    else
      new.assigned_at = null;
      new.assigned_by_profile_id = null;
    end if;
  elsif new.assigned_to_profile_id is distinct from old.assigned_to_profile_id then
    if new.assigned_to_profile_id is null then
      new.assigned_at = null;
      new.assigned_by_profile_id = null;
    else
      new.assigned_at = now();
      new.assigned_by_profile_id = case
        when auth.role() = 'service_role' then new.assigned_by_profile_id
        else public.current_profile_id()
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_lead_assignment_metadata on public.leads;
create trigger set_lead_assignment_metadata
before insert or update on public.leads
for each row
execute function public.set_lead_assignment_metadata();

-- A sales agent can never change lead ownership. Managers may change the
-- assignee, but not the manager/creator hierarchy fields.
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

  if new.assigned_to_profile_id is not distinct from old.assigned_to_profile_id
     and (
       new.assigned_at is distinct from old.assigned_at
       or new.assigned_by_profile_id is distinct from old.assigned_by_profile_id
     ) then
    raise exception 'Assignment metadata cannot be changed directly';
  end if;

  if not public.has_full_crm_access()
     and new.sales_manager_profile_id is distinct from old.sales_manager_profile_id then
    raise exception 'Full CRM access is required to change a lead manager';
  end if;

  if public.current_user_role() = 'sales_agent'
     and new.assigned_to_profile_id is distinct from old.assigned_to_profile_id then
    raise exception 'Sales agents cannot reassign leads';
  end if;

  return new;
end;
$$;

-- Managers see leads owned by their manager row. Agents see only leads currently
-- assigned to them. Full-access CRM roles remain unchanged.
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
    when public.current_user_role() = 'sales_agent' then
      lead_assigned_to = public.current_profile_id()
    else false
  end;
$$;

-- Managers may edit their unassigned leads and leads assigned to one of their
-- direct reports. This is what permits safe assignment and reassignment.
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
      and (
        lead_assigned_to is null
        or public.is_direct_report(lead_assigned_to)
      )
    when public.current_user_role() = 'sales_agent' then
      lead_assigned_to = public.current_profile_id()
      and lead_manager is not distinct from (
        select manager_profile_id
        from public.profiles
        where id = public.current_profile_id()
      )
    else false
  end;
$$;

revoke all on function public.can_view_lead(uuid, uuid, uuid) from public;
revoke all on function public.can_update_lead(uuid, uuid, uuid) from public;
grant execute on function public.can_view_lead(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_update_lead(uuid, uuid, uuid) to authenticated;

-- A manager should only be able to list agents who report directly to them.
drop policy if exists profiles_role_select on public.profiles;

create policy profiles_role_select
on public.profiles
for select
to authenticated
using (
  id = public.current_profile_id()
  or public.has_full_crm_access()
  or (
    public.current_user_role() = 'sales_manager'
    and role::text = 'sales_agent'
    and manager_profile_id = public.current_profile_id()
  )
);
