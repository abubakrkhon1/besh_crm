drop trigger if exists set_lead_status_timestamps on public.leads;
drop function if exists public.set_lead_status_timestamps();

alter table public.leads
  drop constraint if exists leads_status_check,
  drop constraint if exists leads_crm_record_required_when_inserted,
  add column if not exists successful_at timestamptz,
  add column if not exists deal_lost_at timestamptz,
  add column if not exists on_the_process_at timestamptz,
  add column if not exists follow_up_at timestamptz;

update public.leads
set
  successful_at = case
    when status = 'inserted_into_crm' then coalesce(inserted_into_crm_at, updated_at)
    else successful_at
  end,
  deal_lost_at = case
    when status = 'rejected' then coalesce(rejected_at, updated_at)
    else deal_lost_at
  end,
  on_the_process_at = case
    when status = 'accepted' then coalesce(accepted_at, updated_at)
    else on_the_process_at
  end,
  status = case status
    when 'inserted_into_crm' then 'successful'
    when 'rejected' then 'deal_lost'
    when 'accepted' then 'on_the_process'
    else status
  end;

alter table public.leads
  alter column status set default 'new',
  drop column if exists accepted_at,
  drop column if exists rejected_at,
  drop column if exists inserted_into_crm_at,
  add constraint leads_status_check
    check (status in ('new', 'successful', 'deal_lost', 'on_the_process', 'follow_up'));

create function public.set_lead_status_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'successful' then
      new.successful_at = coalesce(new.successful_at, now());
    elsif new.status = 'deal_lost' then
      new.deal_lost_at = coalesce(new.deal_lost_at, now());
    elsif new.status = 'on_the_process' then
      new.on_the_process_at = coalesce(new.on_the_process_at, now());
    elsif new.status = 'follow_up' then
      new.follow_up_at = coalesce(new.follow_up_at, now());
    end if;

    return new;
  end if;

  if new.status = 'successful' and old.status is distinct from 'successful' then
    new.successful_at = coalesce(new.successful_at, now());
  elsif new.status = 'deal_lost' and old.status is distinct from 'deal_lost' then
    new.deal_lost_at = coalesce(new.deal_lost_at, now());
  elsif new.status = 'on_the_process' and old.status is distinct from 'on_the_process' then
    new.on_the_process_at = coalesce(new.on_the_process_at, now());
  elsif new.status = 'follow_up' and old.status is distinct from 'follow_up' then
    new.follow_up_at = coalesce(new.follow_up_at, now());
  end if;

  return new;
end;
$$;

create trigger set_lead_status_timestamps
before insert or update on public.leads
for each row
execute function public.set_lead_status_timestamps();

drop function if exists public.sales_manager_dashboard(timestamptz, timestamptz);

create function public.sales_manager_dashboard(
  range_start timestamptz default date_trunc('month', now()),
  range_end timestamptz default now()
)
returns table (
  total_representatives bigint,
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
     where role::text = 'sales_representative'
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
