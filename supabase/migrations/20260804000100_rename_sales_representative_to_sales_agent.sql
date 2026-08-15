-- Rename the CRM sales role without losing existing profile assignments. The
-- guards make this safe to rerun if a migration client did not roll back a
-- previous failed attempt.
do $$
declare
  has_old_role boolean;
  has_new_role boolean;
begin
  select exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
      and e.enumlabel = 'sales_representative'
  ) into has_old_role;

  select exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
      and e.enumlabel = 'sales_agent'
  ) into has_new_role;

  if has_old_role and not has_new_role then
    alter type public.user_role rename value 'sales_representative' to 'sales_agent';
  elsif not has_new_role then
    raise exception 'public.user_role contains neither sales_representative nor sales_agent';
  end if;
end $$;

-- PostgreSQL stores function bodies as text. Recreate any public function that
-- referenced the former enum label so it continues to compile after the rename.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and case
        when p.prokind in ('f', 'p')
          then pg_get_functiondef(p.oid) like '%sales_representative%'
        else false
      end
  loop
    execute replace(
      pg_get_functiondef(function_record.oid),
      'sales_representative',
      'sales_agent'
    );
  end loop;
end $$;

-- Policies that compare role::text contain plain text literals, so enum value
-- renames do not update them automatically.
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
  )
);

-- Rename the sales dashboard's exposed result column as well.
drop function if exists public.sales_manager_dashboard(timestamptz, timestamptz);

create function public.sales_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  total_agents bigint,
  total_leads bigint,
  in_process_leads bigint,
  successful_leads bigint,
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
      count(*) filter (where status = 'on_the_process') as in_process,
      count(*) filter (where status = 'successful') as successful
    from database_leads
  )
  select
    (select count(*)
     from public.profiles
     where role::text = 'sales_agent'
       and is_active),
    totals.total,
    totals.in_process,
    totals.successful,
    case
      when totals.total = 0 then 0
      else round((totals.successful::numeric / totals.total::numeric) * 100, 2)
    end
  from totals;
end;
$$;

revoke all on function public.sales_manager_dashboard(timestamptz, timestamptz) from public;
grant execute on function public.sales_manager_dashboard(timestamptz, timestamptz) to authenticated;
