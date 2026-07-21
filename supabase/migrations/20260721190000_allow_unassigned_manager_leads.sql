-- Managers can add leads before representative assignment exists.
alter table public.leads
  alter column assigned_to_profile_id drop not null;

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
      and lead_assigned_to is null
      and lead_manager = public.current_profile_id()
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

revoke all on function public.can_insert_lead(uuid, uuid, uuid) from public;
grant execute on function public.can_insert_lead(uuid, uuid, uuid) to authenticated;
