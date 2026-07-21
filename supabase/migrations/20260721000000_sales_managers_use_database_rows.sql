-- Sales manager pages currently operate on all database rows. Assignment-based
-- scoping can be restored when the representative assignment workflow exists.

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
    when public.current_user_role() = 'sales_manager' then true
    when public.current_user_role() = 'sales_representative' then
      lead_assigned_to = public.current_profile_id()
      or lead_created_by = public.current_profile_id()
    else false
  end;
$$;

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
    and role::text = 'sales_representative'
  )
);

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
begin
  if public.current_user_role() <> 'sales_manager' then
    raise exception 'Sales Manager access required' using errcode = '42501';
  end if;

  if range_start >= range_end then
    raise exception 'range_start must be earlier than range_end' using errcode = '22023';
  end if;

  return query
  with database_leads as (
    select status
    from public.leads
    where created_at >= range_start
      and created_at < range_end
  ), totals as (
    select
      count(*) as total,
      count(*) filter (where status in ('accepted', 'inserted_into_crm')) as accepted,
      count(*) filter (where status = 'inserted_into_crm') as inserted
    from database_leads
  )
  select
    (select count(*)
     from public.profiles
     where role::text = 'sales_representative'
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

revoke all on function public.sales_manager_dashboard(timestamptz, timestamptz) from public;
grant execute on function public.sales_manager_dashboard(timestamptz, timestamptz) to authenticated;
