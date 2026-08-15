'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mappingActionSchema, syncActionSchema, syncRunSchema, validateWexEnvironment } from '@/lib/integrations/wex/schemas'
import { syncWexFuelCards } from '@/lib/integrations/wex/sync'

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
  const { data: run, error } = await db
    .from('fuel_card_sync_runs')
    .insert({
      provider: 'wex_efs',
      status: 'running',
      created_by: auth.user.id,
      metadata: { stage: 'queued', updatedAt: new Date().toISOString() },
    })
    .select('id')
    .single()
  if (error || !run) {
    console.error('[WEX sync] Could not create synchronization audit row.', {
      stage: 'audit_insert',
      code: error?.code ?? 'NO_ROW_RETURNED',
      message: error?.message ?? 'Insert returned no row.',
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
  console.info('[WEX sync] Synchronization started.', { stage: 'started', runId: run.id })
  return { ok: true as const, runId: run.id }
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
    .eq('created_by', auth.user.id)
    .single()

  if (runError || !run || run.status !== 'running') {
    return { ok: false as const, message: 'This synchronization run is unavailable or has already finished.' }
  }

  try {
    const counts = await syncWexFuelCards(runId)
    console.info('[WEX sync] Synchronization completed.', { stage: 'completed', runId, ...counts })
    revalidatePath('/crm/fuel-cards'); revalidatePath('/crm/customers'); revalidatePath('/crm/transactions'); revalidatePath('/crm/dashboard')
    return { ok: true as const, message: `Synchronized ${counts.customers} customers, ${counts.received} cards, and ${counts.transactions} transactions. ${counts.unmatched} cards unmatched.` }
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\b\d{8,}\b/g, '[redacted]') : 'WEX synchronization failed.'
    console.error('[WEX sync] Synchronization failed.', {
      stage: 'provider_or_upsert',
      runId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message,
    })
    await db.from('fuel_card_sync_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_message: message }).eq('id', runId)
    return { ok: false as const, message }
  }
}

export async function syncWexCards(input: unknown) {
  const started = await startWexSync(input)
  if (!started.ok) return started
  return executeWexSync({ runId: started.runId })
}

export async function assignFuelCard(input: unknown) {
  const values = mappingActionSchema.parse(input)
  const auth = await requireAdmin()
  if (!auth.user) return { ok: false, message: auth.error ?? 'Not authorized.' }
  const db = createAdminClient()
  if (values.customerId) {
    const { error } = await db.from('fuel_card_customer_mappings').upsert({ fuel_card_id: values.fuelCardId, customer_id: values.customerId, match_method: 'manual', match_confidence: 'confirmed', is_confirmed: true, confirmed_by: auth.user.id, confirmed_at: new Date().toISOString() }, { onConflict: 'fuel_card_id' })
    if (error) return { ok: false, message: 'Assignment could not be saved.' }
  } else await db.from('fuel_card_customer_mappings').delete().eq('fuel_card_id', values.fuelCardId)
  await db.from('fuel_cards').update({ customer_id: values.customerId }).eq('id', values.fuelCardId)
  revalidatePath('/crm/fuel-cards'); revalidatePath(`/crm/fuel-cards/${values.fuelCardId}`)
  return { ok: true, message: values.customerId ? 'Customer assignment saved.' : 'Customer assignment removed.' }
}
