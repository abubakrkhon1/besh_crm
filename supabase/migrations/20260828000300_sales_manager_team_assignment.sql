-- Let a sales manager build their own team without exposing or taking agents
-- who already belong to another manager.

create or replace function public.available_sales_agents_for_current_manager()
returns table (
  id uuid,
  full_name text,
  email text,
  department text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'sales_manager' then
    raise exception 'Sales Manager access required' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.email,
    profile.department
  from public.profiles as profile
  where profile.role::text = 'sales_agent'
    and profile.is_active
    and profile.manager_profile_id is null
  order by profile.full_name nulls last, profile.email nulls last;
end;
$$;

create or replace function public.assign_sales_agent_to_current_manager(
  agent_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_id uuid;
begin
  if public.current_user_role() <> 'sales_manager' then
    raise exception 'Sales Manager access required' using errcode = '42501';
  end if;

  manager_id := public.current_profile_id();

  update public.profiles as profile
  set manager_profile_id = manager_id
  where profile.id = agent_profile_id
    and profile.role::text = 'sales_agent'
    and profile.is_active
    and profile.manager_profile_id is null;

  if not found then
    raise exception 'Sales agent is unavailable or already assigned to a manager'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.available_sales_agents_for_current_manager() from public;
revoke all on function public.assign_sales_agent_to_current_manager(uuid) from public;

grant execute on function public.available_sales_agents_for_current_manager() to authenticated;
grant execute on function public.assign_sales_agent_to_current_manager(uuid) to authenticated;
