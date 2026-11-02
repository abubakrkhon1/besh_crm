create or replace function public.lead_workspace_summary(
  p_representative_id uuid default null,
  p_range_start timestamptz default null,
  p_range_end timestamptz default null,
  p_search text default null,
  p_status text default null,
  p_source text default null,
  p_account_type text default null,
  p_follow_up text default null,
  p_now timestamptz default now(),
  p_next_day_start timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as materialized (
    select
      leads.status,
      leads.source,
      leads.assigned_to_profile_id,
      leads.next_follow_up_at
    from public.leads
    where (p_representative_id is null or leads.assigned_to_profile_id = p_representative_id)
      and (p_range_start is null or leads.created_at >= p_range_start)
      and (p_range_end is null or leads.created_at < p_range_end)
      and (p_status is null or leads.status = p_status)
      and (p_source is null or leads.source = p_source)
      and (p_account_type is null or leads.account_type::text = p_account_type)
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', leads.company_name, leads.contact_first_name, leads.contact_last_name, leads.email, leads.phone)
          ilike '%' || p_search || '%'
      )
      and (
        p_follow_up is null
        or (
          leads.status in ('new', 'on_the_process', 'follow_up')
          and case p_follow_up
            when 'unscheduled' then leads.next_follow_up_at is null
            when 'overdue' then leads.next_follow_up_at < p_now
            when 'today' then leads.next_follow_up_at >= p_now and leads.next_follow_up_at < p_next_day_start
            when 'upcoming' then leads.next_follow_up_at >= p_next_day_start
            else false
          end
        )
      )
  ), status_totals as (
    select
      count(*) as total,
      count(*) filter (where status = 'new') as new_count,
      count(*) filter (where status = 'on_the_process') as process_count,
      count(*) filter (where status = 'follow_up') as follow_up_count,
      count(*) filter (where status = 'successful') as successful_count,
      count(*) filter (where status = 'deal_lost') as lost_count,
      count(*) filter (where status in ('new', 'on_the_process', 'follow_up') and next_follow_up_at is null) as unscheduled_count,
      count(*) filter (where status in ('new', 'on_the_process', 'follow_up') and next_follow_up_at < p_now) as overdue_count,
      count(*) filter (where status in ('new', 'on_the_process', 'follow_up') and next_follow_up_at >= p_now and next_follow_up_at < p_next_day_start) as today_count,
      count(*) filter (where status in ('new', 'on_the_process', 'follow_up') and next_follow_up_at >= p_next_day_start) as upcoming_count
    from filtered
  ), source_totals as (
    select coalesce(jsonb_agg(jsonb_build_object('source', source, 'count', source_count) order by source_count desc, source), '[]'::jsonb) as rows
    from (select source, count(*) as source_count from filtered group by source order by source_count desc, source limit 6) ranked_sources
  ), representative_totals as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile_id,
      'name', coalesce(profile_name, profile_email, 'Unassigned'),
      'count', successful_count
    ) order by successful_count desc, coalesce(profile_name, profile_email, 'Unassigned')), '[]'::jsonb) as rows
    from (
      select
        filtered.assigned_to_profile_id as profile_id,
        profiles.full_name as profile_name,
        profiles.email as profile_email,
        count(*) as successful_count
      from filtered
      left join public.profiles on profiles.id = filtered.assigned_to_profile_id
      where filtered.status = 'successful'
      group by filtered.assigned_to_profile_id, profiles.full_name, profiles.email
      order by successful_count desc
      limit 5
    ) ranked_representatives
  )
  select jsonb_build_object(
    'total', status_totals.total,
    'status_counts', jsonb_build_object(
      'new', status_totals.new_count,
      'on_the_process', status_totals.process_count,
      'follow_up', status_totals.follow_up_count,
      'successful', status_totals.successful_count,
      'deal_lost', status_totals.lost_count
    ),
    'follow_up_counts', jsonb_build_object(
      'overdue', status_totals.overdue_count,
      'today', status_totals.today_count,
      'upcoming', status_totals.upcoming_count,
      'unscheduled', status_totals.unscheduled_count
    ),
    'sources', source_totals.rows,
    'top_representatives', representative_totals.rows
  )
  from status_totals cross join source_totals cross join representative_totals;
$$;

revoke all on function public.lead_workspace_summary(uuid, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.lead_workspace_summary(uuid, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz) to authenticated;
