-- When a dead job is later proven covered, reconcile its parent run as well.
create or replace function public.reconcile_recovered_wex_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'succeeded' and old.status is distinct from new.status then
    update public.fuel_card_sync_runs as sync_run set
      status = 'succeeded',
      completed_at = coalesce(sync_run.completed_at, clock_timestamp()),
      error_message = null,
      metadata = coalesce(sync_run.metadata, '{}'::jsonb) || jsonb_build_object(
        'stage', 'completed',
        'recovered', true,
        'updatedAt', clock_timestamp()
      )
    where sync_run.id = new.run_id
      and not exists (
        select 1 from public.wex_sync_jobs as child_job
        where child_job.run_id = new.run_id and child_job.status <> 'succeeded'
      );
  end if;
  return new;
end
$$;

revoke all on function public.reconcile_recovered_wex_run() from public, anon, authenticated;

drop trigger if exists reconcile_recovered_wex_run on public.wex_sync_jobs;
create trigger reconcile_recovered_wex_run
after update of status on public.wex_sync_jobs
for each row execute function public.reconcile_recovered_wex_run();

-- Repair parent runs recovered before this trigger existed.
update public.fuel_card_sync_runs as sync_run set
  status = 'succeeded',
  completed_at = coalesce(sync_run.completed_at, clock_timestamp()),
  error_message = null,
  metadata = coalesce(sync_run.metadata, '{}'::jsonb) || jsonb_build_object(
    'stage', 'completed',
    'recovered', true,
    'updatedAt', clock_timestamp()
  )
where sync_run.provider = 'wex_efs'
  and sync_run.status = 'failed'
  and exists (select 1 from public.wex_sync_jobs where run_id = sync_run.id)
  and not exists (
    select 1 from public.wex_sync_jobs as child_job
    where child_job.run_id = sync_run.id and child_job.status <> 'succeeded'
  );
