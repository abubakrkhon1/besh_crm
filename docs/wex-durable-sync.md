# Durable WEX synchronization

WEX synchronization is scheduled and persisted in Supabase. Vercel executes one bounded Node job per invocation. The browser only enqueues work and polls audit state.

## Runtime model

- `wex_realtime` contains incremental, account snapshot, and reconciliation jobs.
- `wex_backfill` contains historical transaction windows.
- Queue messages contain only `{ "job_id": "..." }`; job parameters live in `public.wex_sync_jobs`.
- `public.wex_sync_state` owns transaction cursors and freshness timestamps.
- A six-minute queue visibility timeout and database lease protect each invocation.
- A transaction cursor advances only after the complete window, including all recursively split children, succeeds.
- The worker always checks realtime before backfill and processes exactly one message.

The producer schedules are installed by migration `20260815000400_durable_wex_sync.sql`:

- incremental transaction producer every five minutes;
- account snapshot producer every thirty minutes;
- reconciliation producer nightly at 02:17 UTC.

## Vercel configuration

Configure all WEX variables from `.env.example` in the Vercel project. Generate `WEX_WORKER_SECRET` with at least 32 random bytes. The route is:

```text
POST https://<production-host>/api/internal/wex-worker
Authorization: Bearer <WEX_WORKER_SECRET>
```

The route uses the Node runtime and requests a 240-second maximum duration. A Vercel Pro project is recommended because a single legacy SOAP request can consume most of a shorter Hobby invocation after retries.

## Configure the worker wake-up

The worker URL is not known at migration time, so its one-minute Cron entry is intentionally a deployment step. Store the values in Supabase Vault:

```sql
select vault.create_secret('https://<production-host>/api/internal/wex-worker', 'wex_worker_url');
select vault.create_secret('<same WEX_WORKER_SECRET as Vercel>', 'wex_worker_secret');
```

Then create the HTTP schedule in the Supabase SQL editor:

```sql
select cron.schedule(
  'wex-worker-consumer',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'wex_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'wex_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 250000
  );
  $cron$
);
```

Confirm producer and consumer executions in `cron.job_run_details`. Confirm queue depth with `pgmq.metrics('wex_realtime')` and `pgmq.metrics('wex_backfill')`.

## Failure behavior

Transient WEX/network failures retry after approximately 1, 5, 15, and 30 minutes. The original message is archived and a delayed replacement is sent. Permanent configuration or authentication errors become `dead` jobs. An oversized transaction response splits deterministically into two child windows; the original cursor advances only after the entire split tree succeeds.

If Vercel stops after claiming a message, its visibility and database lease expire after six minutes. A later invocation can reclaim the same job. Provider transaction IDs and card fingerprints keep writes idempotent.

## Moving the worker later

`processNextWexJob()` in `src/lib/integrations/wex/jobs.ts` contains the consumer behavior. A future Railway worker can call the same module in a loop. Supabase queues, jobs, schedules, cursors, UI, and reconciliation do not change.
