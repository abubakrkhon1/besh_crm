import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { WexError } from './errors'
import { reconcileWexData, syncWexAccountSnapshot, syncWexTransactionWindow } from './job-operations'
import { classifyWexJobError, retryDelaySeconds } from './job-policy'

export type WexJob = {
  job_id: string
  run_id: string
  job_type: 'incremental' | 'account_snapshot' | 'transaction_window' | 'reconcile'
  queue_name: 'wex_realtime' | 'wex_backfill'
  message_id: number
  range_start: string | null
  range_end: string | null
  attempt: number
  max_attempts: number
  lease_token: string
  metadata: Record<string, unknown>
}

async function processJob(job: WexJob) {
  switch (job.job_type) {
    case 'account_snapshot':
      return syncWexAccountSnapshot()
    case 'incremental':
    case 'transaction_window':
      if (!job.range_start || !job.range_end) throw new Error('WEX transaction job has no date range.')
      return syncWexTransactionWindow(new Date(job.range_start), new Date(job.range_end))
    case 'reconcile':
      return reconcileWexData()
  }
}

export async function processNextWexJob() {
  const db = createAdminClient()
  const { data, error } = await db.rpc('claim_next_wex_job', { p_visibility_seconds: 360 })
  if (error) throw new Error(`WEX job could not be claimed (${error.code}).`)
  const job = (Array.isArray(data) ? data[0] : data) as WexJob | null
  if (!job) return { status: 'idle' as const }

  const heartbeat = setInterval(() => {
    void db.rpc('heartbeat_wex_job', {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_visibility_seconds: 360,
    }).then(({ error }) => {
      if (error) console.error('[WEX worker] Heartbeat failed.', { jobId: job.job_id, code: error.code })
    })
  }, 60_000)
  heartbeat.unref?.()

  try {
    console.info('[WEX worker] Processing job.', { jobId: job.job_id, runId: job.run_id, jobType: job.job_type, attempt: job.attempt })
    const result = await processJob(job)
    const { data: completed, error: completeError } = await db.rpc('complete_wex_job', {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_result: result,
    })
    if (completeError || !completed) throw new Error(`WEX job completion could not be recorded (${completeError?.code ?? 'STALE_LEASE'}).`)
    console.info('[WEX worker] Job completed.', { jobId: job.job_id, runId: job.run_id, jobType: job.job_type })
    return { status: 'succeeded' as const, jobId: job.job_id, runId: job.run_id, jobType: job.job_type }
  } catch (error) {
    const failure = classifyWexJobError(error)
    if (error instanceof WexError && error.kind === 'response_too_large' && (job.job_type === 'incremental' || job.job_type === 'transaction_window')) {
      const { data: split, error: splitError } = await db.rpc('split_wex_job', {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
      })
      if (!splitError && split) {
        console.warn('[WEX worker] Oversized transaction window was split.', { jobId: job.job_id, runId: job.run_id })
        return { status: 'split' as const, jobId: job.job_id, runId: job.run_id }
      }
    }
    const { data: status, error: failError } = await db.rpc('fail_wex_job', {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_error_code: failure.code,
      p_error_message: failure.message,
      p_retryable: failure.retryable,
      p_retry_delay_seconds: retryDelaySeconds(job.attempt),
    })
    if (failError) console.error('[WEX worker] Failure could not be recorded.', { jobId: job.job_id, code: failError.code })
    console.error('[WEX worker] Job failed.', { jobId: job.job_id, runId: job.run_id, jobType: job.job_type, retryable: failure.retryable, status, message: failure.message })
    return { status: status === 'retrying' ? 'retrying' as const : 'failed' as const, jobId: job.job_id, runId: job.run_id, message: failure.message }
  } finally {
    clearInterval(heartbeat)
  }
}
