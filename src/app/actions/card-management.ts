'use server'

import { createHash, createHmac } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/supabase/server'
import { cardLimitsActionSchema, cardOrderActionSchema, cardReplacementActionSchema, cardStatusActionSchema, validateWexEnvironment } from '@/lib/integrations/wex/schemas'
import { createAndSubmitCardOrder, getAllowedOrderTypes, getCardRefreshingLimits, getCardSummariesV2, getCardV2, loginToWex, replaceWexCard, setCardRefreshingLimits, setCardV2 } from '@/lib/integrations/wex/client'
import { WexError } from '@/lib/integrations/wex/errors'
import type { WexAllowedOrderType } from '@/lib/integrations/wex/types'

const CARD_MANAGEMENT_ROLES = ['owner', 'general_manager'] as const
const CARD_ISSUER_ROLES = ['owner', 'general_manager'] as const
type Db = ReturnType<typeof createAdminClient>
type OperationType = 'freeze' | 'unfreeze' | 'set_limits' | 'issue' | 'replace_lost' | 'replace_stolen' | 'reissue_damaged'

export type CardManagementResult = {
  ok: boolean
  message: string
  operationId?: string
  providerReference?: string
}

function normalizedCardNumber(value: string) {
  return value.replace(/\D/g, '') || value.trim()
}

function fingerprintCard(value: string) {
  const secret = process.env.WEX_CARD_FINGERPRINT_SECRET
  if (!secret) throw new WexError('WEX card fingerprint configuration is missing.', 'configuration')
  return createHmac('sha256', secret).update(normalizedCardNumber(value)).digest('hex')
}

function publicError(error: unknown, fallback: string) {
  if (!(error instanceof WexError)) return fallback
  if (/does not allow Refreshing Limits|Velocity Limits/i.test(error.message)) {
    return 'WEX has not enabled per-card dollar limits for this account. Ask the WEX account representative to enable Refreshing Limits / Velocity Limits.'
  }
  if (error.kind === 'authentication') return 'WEX rejected the configured card-management credentials.'
  if (error.kind === 'configuration') return 'WEX card management is not fully configured.'
  if (error.kind === 'network' || error.retryable) return 'WEX is temporarily unavailable. No automatic retry was made for this card change.'
  if (error.kind === 'provider_rejected') return error.message
  return fallback
}

async function beginOperation(db: Db, values: {
  idempotencyKey: string
  type: OperationType
  requestedBy: string
  fuelCardId?: string | null
  customerId?: string | null
  requestSummary: Record<string, unknown>
  requestFingerprint?: string | null
}) {
  if (values.fuelCardId) {
    const { data, error } = await db.rpc('begin_fuel_card_operation', {
      p_fuel_card_id: values.fuelCardId,
      p_expected_customer_id: values.customerId ?? null,
      p_operation_type: values.type,
      p_idempotency_key: values.idempotencyKey,
      p_request_summary: values.requestSummary,
      p_requested_by: values.requestedBy,
    })
    if (error || !data) {
      if (error?.code === '42501' || error?.code === 'P0002') {
        throw new WexError('The selected card changed accounts before the operation started.', 'validation')
      }
      throw new Error(error?.code === '42883' ? 'CARD_MANAGEMENT_MIGRATION_MISSING' : 'OPERATION_AUDIT_FAILED')
    }
    const operation = data as { id: string; status: string; error_message: string | null; provider_reference: string | null; existing: boolean }
    return { operation, existing: operation.existing }
  }

  const { data, error } = await db.from('fuel_card_operations').insert({
    provider: 'wex_efs', fuel_card_id: values.fuelCardId ?? null, customer_id: values.customerId ?? null,
    operation_type: values.type, status: 'in_progress', idempotency_key: values.idempotencyKey,
    request_summary: values.requestSummary, request_fingerprint: values.requestFingerprint ?? null,
    requested_by: values.requestedBy, started_at: new Date().toISOString(),
  }).select('id,status,error_message,provider_reference').single()
  if (!error && data) return { operation: data, existing: false }
  if (error?.code === '23505') {
    const existing = await db.from('fuel_card_operations').select('id,status,error_message,provider_reference').eq('idempotency_key', values.idempotencyKey).single()
    if (existing.data) return { operation: existing.data, existing: true }
    if (values.requestFingerprint) {
      const duplicate = await db.from('fuel_card_operations').select('id,status,error_message,provider_reference').eq('operation_type', values.type).eq('request_fingerprint', values.requestFingerprint).single()
      if (duplicate.data) return { operation: duplicate.data, existing: true }
    }
  }
  throw new Error(error?.code === '42P01' ? 'CARD_MANAGEMENT_MIGRATION_MISSING' : 'OPERATION_AUDIT_FAILED')
}

function existingOperationResult(operation: { id: string, status: string, error_message: string | null, provider_reference: string | null }): CardManagementResult {
  if (operation.status === 'succeeded') return { ok: true, operationId: operation.id, providerReference: operation.provider_reference ?? undefined, message: 'This request was already completed.' }
  if (operation.status === 'failed') return { ok: false, operationId: operation.id, message: operation.error_message ?? 'This request previously failed.' }
  return { ok: false, operationId: operation.id, message: 'This request is already being processed. Refresh shortly for its latest status.' }
}

async function finishOperation(db: Db, operationId: string, values: {
  status: 'succeeded' | 'failed' | 'needs_attention'
  previousState?: Record<string, unknown>
  resultSummary?: Record<string, unknown>
  providerReference?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}) {
  await db.from('fuel_card_operations').update({
    status: values.status,
    previous_state: values.previousState ?? {},
    result_summary: values.resultSummary ?? {},
    provider_reference: values.providerReference ?? null,
    error_code: values.errorCode ?? null,
    error_message: values.errorMessage ?? null,
    completed_at: new Date().toISOString(),
  }).eq('id', operationId)
}

async function authorizeCardManager() {
  const { profile, error } = await requireRoles(CARD_MANAGEMENT_ROLES)
  if (error || !profile) return null
  return profile
}

async function authorizeCardIssuer() {
  const { profile, error } = await requireRoles(CARD_ISSUER_ROLES)
  if (error || !profile) return null
  return profile
}

async function authorizeCardTarget(
  db: Db,
  _profile: { role: string },
  fuelCardId: string,
) {
  const { data: card } = await db.from('fuel_cards')
    .select('id,customer_id')
    .eq('id', fuelCardId)
    .eq('provider', 'wex_efs')
    .maybeSingle()
  if (!card) return null
  return card
}

function revalidateCardViews(cardId: string) {
  revalidatePath('/crm/fuel-cards')
  revalidatePath(`/crm/fuel-cards/${cardId}`)
  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/fuel-cards')
  revalidatePath(`/portal/fuel-cards/${cardId}`)
}

function configurationReady() {
  return validateWexEnvironment().ok
}

function newYorkBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = new Map(parts.map((part) => [part.type, part.value]))
  return `${value.get('year')}-${value.get('month')}-${value.get('day')}`
}

function orderFingerprint(order: ReturnType<typeof cardOrderActionSchema.parse>) {
  const normalized = {
    businessDate: newYorkBusinessDate(), customerId: order.customerId, orderType: order.orderType,
    policyNumber: order.policyNumber, cardStyle: order.cardStyle, embossedName: order.embossedName.toUpperCase(),
    recipient: `${order.shipToFirst} ${order.shipToLast}`.toUpperCase(),
    address1: order.shipToAddress1.toUpperCase(), address2: order.shipToAddress2.toUpperCase(),
    city: order.shipToCity.toUpperCase(), state: order.shipToState, zip: order.shipToZip,
    shippingMethod: order.shippingMethod, rushProcessing: order.rushProcessing, cardCarrier: order.cardCarrier.toUpperCase(),
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

async function resolveProviderCard(db: Db, fuelCardId: string, clientId: string) {
  const { data: localCard, error } = await db.from('fuel_cards')
    .select('id,card_fingerprint,card_last4,status,customer_id')
    .eq('id', fuelCardId).eq('provider', 'wex_efs').single()
  if (error || !localCard?.card_fingerprint) throw new WexError('The selected WEX card could not be found.', 'validation')
  const summaries = await getCardSummariesV2(clientId)
  const providerCard = summaries.find((card) => fingerprintCard(card.cardNumber) === localCard.card_fingerprint)
  if (!providerCard) throw new WexError('The selected card is no longer present in the WEX inventory.', 'validation')
  return { localCard, providerCard }
}

export async function changeFuelCardStatus(input: unknown): Promise<CardManagementResult> {
  const profile = await authorizeCardManager()
  if (!profile) return { ok: false, message: 'You do not have permission to change card status.' }
  const parsed = cardStatusActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid card-status request.' }
  if (!configurationReady()) return { ok: false, message: 'WEX card management is not fully configured.' }

  const db = createAdminClient()
  let operationId: string | null = null
  let mutationSent = false
  try {
    const authorizedCard = await authorizeCardTarget(db, profile, parsed.data.fuelCardId)
    if (!authorizedCard) return { ok: false, message: 'This fuel card is not available to your account.' }
    const started = await beginOperation(db, {
      idempotencyKey: parsed.data.idempotencyKey, type: parsed.data.action, requestedBy: profile.auth_user_id,
      fuelCardId: parsed.data.fuelCardId, customerId: authorizedCard.customer_id,
      requestSummary: { targetStatus: parsed.data.action === 'freeze' ? 'INACTIVE' : 'ACTIVE' },
    })
    const activeOperationId = String(started.operation.id)
    operationId = activeOperationId
    if (started.existing) return existingOperationResult(started.operation)

    const clientId = await loginToWex()
    const { localCard, providerCard } = await resolveProviderCard(db, parsed.data.fuelCardId, clientId)
    if (localCard.customer_id !== authorizedCard.customer_id) throw new WexError('The selected card changed accounts before WEX was contacted.', 'validation')
    const detail = await getCardV2(clientId, providerCard.cardNumber)
    const currentStatus = (detail.header.status ?? providerCard.status).toUpperCase()
    const targetStatus = parsed.data.action === 'freeze' ? 'INACTIVE' : 'ACTIVE'
    const requiredStatus = parsed.data.action === 'freeze' ? 'ACTIVE' : 'INACTIVE'
    if (currentStatus === 'FRAUD') throw new WexError('Fraud-blocked cards cannot be reactivated from the CRM.', 'provider_rejected')
    if (currentStatus !== requiredStatus && currentStatus !== targetStatus) {
      throw new WexError(`WEX reports this card as ${currentStatus}; it cannot be ${parsed.data.action}d from that state.`, 'provider_rejected')
    }
    if (currentStatus !== targetStatus) {
      detail.header.status = targetStatus
      mutationSent = true
      await setCardV2(clientId, detail)
    }
    const confirmed = await getCardV2(clientId, providerCard.cardNumber)
    const confirmedStatus = (confirmed.header.status ?? '').toUpperCase()
    if (confirmedStatus !== targetStatus) {
      await finishOperation(db, activeOperationId, {
        status: 'needs_attention', previousState: { status: currentStatus }, resultSummary: { status: confirmedStatus || 'UNKNOWN' },
        errorCode: 'READBACK_MISMATCH', errorMessage: 'WEX accepted the request but did not confirm the expected card status.',
      })
      return { ok: false, operationId: activeOperationId, message: 'WEX did not confirm the expected status. The operation was marked for review.' }
    }
    await db.from('fuel_cards').update({ status: confirmedStatus, last_synced_at: new Date().toISOString() }).eq('id', localCard.id)
    await finishOperation(db, activeOperationId, { status: 'succeeded', previousState: { status: currentStatus }, resultSummary: { status: confirmedStatus } })
    revalidateCardViews(localCard.id)
    return { ok: true, operationId: activeOperationId, message: parsed.data.action === 'freeze' ? 'Card frozen in WEX.' : 'Card reactivated in WEX.' }
  } catch (error) {
    const message = error instanceof Error && error.message === 'CARD_MANAGEMENT_MIGRATION_MISSING'
      ? 'Apply the card-management database migration before using this action.'
      : publicError(error, 'WEX could not complete the card-status change.')
    if (operationId) await finishOperation(db, operationId, {
      status: mutationSent ? 'needs_attention' : 'failed', errorCode: error instanceof WexError ? error.kind : 'INTERNAL', errorMessage: message,
    })
    return { ok: false, operationId: operationId ?? undefined, message }
  }
}

export async function setFuelCardLimits(input: unknown): Promise<CardManagementResult> {
  const profile = await authorizeCardManager()
  if (!profile) return { ok: false, message: 'You do not have permission to change card limits.' }
  const parsed = cardLimitsActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter valid card limits.' }
  if (!configurationReady()) return { ok: false, message: 'WEX card management is not fully configured.' }

  const db = createAdminClient()
  let operationId: string | null = null
  let mutationSent = false
  const requested = {
    dailyAmount: parsed.data.dailyAmount, weeklyAmount: parsed.data.weeklyAmount, monthlyAmount: parsed.data.monthlyAmount,
    dailyTransactions: parsed.data.dailyTransactions, weeklyTransactions: parsed.data.weeklyTransactions, monthlyTransactions: parsed.data.monthlyTransactions,
  }
  try {
    const authorizedCard = await authorizeCardTarget(db, profile, parsed.data.fuelCardId)
    if (!authorizedCard) return { ok: false, message: 'This fuel card is not available to your account.' }
    const started = await beginOperation(db, {
      idempotencyKey: parsed.data.idempotencyKey, type: 'set_limits', requestedBy: profile.auth_user_id,
      fuelCardId: parsed.data.fuelCardId, customerId: authorizedCard.customer_id, requestSummary: requested,
    })
    const activeOperationId = String(started.operation.id)
    operationId = activeOperationId
    if (started.existing) return existingOperationResult(started.operation)
    const clientId = await loginToWex()
    const { localCard, providerCard } = await resolveProviderCard(db, parsed.data.fuelCardId, clientId)
    if (localCard.customer_id !== authorizedCard.customer_id) throw new WexError('The selected card changed accounts before WEX was contacted.', 'validation')
    const previous = await getCardRefreshingLimits(clientId, providerCard.cardNumber)
    const next = {
      refreshingLimitSource: previous.refreshingLimitSource || 'CARD',
      dayCountLimit: parsed.data.dailyTransactions, dayAmountLimit: parsed.data.dailyAmount,
      weekCountLimit: parsed.data.weeklyTransactions, weekAmountLimit: parsed.data.weeklyAmount,
      monthCountLimit: parsed.data.monthlyTransactions, monthAmountLimit: parsed.data.monthlyAmount,
    }
    mutationSent = true
    await setCardRefreshingLimits(clientId, providerCard.cardNumber, next)
    const confirmed = await getCardRefreshingLimits(clientId, providerCard.cardNumber)
    const matches = confirmed.dayCountLimit === next.dayCountLimit && confirmed.dayAmountLimit === next.dayAmountLimit
      && confirmed.weekCountLimit === next.weekCountLimit && confirmed.weekAmountLimit === next.weekAmountLimit
      && confirmed.monthCountLimit === next.monthCountLimit && confirmed.monthAmountLimit === next.monthAmountLimit
    if (!matches) {
      await finishOperation(db, activeOperationId, { status: 'needs_attention', previousState: previous, resultSummary: confirmed, errorCode: 'READBACK_MISMATCH', errorMessage: 'WEX did not confirm all requested card limits.' })
      return { ok: false, operationId: activeOperationId, message: 'WEX did not confirm all requested limits. The operation was marked for review.' }
    }
    await db.from('fuel_cards').update({
      refreshing_limit_source: confirmed.refreshingLimitSource,
      daily_limit: confirmed.dayAmountLimit ?? 0, weekly_limit: confirmed.weekAmountLimit ?? 0, monthly_limit: confirmed.monthAmountLimit ?? 0,
      daily_transaction_limit: confirmed.dayCountLimit, weekly_transaction_limit: confirmed.weekCountLimit, monthly_transaction_limit: confirmed.monthCountLimit,
      last_synced_at: new Date().toISOString(),
    }).eq('id', localCard.id)
    await finishOperation(db, activeOperationId, { status: 'succeeded', previousState: previous, resultSummary: confirmed })
    revalidateCardViews(localCard.id)
    return { ok: true, operationId: activeOperationId, message: 'Card spending limits updated in WEX.' }
  } catch (error) {
    const message = error instanceof Error && error.message === 'CARD_MANAGEMENT_MIGRATION_MISSING'
      ? 'Apply the card-management database migration before using this action.'
      : publicError(error, 'WEX could not update this card’s limits.')
    if (operationId) await finishOperation(db, operationId, {
      status: mutationSent ? 'needs_attention' : 'failed', errorCode: error instanceof WexError ? error.kind : 'INTERNAL', errorMessage: message,
    })
    return { ok: false, operationId: operationId ?? undefined, message }
  }
}

export async function loadWexCardOrderOptions(): Promise<{ ok: boolean, options: WexAllowedOrderType[], message: string }> {
  const profile = await authorizeCardIssuer()
  if (!profile) return { ok: false, options: [], message: 'Only owners and general managers can issue cards.' }
  if (!configurationReady()) return { ok: false, options: [], message: 'WEX card management is not fully configured.' }
  try {
    const clientId = await loginToWex()
    const options = await getAllowedOrderTypes(clientId)
    return options.length
      ? { ok: true, options, message: 'WEX card-order options loaded.' }
      : { ok: false, options: [], message: 'WEX has not enabled API card ordering for this account. Ask the WEX account representative to enable an allowed card-order type.' }
  } catch (error) {
    return { ok: false, options: [], message: publicError(error, 'WEX card-order options could not be loaded.') }
  }
}

export async function issueFuelCard(input: unknown): Promise<CardManagementResult> {
  const profile = await authorizeCardIssuer()
  if (!profile) return { ok: false, message: 'Only owners and general managers can issue cards.' }
  const parsed = cardOrderActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter valid card-order details.' }
  if (!configurationReady()) return { ok: false, message: 'WEX card management is not fully configured.' }

  const db = createAdminClient()
  let operationId: string | null = null
  let mutationSent = false
  try {
    const started = await beginOperation(db, {
      idempotencyKey: parsed.data.idempotencyKey, type: 'issue', requestedBy: profile.auth_user_id,
      customerId: parsed.data.customerId,
      requestFingerprint: orderFingerprint(parsed.data),
      requestSummary: {
        orderType: parsed.data.orderType, policyNumber: parsed.data.policyNumber, cardStyle: parsed.data.cardStyle,
        embossedName: parsed.data.embossedName, recipient: `${parsed.data.shipToFirst} ${parsed.data.shipToLast}`,
        city: parsed.data.shipToCity, state: parsed.data.shipToState, zip: parsed.data.shipToZip,
        shippingMethod: parsed.data.shippingMethod, rushProcessing: parsed.data.rushProcessing,
      },
    })
    const activeOperationId = String(started.operation.id)
    operationId = activeOperationId
    if (started.existing) return existingOperationResult(started.operation)
    const clientId = await loginToWex()
    const allowed = await getAllowedOrderTypes(clientId)
    const selected = allowed.find((option) => option.orderType === parsed.data.orderType
      && option.defaultPolicy === parsed.data.policyNumber && option.defaultCardStyle === parsed.data.cardStyle)
    if (!selected) throw new WexError('WEX has not enabled the selected card-order type for this account.', 'provider_rejected')
    mutationSent = true
    const result = await createAndSubmitCardOrder(clientId, {
      policyNumber: parsed.data.policyNumber, orderType: parsed.data.orderType, cardStyle: parsed.data.cardStyle,
      embossedName: parsed.data.embossedName, shipToFirst: parsed.data.shipToFirst, shipToLast: parsed.data.shipToLast,
      shipToAddress1: parsed.data.shipToAddress1, shipToAddress2: parsed.data.shipToAddress2,
      shipToCity: parsed.data.shipToCity, shipToState: parsed.data.shipToState, shipToZip: parsed.data.shipToZip,
      shipToCountry: 'US', shippingMethod: parsed.data.shippingMethod,
      rushProcessing: parsed.data.rushProcessing ? 'Y' : 'N', cardCarrier: parsed.data.cardCarrier,
    })
    if (!result.orderId) {
      await finishOperation(db, activeOperationId, { status: 'needs_attention', resultSummary: { submitted: true }, errorCode: 'ORDER_ID_MISSING', errorMessage: 'WEX accepted the order but did not return an order number.' })
      return { ok: false, operationId: activeOperationId, message: 'WEX accepted the order but returned no order number. The request was marked for review.' }
    }
    await finishOperation(db, activeOperationId, { status: 'succeeded', providerReference: result.orderId, resultSummary: { orderId: result.orderId, submitted: true } })
    revalidatePath('/crm/fuel-cards')
    return { ok: true, operationId: activeOperationId, providerReference: result.orderId, message: `Card order ${result.orderId} submitted to WEX.` }
  } catch (error) {
    const message = error instanceof Error && error.message === 'CARD_MANAGEMENT_MIGRATION_MISSING'
      ? 'Apply the card-management database migration before using this action.'
      : publicError(error, 'WEX could not submit the card order.')
    if (operationId) await finishOperation(db, operationId, {
      status: mutationSent ? 'needs_attention' : 'failed', errorCode: error instanceof WexError ? error.kind : 'INTERNAL', errorMessage: message,
    })
    return { ok: false, operationId: operationId ?? undefined, message }
  }
}

export async function replaceFuelCard(input: unknown): Promise<CardManagementResult> {
  const profile = await authorizeCardManager()
  if (!profile) return { ok: false, message: 'You do not have permission to replace cards.' }
  const parsed = cardReplacementActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter valid replacement details.' }
  if (!configurationReady()) return { ok: false, message: 'WEX card management is not fully configured.' }

  const db = createAdminClient()
  let operationId: string | null = null
  let mutationSent = false
  const operationType: OperationType = parsed.data.replacementType === 'damaged'
    ? 'reissue_damaged'
    : parsed.data.replacementType === 'stolen' ? 'replace_stolen' : 'replace_lost'
  try {
    const authorizedCard = await authorizeCardTarget(db, profile, parsed.data.fuelCardId)
    if (!authorizedCard) return { ok: false, message: 'This fuel card is not available to your account.' }
    const started = await beginOperation(db, {
      idempotencyKey: parsed.data.idempotencyKey,
      type: operationType,
      requestedBy: profile.auth_user_id,
      fuelCardId: parsed.data.fuelCardId,
      customerId: authorizedCard.customer_id,
      requestSummary: {
        replacementType: parsed.data.replacementType,
        recipient: `${parsed.data.shipToFirst} ${parsed.data.shipToLast}`,
        city: parsed.data.shipToCity,
        state: parsed.data.shipToState,
        zip: parsed.data.shipToZip,
        shippingMethod: parsed.data.shippingMethod,
        rushProcessing: parsed.data.rushProcessing,
        reason: parsed.data.reason,
      },
    })
    const activeOperationId = String(started.operation.id)
    operationId = activeOperationId
    if (started.existing) return existingOperationResult(started.operation)

    const clientId = await loginToWex()
    const { localCard, providerCard } = await resolveProviderCard(db, parsed.data.fuelCardId, clientId)
    if (localCard.customer_id !== authorizedCard.customer_id) throw new WexError('The selected card changed accounts before WEX was contacted.', 'validation')
    mutationSent = true
    const result = await replaceWexCard(clientId, {
      cardNumber: providerCard.cardNumber,
      shipToFirst: parsed.data.shipToFirst,
      shipToLast: parsed.data.shipToLast,
      shipToAddress1: parsed.data.shipToAddress1,
      shipToAddress2: parsed.data.shipToAddress2,
      shipToCity: parsed.data.shipToCity,
      shipToState: parsed.data.shipToState,
      shipToZip: parsed.data.shipToZip,
      shipToCountry: 'US',
      shippingMethod: parsed.data.shippingMethod,
      rushProcessing: parsed.data.rushProcessing ? 'Y' : 'N',
      reason: parsed.data.reason,
    }, parsed.data.replacementType === 'damaged')
    if (!result.orderId) {
      await finishOperation(db, activeOperationId, {
        status: 'needs_attention', resultSummary: { submitted: true }, errorCode: 'ORDER_ID_MISSING',
        errorMessage: 'WEX accepted the replacement but did not return an order number.',
      })
      return { ok: false, operationId: activeOperationId, message: 'WEX accepted the replacement but returned no order number. The request was marked for review.' }
    }
    await finishOperation(db, activeOperationId, {
      status: 'succeeded', providerReference: result.orderId,
      resultSummary: { orderId: result.orderId, replacementType: parsed.data.replacementType, submitted: true },
    })
    revalidateCardViews(localCard.id)
    return { ok: true, operationId: activeOperationId, providerReference: result.orderId, message: `Replacement order ${result.orderId} submitted to WEX.` }
  } catch (error) {
    const message = error instanceof Error && error.message === 'CARD_MANAGEMENT_MIGRATION_MISSING'
      ? 'Apply the card-replacement database migration before using this action.'
      : publicError(error, 'WEX could not submit the replacement request.')
    if (operationId) await finishOperation(db, operationId, {
      status: mutationSent ? 'needs_attention' : 'failed', errorCode: error instanceof WexError ? error.kind : 'INTERNAL', errorMessage: message,
    })
    return { ok: false, operationId: operationId ?? undefined, message }
  }
}
