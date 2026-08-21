-- A failed incremental bootstrap window can be covered by several later
-- successful windows. The authoritative transaction cursor proves that the
-- complete range was persisted even when no single replacement spans it.
create or replace function public.resolve_cursor_covered_wex_failures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider <> 'wex_efs'
    or new.resource <> 'transactions'
    or new.cursor_time is null
    or (tg_op = 'UPDATE' and new.cursor_time is not distinct from old.cursor_time) then
    return new;
  end if;

  update public.wex_sync_jobs as failed_job set
    status = 'succeeded',
    error_code = null,
    error_message = null,
    result = failed_job.result || jsonb_build_object(
      'supersededByCursor', new.cursor_time,
      'resolution', 'covered_by_later_incremental_windows'
    ),
    updated_at = clock_timestamp()
  where failed_job.provider = new.provider
    and failed_job.status = 'dead'
    and failed_job.advances_cursor
    and failed_job.range_end <= new.cursor_time;

  if not exists (
    select 1 from public.wex_sync_jobs where provider = new.provider and status = 'dead'
  ) then
    update public.wex_sync_alerts set
      status = 'resolved', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
    where provider = new.provider and code = 'dead_jobs' and status = 'open';
  end if;
  return new;
end
$$;

revoke all on function public.resolve_cursor_covered_wex_failures() from public, anon, authenticated;

drop trigger if exists resolve_cursor_covered_wex_failures on public.wex_sync_state;
create trigger resolve_cursor_covered_wex_failures
after insert or update of cursor_time on public.wex_sync_state
for each row execute function public.resolve_cursor_covered_wex_failures();

-- Repair cursor-covered failures that predate the trigger.
update public.wex_sync_jobs as failed_job set
  status = 'succeeded',
  error_code = null,
  error_message = null,
  result = failed_job.result || jsonb_build_object(
    'supersededByCursor', sync_state.cursor_time,
    'resolution', 'covered_by_later_incremental_windows'
  ),
  updated_at = clock_timestamp()
from public.wex_sync_state as sync_state
where failed_job.provider = sync_state.provider
  and sync_state.resource = 'transactions'
  and failed_job.status = 'dead'
  and failed_job.advances_cursor
  and failed_job.range_end <= sync_state.cursor_time;

update public.wex_sync_alerts set
  status = 'resolved', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
where provider = 'wex_efs'
  and code = 'dead_jobs'
  and status = 'open'
  and not exists (select 1 from public.wex_sync_jobs where provider = 'wex_efs' and status = 'dead');
