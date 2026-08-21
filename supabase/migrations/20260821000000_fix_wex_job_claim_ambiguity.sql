-- Repair the deployed WEX claim function. Its TABLE output field `metadata`
-- conflicted with fuel_card_sync_runs.metadata and raised PostgreSQL 42702.
create or replace function public.claim_next_wex_job(p_visibility_seconds integer default 360)
returns table(
  job_id uuid, run_id uuid, job_type text, queue_name text, message_id bigint,
  range_start timestamptz, range_end timestamptz, attempt integer, max_attempts integer,
  lease_token uuid, metadata jsonb
)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_message record;
  v_queue text;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if p_visibility_seconds < 300 or p_visibility_seconds > 3600 then raise exception 'Invalid WEX visibility timeout'; end if;
  perform pg_advisory_xact_lock(hashtext('wex_efs:claim'));

  if exists (
    select 1
    from public.wex_worker_leases as worker_lease
    where worker_lease.provider = 'wex_efs'
      and worker_lease.expires_at > clock_timestamp()
  ) then
    return;
  end if;

  select * into v_message from pgmq.read('wex_realtime', p_visibility_seconds, 1) limit 1;
  v_queue := 'wex_realtime';
  if v_message.msg_id is null then
    select * into v_message from pgmq.read('wex_backfill', p_visibility_seconds, 1) limit 1;
    v_queue := 'wex_backfill';
  end if;
  if v_message.msg_id is null then return; end if;

  begin
    v_job_id := (v_message.message ->> 'job_id')::uuid;
  exception when others then
    perform pgmq.archive(v_queue, v_message.msg_id);
    return;
  end;

  update public.wex_sync_jobs as sync_job set
    status = 'running',
    attempt = sync_job.attempt + 1,
    message_id = v_message.msg_id,
    lease_token = v_token,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_visibility_seconds),
    heartbeat_at = clock_timestamp(),
    started_at = coalesce(sync_job.started_at, clock_timestamp()),
    updated_at = clock_timestamp(),
    error_code = null,
    error_message = null
  where sync_job.id = v_job_id
    and sync_job.queue_name = v_queue
    and (
      sync_job.status in ('queued', 'retrying')
      or (sync_job.status = 'running' and sync_job.lease_expires_at <= clock_timestamp())
    )
  returning
    sync_job.id,
    sync_job.run_id,
    sync_job.job_type,
    sync_job.queue_name,
    sync_job.message_id,
    sync_job.range_start,
    sync_job.range_end,
    sync_job.attempt,
    sync_job.max_attempts,
    sync_job.lease_token,
    sync_job.metadata
  into
    claim_next_wex_job.job_id,
    claim_next_wex_job.run_id,
    claim_next_wex_job.job_type,
    claim_next_wex_job.queue_name,
    claim_next_wex_job.message_id,
    claim_next_wex_job.range_start,
    claim_next_wex_job.range_end,
    claim_next_wex_job.attempt,
    claim_next_wex_job.max_attempts,
    claim_next_wex_job.lease_token,
    claim_next_wex_job.metadata;

  if claim_next_wex_job.job_id is null then
    perform pgmq.archive(v_queue, v_message.msg_id);
    return;
  end if;

  insert into public.wex_worker_leases as worker_lease(
    provider, lease_token, job_id, expires_at, heartbeat_at, updated_at
  ) values (
    'wex_efs', v_token, v_job_id,
    clock_timestamp() + make_interval(secs => p_visibility_seconds),
    clock_timestamp(), clock_timestamp()
  )
  on conflict (provider) do update set
    lease_token = excluded.lease_token,
    job_id = excluded.job_id,
    expires_at = excluded.expires_at,
    heartbeat_at = excluded.heartbeat_at,
    updated_at = excluded.updated_at;

  update public.fuel_card_sync_runs as sync_run set
    status = 'running',
    metadata = coalesce(sync_run.metadata, '{}'::jsonb) || jsonb_build_object(
      'stage', 'processing',
      'jobId', v_job_id,
      'jobType', claim_next_wex_job.job_type,
      'attempt', claim_next_wex_job.attempt,
      'updatedAt', clock_timestamp()
    )
  where sync_run.id = claim_next_wex_job.run_id;

  return next;
end
$$;

revoke all on function public.claim_next_wex_job(integer) from public, anon, authenticated;
grant execute on function public.claim_next_wex_job(integer) to service_role;
