-- Durable WEX synchronization. PGMQ owns delivery; public tables own audit/state.
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'wex_realtime') then
    perform pgmq.create('wex_realtime');
  end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'wex_backfill') then
    perform pgmq.create('wex_backfill');
  end if;
end
$$;

create table public.wex_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.fuel_card_sync_runs(id) on delete cascade,
  parent_job_id uuid references public.wex_sync_jobs(id) on delete cascade,
  provider text not null default 'wex_efs' check (provider = 'wex_efs'),
  queue_name text not null check (queue_name in ('wex_realtime', 'wex_backfill')),
  job_type text not null check (job_type in ('incremental', 'account_snapshot', 'transaction_window', 'reconcile')),
  status text not null default 'queued' check (status in ('queued', 'running', 'retrying', 'succeeded', 'split', 'dead')),
  range_start timestamptz,
  range_end timestamptz,
  advances_cursor boolean not null default false,
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  message_id bigint,
  dedupe_key text not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wex_sync_job_range check (
    (job_type in ('incremental', 'transaction_window') and range_start is not null and range_end is not null and range_start < range_end)
    or (job_type not in ('incremental', 'transaction_window') and range_start is null and range_end is null)
  )
);

create unique index wex_sync_jobs_active_dedupe_idx on public.wex_sync_jobs(dedupe_key)
  where status in ('queued', 'running', 'retrying');
create index wex_sync_jobs_run_idx on public.wex_sync_jobs(run_id, created_at);
create index wex_sync_jobs_status_idx on public.wex_sync_jobs(status, available_at);

create table public.wex_sync_state (
  provider text not null default 'wex_efs',
  resource text not null check (resource in ('transactions', 'account', 'reconciliation')),
  cursor_time timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_reconciled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (provider, resource)
);

create table public.wex_worker_leases (
  provider text primary key default 'wex_efs',
  lease_token uuid,
  job_id uuid references public.wex_sync_jobs(id) on delete set null,
  expires_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.wex_worker_leases(provider) values ('wex_efs') on conflict do nothing;

create table public.wex_sync_alerts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'wex_efs',
  code text not null,
  severity text not null check (severity in ('warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  title text not null,
  message text not null,
  run_id uuid references public.fuel_card_sync_runs(id) on delete set null,
  job_id uuid references public.wex_sync_jobs(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index wex_sync_alerts_open_code_idx on public.wex_sync_alerts(provider, code) where status = 'open';
create index wex_sync_alerts_created_idx on public.wex_sync_alerts(created_at desc);

alter table public.wex_sync_jobs enable row level security;
alter table public.wex_sync_state enable row level security;
alter table public.wex_worker_leases enable row level security;
alter table public.wex_sync_alerts enable row level security;

create policy wex_sync_jobs_admin_select on public.wex_sync_jobs for select to authenticated using (public.is_admin(auth.uid()));
create policy wex_sync_state_admin_select on public.wex_sync_state for select to authenticated using (public.is_admin(auth.uid()));
create policy wex_sync_alerts_admin_select on public.wex_sync_alerts for select to authenticated using (public.is_admin(auth.uid()));
-- No client write policies. Trusted RPCs below are service-role only.

create or replace function public.enqueue_wex_job(
  p_job_type text,
  p_queue_name text,
  p_dedupe_key text,
  p_run_id uuid default null,
  p_created_by uuid default null,
  p_range_start timestamptz default null,
  p_range_end timestamptz default null,
  p_advances_cursor boolean default false,
  p_parent_job_id uuid default null,
  p_max_attempts integer default 5,
  p_metadata jsonb default '{}'::jsonb
)
returns table(run_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_run_id uuid := p_run_id;
  v_job_id uuid;
  v_message_id bigint;
begin
  if p_queue_name not in ('wex_realtime', 'wex_backfill') then raise exception 'Unsupported WEX queue'; end if;
  if p_job_type not in ('incremental', 'account_snapshot', 'transaction_window', 'reconcile') then raise exception 'Unsupported WEX job type'; end if;

  perform pg_advisory_xact_lock(hashtext('wex_efs:enqueue'));
  select j.run_id, j.id into run_id, job_id
  from public.wex_sync_jobs j
  where j.dedupe_key = p_dedupe_key and j.status in ('queued', 'running', 'retrying')
  limit 1;
  if job_id is not null then
    created := false;
    return next;
    return;
  end if;

  if v_run_id is null then
    insert into public.fuel_card_sync_runs(provider, status, created_by, metadata)
    values ('wex_efs', 'queued', p_created_by, jsonb_build_object('stage', 'queued', 'origin', case when p_created_by is null then 'system' else 'user' end, 'updatedAt', now()))
    returning id into v_run_id;
  end if;

  insert into public.wex_sync_jobs(
    run_id, parent_job_id, queue_name, job_type, range_start, range_end,
    advances_cursor, max_attempts, dedupe_key, metadata
  ) values (
    v_run_id, p_parent_job_id, p_queue_name, p_job_type, p_range_start, p_range_end,
    p_advances_cursor, p_max_attempts, p_dedupe_key, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_job_id;

  select send into v_message_id from pgmq.send(p_queue_name, jsonb_build_object('job_id', v_job_id));
  update public.wex_sync_jobs set message_id = v_message_id where id = v_job_id;
  run_id := v_run_id;
  job_id := v_job_id;
  created := true;
  return next;
end
$$;

create or replace function public.enqueue_wex_incremental_job(p_created_by uuid default null, p_force boolean default false)
returns table(run_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cursor timestamptz;
  v_window_end timestamptz;
  v_bucket timestamptz;
begin
  if not p_force then
    return query select j.run_id, j.id, false from public.wex_sync_jobs j
      where j.advances_cursor and j.status in ('queued', 'running', 'retrying') order by j.created_at limit 1;
    if found then return; end if;
  end if;
  select cursor_time into v_cursor from public.wex_sync_state where provider = 'wex_efs' and resource = 'transactions';
  v_cursor := coalesce(v_cursor, v_now - interval '1 day');
  v_window_end := least(v_cursor + interval '1 day', v_now);
  v_bucket := date_trunc('hour', v_now) + floor(extract(minute from v_now) / 5) * interval '5 minutes';
  return query select * from public.enqueue_wex_job(
    'incremental', 'wex_realtime',
    case when p_force then 'wex:incremental:manual:' || gen_random_uuid()::text else 'wex:incremental:' || to_char(v_bucket at time zone 'UTC', 'YYYYMMDDHH24MI') end,
    null, p_created_by, v_cursor - interval '30 minutes', v_window_end, true, null, 5,
    jsonb_build_object('producer', case when p_created_by is null then 'cron' else 'user' end)
  );
end
$$;

create or replace function public.enqueue_wex_account_snapshot_job(p_created_by uuid default null, p_force boolean default false)
returns table(run_id uuid, job_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_bucket timestamptz := date_trunc('hour', clock_timestamp()) + floor(extract(minute from clock_timestamp()) / 30) * interval '30 minutes';
begin
  if not p_force then
    return query select j.run_id, j.id, false from public.wex_sync_jobs j
      where j.job_type = 'account_snapshot' and j.status in ('queued', 'running', 'retrying') order by j.created_at limit 1;
    if found then return; end if;
  end if;
  return query select * from public.enqueue_wex_job(
    'account_snapshot', 'wex_realtime',
    case when p_force then 'wex:account:manual:' || gen_random_uuid()::text else 'wex:account:' || to_char(v_bucket at time zone 'UTC', 'YYYYMMDDHH24MI') end,
    null, p_created_by, null, null, false, null, 5, '{}'::jsonb
  );
end
$$;

create or replace function public.enqueue_wex_reconciliation_job()
returns table(run_id uuid, job_id uuid, created boolean)
language sql
security definer
set search_path = public, pgmq
as $$
  select * from public.enqueue_wex_job(
    'reconcile', 'wex_realtime', 'wex:reconcile:' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD'),
    null, null, null, null, false, null, 3, '{}'::jsonb
  );
$$;

create or replace function public.enqueue_wex_manual_sync(p_created_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_run_id uuid;
  v_now timestamptz := clock_timestamp();
  v_cursor timestamptz;
  v_window_end timestamptz;
  v_backfill_start timestamptz;
  v_backfill_end timestamptz;
  v_bootstrap boolean;
begin
  select cursor_time into v_cursor from public.wex_sync_state where provider = 'wex_efs' and resource = 'transactions';
  v_bootstrap := v_cursor is null;
  v_cursor := coalesce(v_cursor, v_now - interval '1 day');
  v_window_end := least(v_cursor + interval '1 day', v_now);
  insert into public.fuel_card_sync_runs(provider, status, created_by, metadata)
  values ('wex_efs', 'queued', p_created_by, jsonb_build_object('stage', 'queued', 'origin', 'manual', 'updatedAt', v_now))
  returning id into v_run_id;
  perform public.enqueue_wex_job(
    'account_snapshot', 'wex_realtime', 'wex:account:manual:' || v_run_id,
    v_run_id, p_created_by, null, null, false, null, 5, jsonb_build_object('origin', 'manual')
  );
  perform public.enqueue_wex_job(
    'incremental', 'wex_realtime', 'wex:incremental:manual:' || v_run_id,
    v_run_id, p_created_by, v_cursor - interval '30 minutes', v_window_end, true, null, 5, jsonb_build_object('origin', 'manual')
  );
  if v_bootstrap then
    v_backfill_start := v_now - interval '30 days';
    while v_backfill_start < v_now - interval '1 day' loop
      v_backfill_end := least(v_backfill_start + interval '3 days', v_now - interval '1 day');
      perform public.enqueue_wex_job(
        'transaction_window', 'wex_backfill', 'wex:bootstrap:' || v_run_id || ':' || v_backfill_start::text,
        v_run_id, p_created_by, v_backfill_start, v_backfill_end, false, null, 5,
        jsonb_build_object('origin', 'bootstrap')
      );
      v_backfill_start := v_backfill_end;
    end loop;
  end if;
  return v_run_id;
end
$$;

create or replace function public.enqueue_wex_backfill(
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_created_by uuid,
  p_window_days integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_run_id uuid;
  v_start timestamptz := p_range_start;
  v_end timestamptz;
begin
  if p_range_start >= p_range_end then raise exception 'Backfill start must precede end'; end if;
  if p_window_days not between 1 and 3 then raise exception 'Backfill windows must be between one and three days'; end if;
  insert into public.fuel_card_sync_runs(provider, status, created_by, metadata)
  values ('wex_efs', 'queued', p_created_by, jsonb_build_object('stage', 'queued', 'origin', 'backfill', 'rangeStart', p_range_start, 'rangeEnd', p_range_end))
  returning id into v_run_id;
  while v_start < p_range_end loop
    v_end := least(v_start + make_interval(days => p_window_days), p_range_end);
    perform public.enqueue_wex_job(
      'transaction_window', 'wex_backfill', 'wex:backfill:' || v_run_id || ':' || v_start::text,
      v_run_id, p_created_by, v_start, v_end, false, null, 5, jsonb_build_object('origin', 'backfill')
    );
    v_start := v_end;
  end loop;
  return v_run_id;
end
$$;

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

  if exists (select 1 from public.wex_worker_leases where provider = 'wex_efs' and expires_at > clock_timestamp()) then
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

  update public.wex_sync_jobs j set
    status = 'running', attempt = j.attempt + 1, message_id = v_message.msg_id,
    lease_token = v_token, lease_expires_at = clock_timestamp() + make_interval(secs => p_visibility_seconds),
    heartbeat_at = clock_timestamp(), started_at = coalesce(j.started_at, clock_timestamp()),
    updated_at = clock_timestamp(), error_code = null, error_message = null
  where j.id = v_job_id and j.queue_name = v_queue and (
    j.status in ('queued', 'retrying') or (j.status = 'running' and j.lease_expires_at <= clock_timestamp())
  )
  returning j.id, j.run_id, j.job_type, j.queue_name, j.message_id, j.range_start, j.range_end,
    j.attempt, j.max_attempts, j.lease_token, j.metadata
  into job_id, run_id, job_type, queue_name, message_id, range_start, range_end,
    attempt, max_attempts, lease_token, metadata;

  if job_id is null then
    perform pgmq.archive(v_queue, v_message.msg_id);
    return;
  end if;

  insert into public.wex_worker_leases(provider, lease_token, job_id, expires_at, heartbeat_at, updated_at)
  values ('wex_efs', v_token, v_job_id, clock_timestamp() + make_interval(secs => p_visibility_seconds), clock_timestamp(), clock_timestamp())
  on conflict (provider) do update set lease_token = excluded.lease_token, job_id = excluded.job_id,
    expires_at = excluded.expires_at, heartbeat_at = excluded.heartbeat_at, updated_at = excluded.updated_at;

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

create or replace function public.heartbeat_wex_job(p_job_id uuid, p_lease_token uuid, p_visibility_seconds integer default 360)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare v_queue text; v_message bigint;
begin
  update public.wex_sync_jobs set heartbeat_at = clock_timestamp(), lease_expires_at = clock_timestamp() + make_interval(secs => p_visibility_seconds), updated_at = clock_timestamp()
  where id = p_job_id and lease_token = p_lease_token and status = 'running'
  returning queue_name, message_id into v_queue, v_message;
  if v_message is null then return false; end if;
  perform pgmq.set_vt(v_queue, v_message, p_visibility_seconds);
  update public.wex_worker_leases set heartbeat_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => p_visibility_seconds), updated_at = clock_timestamp()
  where provider = 'wex_efs' and lease_token = p_lease_token;
  return true;
end
$$;

create or replace function public.complete_wex_job(p_job_id uuid, p_lease_token uuid, p_result jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.wex_sync_jobs%rowtype;
  v_parent public.wex_sync_jobs%rowtype;
  v_parent_id uuid;
  v_active integer;
  v_dead integer;
begin
  select * into v_job from public.wex_sync_jobs where id = p_job_id and lease_token = p_lease_token and status = 'running' for update;
  if v_job.id is null then return false; end if;
  perform pgmq.archive(v_job.queue_name, v_job.message_id);
  update public.wex_sync_jobs set status = 'succeeded', completed_at = clock_timestamp(), result = coalesce(p_result, '{}'::jsonb),
    lease_token = null, lease_expires_at = null, heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_job.id;

  if v_job.advances_cursor then
    insert into public.wex_sync_state(provider, resource, cursor_time, last_succeeded_at)
    values ('wex_efs', 'transactions', v_job.range_end, clock_timestamp())
    on conflict (provider, resource) do update set cursor_time = greatest(public.wex_sync_state.cursor_time, excluded.cursor_time),
      last_succeeded_at = excluded.last_succeeded_at, updated_at = clock_timestamp();
  elsif v_job.job_type = 'account_snapshot' then
    insert into public.wex_sync_state(provider, resource, last_succeeded_at)
    values ('wex_efs', 'account', clock_timestamp())
    on conflict (provider, resource) do update set last_succeeded_at = excluded.last_succeeded_at, updated_at = clock_timestamp();
  elsif v_job.job_type = 'reconcile' then
    insert into public.wex_sync_state(provider, resource, last_succeeded_at, last_reconciled_at)
    values ('wex_efs', 'reconciliation', clock_timestamp(), clock_timestamp())
    on conflict (provider, resource) do update set last_succeeded_at = excluded.last_succeeded_at,
      last_reconciled_at = excluded.last_reconciled_at, updated_at = clock_timestamp();
  end if;

  -- Split children do not independently advance the incremental cursor. Only
  -- advance it after every sibling succeeds, preserving complete-window semantics.
  v_parent_id := v_job.parent_job_id;
  while v_parent_id is not null loop
    select * into v_parent from public.wex_sync_jobs where id = v_parent_id for update;
    exit when v_parent.id is null or exists (
      select 1 from public.wex_sync_jobs child where child.parent_job_id = v_parent_id and child.status <> 'succeeded'
    );
    update public.wex_sync_jobs set status = 'succeeded', updated_at = clock_timestamp() where id = v_parent_id and status = 'split';
    if v_parent.advances_cursor then
      insert into public.wex_sync_state(provider, resource, cursor_time, last_succeeded_at)
      values ('wex_efs', 'transactions', v_parent.range_end, clock_timestamp())
      on conflict (provider, resource) do update set cursor_time = greatest(public.wex_sync_state.cursor_time, excluded.cursor_time),
        last_succeeded_at = excluded.last_succeeded_at, updated_at = clock_timestamp();
    end if;
    v_parent_id := v_parent.parent_job_id;
  end loop;

  select count(*) filter (where status in ('queued', 'running', 'retrying')), count(*) filter (where status = 'dead')
  into v_active, v_dead from public.wex_sync_jobs where run_id = v_job.run_id;
  update public.fuel_card_sync_runs set
    status = case when v_active > 0 then 'running' when v_dead > 0 then 'failed' else 'succeeded' end,
    completed_at = case when v_active = 0 then clock_timestamp() else null end,
    error_message = case when v_active = 0 and v_dead = 0 then null else error_message end,
    cards_received = coalesce((select max((result->>'received')::integer) from public.wex_sync_jobs where run_id = v_job.run_id and job_type = 'account_snapshot' and status = 'succeeded'), 0),
    cards_created = coalesce((select max((result->>'created')::integer) from public.wex_sync_jobs where run_id = v_job.run_id and job_type = 'account_snapshot' and status = 'succeeded'), 0),
    cards_updated = coalesce((select max((result->>'updated')::integer) from public.wex_sync_jobs where run_id = v_job.run_id and job_type = 'account_snapshot' and status = 'succeeded'), 0),
    cards_unmatched = coalesce((select max((result->>'unmatched')::integer) from public.wex_sync_jobs where run_id = v_job.run_id and job_type = 'account_snapshot' and status = 'succeeded'), 0),
    transactions_received = coalesce((select sum((result->>'transactions')::integer) from public.wex_sync_jobs where run_id = v_job.run_id and job_type in ('incremental', 'transaction_window') and status = 'succeeded'), 0),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('stage', case when v_active > 0 then 'processing' else 'completed' end, 'updatedAt', clock_timestamp())
  where id = v_job.run_id;
  update public.wex_worker_leases set lease_token = null, job_id = null, expires_at = null, heartbeat_at = null, updated_at = clock_timestamp()
  where provider = 'wex_efs' and lease_token = p_lease_token;
  return true;
end
$$;

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
    update public.wex_sync_jobs set status = v_status, message_id = v_new_message, available_at = clock_timestamp() + make_interval(secs => greatest(0, p_retry_delay_seconds)),
      lease_token = null, lease_expires_at = null, error_code = left(p_error_code, 100), error_message = v_safe_message, updated_at = clock_timestamp()
    where id = v_job.id;
    update public.fuel_card_sync_runs set status = 'running', error_message = v_safe_message, metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stage', 'retrying', 'attempt', v_job.attempt, 'nextRetryAt', clock_timestamp() + make_interval(secs => greatest(0, p_retry_delay_seconds)), 'updatedAt', clock_timestamp()
    ) where id = v_job.run_id;
  else
    v_status := 'dead';
    update public.wex_sync_jobs set status = v_status, completed_at = clock_timestamp(), lease_token = null, lease_expires_at = null,
      error_code = left(p_error_code, 100), error_message = v_safe_message, updated_at = clock_timestamp()
    where id = v_job.id;
    update public.fuel_card_sync_runs set status = 'failed', completed_at = clock_timestamp(), error_message = v_safe_message,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('stage', 'failed', 'jobId', v_job.id, 'attempt', v_job.attempt, 'updatedAt', clock_timestamp())
    where id = v_job.run_id;
    insert into public.wex_sync_alerts(provider, code, severity, title, message, run_id, job_id, details)
    values ('wex_efs', 'dead_jobs', 'critical', 'WEX synchronization needs attention', v_safe_message, v_job.run_id, v_job.id,
      jsonb_build_object('jobType', v_job.job_type, 'attempts', v_job.attempt))
    on conflict (provider, code) where status = 'open' do update set
      severity = excluded.severity, title = excluded.title, message = excluded.message,
      run_id = excluded.run_id, job_id = excluded.job_id, details = excluded.details, updated_at = clock_timestamp();
  end if;
  update public.wex_worker_leases set lease_token = null, job_id = null, expires_at = null, heartbeat_at = null, updated_at = clock_timestamp()
  where provider = 'wex_efs' and lease_token = p_lease_token;
  return v_status;
end
$$;

create or replace function public.split_wex_job(p_job_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare v_job public.wex_sync_jobs%rowtype; v_midpoint timestamptz;
begin
  select * into v_job from public.wex_sync_jobs where id = p_job_id and lease_token = p_lease_token and status = 'running' for update;
  if v_job.id is null or v_job.job_type not in ('incremental', 'transaction_window') then return false; end if;
  if v_job.range_end - v_job.range_start <= interval '2 hours' then return false; end if;
  v_midpoint := v_job.range_start + ((v_job.range_end - v_job.range_start) / 2);
  perform pgmq.archive(v_job.queue_name, v_job.message_id);
  update public.wex_sync_jobs set status = 'split', completed_at = clock_timestamp(), lease_token = null,
    lease_expires_at = null, result = jsonb_build_object('splitAt', v_midpoint), updated_at = clock_timestamp()
  where id = v_job.id;
  perform public.enqueue_wex_job(
    'transaction_window', v_job.queue_name, v_job.dedupe_key || ':left', v_job.run_id, null,
    v_job.range_start, v_midpoint, false, v_job.id, v_job.max_attempts, jsonb_build_object('splitFrom', v_job.id)
  );
  perform public.enqueue_wex_job(
    'transaction_window', v_job.queue_name, v_job.dedupe_key || ':right', v_job.run_id, null,
    v_midpoint, v_job.range_end, false, v_job.id, v_job.max_attempts, jsonb_build_object('splitFrom', v_job.id)
  );
  update public.fuel_card_sync_runs set status = 'running', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'stage', 'window_split', 'jobId', v_job.id, 'splitAt', v_midpoint, 'updatedAt', clock_timestamp()
  ) where id = v_job.run_id;
  update public.wex_worker_leases set lease_token = null, job_id = null, expires_at = null, heartbeat_at = null, updated_at = clock_timestamp()
  where provider = 'wex_efs' and lease_token = p_lease_token;
  return true;
end
$$;

revoke all on function public.enqueue_wex_job(text,text,text,uuid,uuid,timestamptz,timestamptz,boolean,uuid,integer,jsonb) from public, anon, authenticated;
revoke all on function public.enqueue_wex_incremental_job(uuid,boolean) from public, anon, authenticated;
revoke all on function public.enqueue_wex_account_snapshot_job(uuid,boolean) from public, anon, authenticated;
revoke all on function public.enqueue_wex_reconciliation_job() from public, anon, authenticated;
revoke all on function public.enqueue_wex_manual_sync(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_wex_backfill(timestamptz,timestamptz,uuid,integer) from public, anon, authenticated;
revoke all on function public.claim_next_wex_job(integer) from public, anon, authenticated;
revoke all on function public.heartbeat_wex_job(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_wex_job(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.fail_wex_job(uuid,uuid,text,text,boolean,integer) from public, anon, authenticated;
revoke all on function public.split_wex_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.enqueue_wex_job(text,text,text,uuid,uuid,timestamptz,timestamptz,boolean,uuid,integer,jsonb) to service_role;
grant execute on function public.enqueue_wex_incremental_job(uuid,boolean) to service_role;
grant execute on function public.enqueue_wex_account_snapshot_job(uuid,boolean) to service_role;
grant execute on function public.enqueue_wex_reconciliation_job() to service_role;
grant execute on function public.enqueue_wex_manual_sync(uuid) to service_role;
grant execute on function public.enqueue_wex_backfill(timestamptz,timestamptz,uuid,integer) to service_role;
grant execute on function public.claim_next_wex_job(integer) to service_role;
grant execute on function public.heartbeat_wex_job(uuid,uuid,integer) to service_role;
grant execute on function public.complete_wex_job(uuid,uuid,jsonb) to service_role;
grant execute on function public.fail_wex_job(uuid,uuid,text,text,boolean,integer) to service_role;
grant execute on function public.split_wex_job(uuid,uuid) to service_role;

-- Producers are entirely database-owned. The separate worker wake-up Cron is configured
-- after deployment because it needs the production Vercel URL and a Vault secret.
select cron.schedule('wex-incremental-producer', '*/5 * * * *', $$select public.enqueue_wex_incremental_job();$$);
select cron.schedule('wex-account-producer', '*/30 * * * *', $$select public.enqueue_wex_account_snapshot_job();$$);
select cron.schedule('wex-reconciliation-producer', '17 2 * * *', $$select public.enqueue_wex_reconciliation_job();$$);
