'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mappingActionSchema, syncActionSchema, syncRunSchema, validateWexEnvironment } from '@/lib/integrations/wex/schemas'

export async function startWexSync(input: unknown) {
  syncActionSchema.parse(input)
  const environment = validateWexEnvironment()
  if (!environment.ok) {
    console.error('[WEX sync] Configuration validation failed.', {
      stage: 'configuration',
      invalidVariables: environment.missing,
    })
    return { ok: false, message: `WEX configuration is incomplete: ${environment.missing.join(', ')}.` }
  }
  const auth = await requireAdmin()
  if (!auth.user) {
    console.error('[WEX sync] Authorization failed.', { stage: 'authorization' })
    return { ok: false, message: auth.error ?? 'Not authorized.' }
  }
  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch (error) {
    console.error('[WEX sync] Server database configuration failed.', {
      stage: 'database_configuration',
      message: error instanceof Error ? error.message : 'Unknown configuration error',
    })
    return { ok: false, message: 'Server database configuration is incomplete.' }
  }
  const { data: runId, error } = await db.rpc('enqueue_wex_manual_sync', { p_created_by: auth.user.id })
  if (error || !runId) {
    console.error('[WEX sync] Could not create synchronization audit row.', {
      stage: 'audit_insert',
      code: error?.code ?? 'NO_ROW_RETURNED',
      message: error?.message ?? 'Enqueue returned no run.',
      details: error?.details ?? null,
      hint: error?.hint ?? null,
    })
    const reason = error?.code === '42P01'
      ? 'The fuel-card database migration has not been applied.'
      : error?.code === '23503'
        ? 'The signed-in administrator does not exist in this Supabase project.'
        : error?.code === '42501'
          ? 'The configured Supabase secret key cannot create synchronization records.'
          : 'Check the server console for the safe Supabase error code.'
    return { ok: false as const, message: `Could not start synchronization. ${reason}` }
  }
  console.info('[WEX sync] Synchronization queued.', { stage: 'queued', runId })
  return { ok: true as const, runId, message: 'WEX synchronization was queued and will continue in the background.' }
}

export async function executeWexSync(input: unknown) {
  const { runId } = syncRunSchema.parse(input)
  const environment = validateWexEnvironment()
  if (!environment.ok) return { ok: false as const, message: `WEX configuration is incomplete: ${environment.missing.join(', ')}.` }

  const auth = await requireAdmin()
  if (!auth.user) return { ok: false as const, message: auth.error ?? 'Not authorized.' }

  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch {
    return { ok: false as const, message: 'Server database configuration is incomplete.' }
  }

  const { data: run, error: runError } = await db
    .from('fuel_card_sync_runs')
    .select('id,status')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return { ok: false as const, message: 'This synchronization run is unavailable.' }
  }
  return { ok: true as const, message: run.status === 'succeeded' ? 'Synchronization is complete.' : 'Synchronization is running in the background.' }
}

export async function syncWexCards(input: unknown) {
  return startWexSync(input)
}

export async function ensureWexSyncFresh() {
  const auth = await requireAdmin()
  if (!auth.user) return { ok: false as const }
  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch {
    return { ok: false as const }
  }
  const { data } = await db.from('wex_sync_state').select('resource,last_succeeded_at').eq('provider', 'wex_efs')
  const lastSuccess = new Map((data ?? []).map((row: any) => [row.resource, row.last_succeeded_at ? Date.parse(row.last_succeeded_at) : 0]))
  const now = Date.now()
  const requests: Array<PromiseLike<unknown>> = []
  if (now - (lastSuccess.get('transactions') ?? 0) > 7 * 60_000) {
    requests.push(db.rpc('enqueue_wex_incremental_job', { p_created_by: null, p_force: false }))
  }
  if (now - (lastSuccess.get('account') ?? 0) > 35 * 60_000) {
    requests.push(db.rpc('enqueue_wex_account_snapshot_job', { p_created_by: null, p_force: false }))
  }
  await Promise.all(requests)
  return { ok: true as const }
}

export async function assignFuelCard(input: unknown) {
  const values = mappingActionSchema.parse(input)
  const auth = await requireAdmin()
  if (!auth.user) return { ok: false, message: auth.error ?? 'Not authorized.' }
  const db = createAdminClient()
  const { error } = await db.rpc('assign_fuel_card_customer', {
    p_fuel_card_id: values.fuelCardId,
    p_customer_id: values.customerId,
    p_confirmed_by: auth.user.id,
  })
  if (error) {
    return {
      ok: false,
      message: error.code === '55000'
        ? 'This card has a provider operation in progress. Wait for it to finish before changing the customer.'
        : 'Assignment could not be saved.',
    }
  }
  revalidatePath('/crm/fuel-cards'); revalidatePath(`/crm/fuel-cards/${values.fuelCardId}`)
  return { ok: true, message: values.customerId ? 'Customer assignment saved.' : 'Customer assignment removed.' }
}
