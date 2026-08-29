-- Add daily-work fields without changing the existing lead status pipeline.

alter table public.leads
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists next_follow_up_at timestamptz;

create index if not exists leads_open_follow_up_idx
  on public.leads(next_follow_up_at)
  where next_follow_up_at is not null
    and status not in ('successful', 'deal_lost');

create index if not exists leads_priority_created_at_idx
  on public.leads(priority, created_at desc);

create or replace function public.clear_closed_lead_follow_up()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('successful', 'deal_lost') then
    new.next_follow_up_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_closed_lead_follow_up on public.leads;
create trigger clear_closed_lead_follow_up
before insert or update on public.leads
for each row
execute function public.clear_closed_lead_follow_up();
