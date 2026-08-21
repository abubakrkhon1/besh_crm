-- WEX occasionally returns `ERROR running command <id>` for a transient
-- provider-side failure. Retry it and automatically resolve a dead-job alert
-- when a later successful job fully covers the failed operation.
create or replace function public.fail_wex_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text, p_error_message text,
  p_retryable boolean, p_retry_delay_seconds integer
)
returns text
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.wex_sync_jobs%rowtype;
  v_new_message bigint;
  v_status text;
  v_retryable boolean;
  v_safe_message text;
begin
  select * into v_job from public.wex_sync_jobs where id = p_job_id and lease_token = p_lease_token and status = 'running' for update;
  if v_job.id is null then return 'stale'; end if;
  perform pgmq.archive(v_job.queue_name, v_job.message_id);

  v_retryable := p_retryable or (p_error_code = 'soap_fault' and p_error_message ilike 'ERROR running command %');
  v_safe_message := case
    when p_error_code = 'soap_fault' and p_error_message ilike 'ERROR running command %' then 'WEX reported a temporary processing error.'
    else left(p_error_message, 1000)
  end;

  if v_retryable and v_job.attempt < v_job.max_attempts then
    select send into v_new_message from pgmq.send(v_job.queue_name, jsonb_build_object('job_id', v_job.id), greatest(0, p_retry_delay_seconds));
    v_status := 'retrying';
    update public.wex_sync_jobs set
      status = v_status,
      message_id = v_new_message,
      available_at = clock_timestamp() + make_interval(secs => greatest(0, p_retry_delay_seconds)),
      lease_token = null,
      lease_expires_at = null,
      error_code = left(p_error_code, 100),
      error_message = v_safe_message,
      updated_at = clock_timestamp()
    where id = v_job.id;
    update public.fuel_card_sync_runs set
      status = 'running',
      error_message = v_safe_message,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'stage', 'retrying',
        'attempt', v_job.attempt,
        'nextRetryAt', clock_timestamp() + make_interval(secs => greatest(0, p_retry_delay_seconds)),
        'updatedAt', clock_timestamp()
      )
    where id = v_job.run_id;
  else
    v_status := 'dead';
    update public.wex_sync_jobs set
      status = v_status,
      completed_at = clock_timestamp(),
      lease_token = null,
      lease_expires_at = null,
      error_code = left(p_error_code, 100),
      error_message = v_safe_message,
      updated_at = clock_timestamp()
    where id = v_job.id;
    update public.fuel_card_sync_runs set
      status = 'failed',
      completed_at = clock_timestamp(),
      error_message = v_safe_message,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'stage', 'failed', 'jobId', v_job.id, 'attempt', v_job.attempt, 'updatedAt', clock_timestamp()
      )
    where id = v_job.run_id;
    insert into public.wex_sync_alerts(provider, code, severity, title, message, run_id, job_id, details)
    values (
      'wex_efs', 'dead_jobs', 'critical', 'WEX synchronization needs attention',
      v_safe_message, v_job.run_id, v_job.id,
      jsonb_build_object('jobType', v_job.job_type, 'attempts', v_job.attempt)
    )
    on conflict (provider, code) where status = 'open' do update set
      severity = excluded.severity,
      title = excluded.title,
      message = excluded.message,
      run_id = excluded.run_id,
      job_id = excluded.job_id,
      details = excluded.details,
      updated_at = clock_timestamp();
  end if;

  update public.wex_worker_leases set
    lease_token = null, job_id = null, expires_at = null, heartbeat_at = null, updated_at = clock_timestamp()
  where provider = 'wex_efs' and lease_token = p_lease_token;
  return v_status;
end
$$;

revoke all on function public.fail_wex_job(uuid,uuid,text,text,boolean,integer) from public, anon, authenticated;
grant execute on function public.fail_wex_job(uuid,uuid,text,text,boolean,integer) to service_role;

create or replace function public.resolve_superseded_wex_failures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then return new; end if;

  update public.wex_sync_jobs as failed_job set
    status = 'succeeded',
    error_code = null,
    error_message = null,
    result = failed_job.result || jsonb_build_object('supersededBy', new.id),
    updated_at = clock_timestamp()
  where failed_job.provider = new.provider
    and failed_job.id <> new.id
    and failed_job.status = 'dead'
    and failed_job.job_type = new.job_type
    and failed_job.completed_at < new.completed_at
    and (
      (new.job_type in ('incremental', 'transaction_window')
        and new.range_start <= failed_job.range_start
        and new.range_end >= failed_job.range_end)
      or new.job_type in ('account_snapshot', 'reconcile')
    );

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

revoke all on function public.resolve_superseded_wex_failures() from public, anon, authenticated;

drop trigger if exists resolve_superseded_wex_failures on public.wex_sync_jobs;
create trigger resolve_superseded_wex_failures
after update of status on public.wex_sync_jobs
for each row execute function public.resolve_superseded_wex_failures();

-- Repair alerts created before this retry/supersession policy was installed.
with covered_failures as (
  select failed_job.id, replacement.id as replacement_id
  from public.wex_sync_jobs as failed_job
  cross join lateral (
    select successful_job.id
    from public.wex_sync_jobs as successful_job
    where successful_job.provider = failed_job.provider
      and successful_job.status = 'succeeded'
      and successful_job.job_type = failed_job.job_type
      and successful_job.completed_at > failed_job.completed_at
      and (
        (successful_job.job_type in ('incremental', 'transaction_window')
          and successful_job.range_start <= failed_job.range_start
          and successful_job.range_end >= failed_job.range_end)
        or successful_job.job_type in ('account_snapshot', 'reconcile')
      )
    order by successful_job.completed_at
    limit 1
  ) as replacement
  where failed_job.provider = 'wex_efs' and failed_job.status = 'dead'
)
update public.wex_sync_jobs as failed_job set
  status = 'succeeded',
  error_code = null,
  error_message = null,
  result = failed_job.result || jsonb_build_object('supersededBy', covered_failures.replacement_id),
  updated_at = clock_timestamp()
from covered_failures
where failed_job.id = covered_failures.id;

update public.wex_sync_alerts set
  status = 'resolved', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
where provider = 'wex_efs'
  and code = 'dead_jobs'
  and status = 'open'
  and not exists (select 1 from public.wex_sync_jobs where provider = 'wex_efs' and status = 'dead');
