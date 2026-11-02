-- Keep dashboard metrics exact without transferring every visible lead to the app.
drop function if exists public.sales_manager_dashboard(timestamptz, timestamptz);

create function public.sales_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  total_agents bigint,
  total_leads bigint,
  new_leads bigint,
  in_process_leads bigint,
  follow_up_leads bigint,
  successful_leads bigint,
  deal_lost_leads bigint,
  accepted_leads bigint,
  estimated_monthly_gallons numeric,
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
  with totals as (
    select
      count(*) as total,
      count(*) filter (where status = 'new') as new_count,
      count(*) filter (where status = 'on_the_process') as in_process_count,
      count(*) filter (where status = 'follow_up') as follow_up_count,
      count(*) filter (where status = 'successful') as successful_count,
      count(*) filter (where status = 'deal_lost') as deal_lost_count,
      count(*) filter (where status in ('on_the_process', 'follow_up', 'successful')) as accepted_count,
      coalesce(sum(estimated_monthly_gallons), 0) as estimated_gallons
    from public.leads
    where created_at >= range_start
      and created_at < range_end
  )
  select
    (select count(*)
     from public.profiles
     where role::text = 'sales_agent'
       and is_active),
    totals.total,
    totals.new_count,
    totals.in_process_count,
    totals.follow_up_count,
    totals.successful_count,
    totals.deal_lost_count,
    totals.accepted_count,
    totals.estimated_gallons,
    case
      when totals.total = 0 then 0
      else round((totals.successful_count::numeric / totals.total::numeric) * 100, 1)
    end
  from totals;
end;
$$;

revoke all on function public.sales_manager_dashboard(timestamptz, timestamptz) from public;
grant execute on function public.sales_manager_dashboard(timestamptz, timestamptz) to authenticated;

create or replace function public.sales_agent_dashboard()
returns table (
  total_leads bigint,
  new_leads bigint,
  in_process_leads bigint,
  follow_up_leads bigint,
  successful_leads bigint,
  deal_lost_leads bigint,
  estimated_monthly_gallons numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if public.current_user_role() <> 'sales_agent' then
    raise exception 'Sales Agent access required' using errcode = '42501';
  end if;

  return query
  select
    count(*),
    count(*) filter (where status = 'new'),
    count(*) filter (where status = 'on_the_process'),
    count(*) filter (where status = 'follow_up'),
    count(*) filter (where status = 'successful'),
    count(*) filter (where status = 'deal_lost'),
    coalesce(sum(estimated_monthly_gallons), 0)
  from public.leads;
end;
$$;

revoke all on function public.sales_agent_dashboard() from public;
grant execute on function public.sales_agent_dashboard() to authenticated;

create or replace function public.sales_manager_agent_performance(
  range_start timestamptz,
  range_end timestamptz
)
returns table (
  profile_id uuid,
  total_leads bigint,
  accepted_leads bigint,
  successful_leads bigint,
  estimated_monthly_gallons numeric,
  last_activity timestamptz
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
  select
    leads.assigned_to_profile_id,
    count(*),
    count(*) filter (where leads.status in ('on_the_process', 'follow_up', 'successful')),
    count(*) filter (where leads.status = 'successful'),
    coalesce(sum(leads.estimated_monthly_gallons), 0),
    max(leads.updated_at)
  from public.leads
  where leads.created_at >= range_start
    and leads.created_at < range_end
  group by leads.assigned_to_profile_id;
end;
$$;

revoke all on function public.sales_manager_agent_performance(timestamptz, timestamptz) from public;
grant execute on function public.sales_manager_agent_performance(timestamptz, timestamptz) to authenticated;
