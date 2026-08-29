-- Store lead history separately so later edits cannot overwrite prior events.

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  activity_type text not null check (activity_type in (
    'lead_created',
    'assigned',
    'reassigned',
    'unassigned',
    'status_changed',
    'work_plan_updated',
    'note_added'
  )),
  description text not null check (length(btrim(description)) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_created_at_idx
  on public.lead_activities(lead_id, created_at desc);

alter table public.lead_activities enable row level security;

create or replace function public.set_lead_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.actor_profile_id = public.current_profile_id();
    select coalesce(profile.full_name, profile.email, 'CRM user')
    into new.actor_name
    from public.profiles as profile
    where profile.id = new.actor_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_lead_activity_actor on public.lead_activities;
create trigger set_lead_activity_actor
before insert on public.lead_activities
for each row
execute function public.set_lead_activity_actor();

drop policy if exists lead_activities_select_by_lead on public.lead_activities;
create policy lead_activities_select_by_lead
on public.lead_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.leads as lead
    where lead.id = lead_activities.lead_id
      and public.can_view_lead(
        lead.created_by_profile_id,
        lead.assigned_to_profile_id,
        lead.sales_manager_profile_id
      )
  )
);

drop policy if exists lead_activities_insert_note on public.lead_activities;
create policy lead_activities_insert_note
on public.lead_activities
for insert
to authenticated
with check (
  activity_type = 'note_added'
  and actor_profile_id = public.current_profile_id()
  and exists (
    select 1
    from public.leads as lead
    where lead.id = lead_activities.lead_id
      and public.can_update_lead(
        lead.created_by_profile_id,
        lead.assigned_to_profile_id,
        lead.sales_manager_profile_id
      )
  )
);

revoke all on table public.lead_activities from anon, authenticated;
grant select, insert on table public.lead_activities to authenticated;

create or replace function public.record_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_type text;
  assignment_agent_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (lead_id, activity_type, description)
    values (new.id, 'lead_created', 'Lead created');
    return new;
  end if;

  if new.assigned_to_profile_id is distinct from old.assigned_to_profile_id then
    assignment_type = case
      when new.assigned_to_profile_id is null then 'unassigned'
      when old.assigned_to_profile_id is null then 'assigned'
      else 'reassigned'
    end;

    if new.assigned_to_profile_id is not null then
      select coalesce(profile.full_name, profile.email, 'sales agent')
      into assignment_agent_name
      from public.profiles as profile
      where profile.id = new.assigned_to_profile_id;
    end if;

    insert into public.lead_activities (lead_id, activity_type, description, metadata)
    values (
      new.id,
      assignment_type,
      case assignment_type
        when 'unassigned' then 'Lead returned to the unassigned queue'
        when 'assigned' then 'Lead assigned to ' || coalesce(assignment_agent_name, 'a sales agent')
        else 'Lead reassigned to ' || coalesce(assignment_agent_name, 'another sales agent')
      end,
      jsonb_build_object(
        'previous_agent_profile_id', old.assigned_to_profile_id,
        'agent_profile_id', new.assigned_to_profile_id,
        'agent_name', assignment_agent_name
      )
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_activities (lead_id, activity_type, description, metadata)
    values (
      new.id,
      'status_changed',
      'Lead status changed',
      jsonb_build_object('previous_status', old.status, 'status', new.status)
    );
  end if;

  if new.priority is distinct from old.priority
     or new.next_follow_up_at is distinct from old.next_follow_up_at then
    insert into public.lead_activities (lead_id, activity_type, description, metadata)
    values (
      new.id,
      'work_plan_updated',
      'Lead priority or follow-up schedule updated',
      jsonb_build_object(
        'previous_priority', old.priority,
        'priority', new.priority,
        'previous_next_follow_up_at', old.next_follow_up_at,
        'next_follow_up_at', new.next_follow_up_at
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_lead_activity on public.leads;
create trigger record_lead_activity
after insert or update on public.leads
for each row
execute function public.record_lead_activity();
