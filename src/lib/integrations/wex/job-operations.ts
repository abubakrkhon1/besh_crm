import 'server-only'

import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAccountCreditKpis } from './account-kpis'
import { accumulateCustomerSpend, roundCurrency, type CustomerSpendTotals } from './customer-kpis'
import {
  getAccountTransactionsV3,
  getCardSummariesV2,
  getCarrierInfo,
  getChildTransactionsNewV3,
  getContracts,
  getCreditLimits,
  loginToWex,
} from './client'
import type { WexCard, WexTransaction } from './types'

type Db = ReturnType<typeof createAdminClient>
type CarrierRecord = { carrierId: string, companyXRef: string | null }
type CustomerMaps = {
  byCarrier: Map<string, string>
  byXref: Map<string, string>
  byDriver: Map<string, string>
  created: number
}

const KPI_PAGE_SIZE = 1_000
const batches = <T,>(items: T[], size = 250) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
const normalizedCardNumber = (value: string) => value.replace(/\D/g, '') || value.trim()

function fingerprintCard(value: string) {
  const secret = process.env.WEX_CARD_FINGERPRINT_SECRET
  if (!secret) throw new Error('WEX card fingerprint configuration is missing.')
  return createHmac('sha256', secret).update(normalizedCardNumber(value)).digest('hex')
}

async function ensureCustomers(db: Db, carriers: CarrierRecord[], synchronizedAt: string): Promise<CustomerMaps> {
  const { data: currentCustomers, error } = await db
    .from('customers')
    .select('id,wex_carrier_id,wex_company_xref,wex_external_driver_id')
  if (error) throw new Error('Existing customers could not be loaded for WEX matching.')

  let byCarrier = new Map<string, string>((currentCustomers ?? []).filter((customer: any) => customer.wex_carrier_id).map((customer: any) => [customer.wex_carrier_id, customer.id]))
  let byXref = new Map<string, string>((currentCustomers ?? []).filter((customer: any) => customer.wex_company_xref).map((customer: any) => [customer.wex_company_xref, customer.id]))
  const byDriver = new Map<string, string>((currentCustomers ?? []).filter((customer: any) => customer.wex_external_driver_id).map((customer: any) => [customer.wex_external_driver_id, customer.id]))
  const uniqueCarriers = [...new Map(carriers.map((carrier) => [carrier.carrierId, carrier])).values()]
  const rows = uniqueCarriers
    .filter((carrier) => !byCarrier.has(carrier.carrierId) && !(carrier.companyXRef && byXref.has(carrier.companyXRef)))
    .map((carrier) => ({
      type: 'company',
      status: 'active',
      provider: 'wex_efs',
      wex_carrier_id: carrier.carrierId,
      wex_company_xref: carrier.companyXRef,
      company_name: carrier.companyXRef || `WEX Carrier ${carrier.carrierId}`,
      last_synced_at: synchronizedAt,
    }))

  for (const batch of batches(rows)) {
    const { error: insertError } = await db.from('customers').insert(batch)
    if (insertError && insertError.code !== '23505') throw new Error('WEX customers could not be saved.')
  }

  if (rows.length) {
    const { data: refreshed, error: refreshError } = await db.from('customers').select('id,wex_carrier_id,wex_company_xref')
    if (refreshError) throw new Error('Synchronized customers could not be reloaded.')
    byCarrier = new Map<string, string>((refreshed ?? []).filter((customer: any) => customer.wex_carrier_id).map((customer: any) => [customer.wex_carrier_id, customer.id]))
    byXref = new Map<string, string>((refreshed ?? []).filter((customer: any) => customer.wex_company_xref).map((customer: any) => [customer.wex_company_xref, customer.id]))
  }

  return { byCarrier, byXref, byDriver, created: rows.length }
}

async function refreshCustomerSpendKpis(db: Db, customerIds: string[], synchronizedAt: string) {
  if (!customerIds.length) return
  const monthStart = new Date(synchronizedAt)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const totals: CustomerSpendTotals = new Map(customerIds.map((customerId) => [customerId, { monthlySpend: 0, lifetimeSpend: 0 }]))

  for (let offset = 0; ; offset += KPI_PAGE_SIZE) {
    const { data, error } = await db.from('fuel_transactions')
      .select('id,customer_id,amount,transaction_date')
      .in('customer_id', customerIds)
      .eq('status', 'posted')
      .order('id', { ascending: true })
      .range(offset, offset + KPI_PAGE_SIZE - 1)
    if (error) throw new Error('Customer spend transactions could not be loaded for KPI refresh.')
    accumulateCustomerSpend(totals, data ?? [], monthStart.toISOString())
    if (!data || data.length < KPI_PAGE_SIZE) break
  }

  for (const [customerId, spend] of totals) {
    const { error } = await db.from('customers').update({
      monthly_spend: roundCurrency(spend.monthlySpend),
      lifetime_spend: roundCurrency(spend.lifetimeSpend),
      last_synced_at: synchronizedAt,
    }).eq('id', customerId)
    if (error) throw new Error('Customer spend KPIs could not be updated.')
  }
}

async function saveCards(db: Db, cards: WexCard[], carrier: CarrierRecord, customers: CustomerMaps, synchronizedAt: string) {
  const fingerprints = cards.map((card) => fingerprintCard(card.cardNumber))
  const existingQuery = fingerprints.length
    ? db.from('fuel_cards').select('id,card_fingerprint').eq('provider', 'wex_efs').in('card_fingerprint', fingerprints)
    : Promise.resolve({ data: [], error: null })
  const [{ data: existing, error: existingError }, { data: mappings, error: mappingsError }] = await Promise.all([
    existingQuery,
    db.from('fuel_card_customer_mappings').select('fuel_card_id,customer_id,is_confirmed'),
  ])
  if (existingError || mappingsError) throw new Error('Existing card assignments could not be loaded.')
  const existingMap = new Map<string, string>((existing ?? []).map((item: any) => [item.card_fingerprint, item.id]))
  const confirmedMap = new Map<string, string>((mappings ?? []).filter((item: any) => item.is_confirmed).map((item: any) => [item.fuel_card_id, item.customer_id]))
  const soleCustomerId = customers.byCarrier.get(carrier.carrierId) ?? null
  const rows = cards.map((card, index) => {
    const fingerprint = fingerprints[index]
    const existingId = existingMap.get(fingerprint)
    const customerId = (existingId && confirmedMap.get(existingId))
      || (card.companyXRef && customers.byXref.get(card.companyXRef))
      || (card.driverId && customers.byDriver.get(card.driverId))
      || soleCustomerId
      || null
    return {
      provider: 'wex_efs', card_fingerprint: fingerprint, card_last4: normalizedCardNumber(card.cardNumber).slice(-4), customer_id: customerId,
      policy_number: card.policyNumber, company_xref: card.companyXRef, unit_number: card.unitNumber,
      external_driver_id: card.driverId, driver_name: card.driverName, override_code: card.override,
      is_overridden: card.beingOverridden, status: card.status, payroll_status: card.payrollStatus,
      payroll_use: card.payrollUse, gps_id: card.gpsid, vin: card.vin, zone_id: card.zid,
      info_source: card.infosrc, policy_subfleet: card.policySubfleet, card_subfleet: card.cardSubfleet,
      last_synced_at: synchronizedAt,
    }
  })
  for (const batch of batches(rows)) {
    const { error } = await db.from('fuel_cards').upsert(batch, { onConflict: 'provider,card_fingerprint' })
    if (error) throw new Error('Fuel card synchronization could not be saved.')
  }
  return {
    received: rows.length,
    created: rows.filter((row) => !existingMap.has(row.card_fingerprint)).length,
    updated: rows.filter((row) => existingMap.has(row.card_fingerprint)).length,
    unmatched: rows.filter((row) => !row.customer_id).length,
  }
}

async function saveTransactions(db: Db, transactions: WexTransaction[], synchronizedAt: string) {
  if (!transactions.length) return { transactions: 0, customers: 0, unmatched: 0 }
  const carriers = [...new Map(transactions.map((transaction) => [transaction.carrierId, {
    carrierId: transaction.carrierId,
    companyXRef: transaction.companyXRef,
  }])).values()]
  const customers = await ensureCustomers(db, carriers, synchronizedAt)
  const fingerprints = transactions.map((transaction) => fingerprintCard(transaction.cardNumber))
  const { data: savedCards, error } = await db.from('fuel_cards')
    .select('id,card_fingerprint,customer_id')
    .eq('provider', 'wex_efs')
    .in('card_fingerprint', [...new Set(fingerprints)])
  if (error) throw new Error('Synchronized cards could not be loaded for transaction matching.')
  const cardByFingerprint = new Map((savedCards ?? []).map((card: any) => [card.card_fingerprint, card]))
  let unmatched = 0
  const rows = transactions.flatMap((transaction, index) => {
    const card: any = cardByFingerprint.get(fingerprints[index])
    const customerId = card?.customer_id || customers.byCarrier.get(transaction.carrierId) || (transaction.companyXRef && customers.byXref.get(transaction.companyXRef))
    if (!customerId) {
      unmatched += 1
      return []
    }
    return [{
      provider: 'wex_efs', provider_transaction_id: transaction.transactionId,
      provider_transaction_type: transaction.transactionType, wex_carrier_id: transaction.carrierId,
      company_xref: transaction.companyXRef, customer_id: customerId, fuel_card_id: card?.id ?? null,
      type: 'fuel_purchase', status: 'posted', merchant_name: transaction.merchantName,
      merchant_address: transaction.merchantAddress, merchant_state: transaction.merchantState,
      gallons: transaction.gallons, amount: transaction.amount, savings: transaction.discountAmount,
      authorization_code: transaction.authorizationCode, invoice_number: transaction.invoiceNumber,
      contract_id: transaction.contractId, billing_currency: transaction.billingCurrency,
      funded_total: transaction.fundedTotal, settled_amount: transaction.settledAmount,
      preferred_total: transaction.preferredTotal, fees_total: transaction.feesTotal,
      pre_discount_tax: transaction.preDiscountTax, post_discount_tax: transaction.postDiscountTax,
      tax_exempt_amount: transaction.taxExemptAmount, wex_location_id: transaction.locationId,
      merchant_city: transaction.merchantCity, merchant_zip: transaction.merchantZip,
      merchant_country: transaction.merchantCountry, merchant_latitude: transaction.merchantLatitude,
      merchant_longitude: transaction.merchantLongitude, entry_mode: transaction.entryMode,
      hand_entered: transaction.handEntered, original_transaction_id: transaction.originalTransactionId,
      statement_id: transaction.statementId, prompt_values: transaction.promptValues,
      line_items: transaction.lineItems, taxes: transaction.taxes,
      transaction_date: transaction.transactionDate, last_synced_at: synchronizedAt,
    }]
  })
  for (const batch of batches(rows)) {
    const { error } = await db.from('fuel_transactions').upsert(batch, { onConflict: 'provider,provider_transaction_id' })
    if (error) throw new Error('WEX transactions could not be saved.')
  }
  await refreshCustomerSpendKpis(db, [...new Set(rows.map((row) => row.customer_id))], synchronizedAt)
  return { transactions: rows.length, customers: carriers.length, unmatched }
}

export async function syncWexAccountSnapshot() {
  const db = createAdminClient()
  const synchronizedAt = new Date().toISOString()
  const clientId = await loginToWex()
  const [cards, carrier, contracts] = await Promise.all([
    getCardSummariesV2(clientId),
    getCarrierInfo(clientId),
    getContracts(clientId),
  ])
  const creditLimits = await Promise.all(contracts.map((contract) => getCreditLimits(clientId, contract.contractId)))
  const customers = await ensureCustomers(db, [{ carrierId: carrier.carrierId, companyXRef: carrier.name }], synchronizedAt)
  const cardResult = await saveCards(db, cards, { carrierId: carrier.carrierId, companyXRef: carrier.name }, customers, synchronizedAt)
  const primaryCustomerId = customers.byCarrier.get(carrier.carrierId)
  if (primaryCustomerId && creditLimits.length) {
    const credit = calculateAccountCreditKpis(creditLimits)
    const { error } = await db.from('customers').update({
      credit_limit: credit.creditLimit,
      current_balance: credit.currentBalance,
      last_synced_at: synchronizedAt,
    }).eq('id', primaryCustomerId)
    if (error) throw new Error('Customer account credit KPIs could not be updated.')
  }
  return { ...cardResult, customers: 1, contracts: contracts.length }
}

export async function syncWexTransactionWindow(rangeStart: Date, rangeEnd: Date) {
  if (!(rangeStart < rangeEnd)) throw new Error('WEX transaction window is invalid.')
  const db = createAdminClient()
  const clientId = await loginToWex()
  const [accountTransactions, childTransactions] = await Promise.all([
    getAccountTransactionsV3(clientId, rangeStart, rangeEnd),
    getChildTransactionsNewV3(clientId, rangeStart, rangeEnd),
  ])
  const byId = new Map<string, WexTransaction>()
  ;[...accountTransactions, ...childTransactions].forEach((transaction) => byId.set(transaction.transactionId, transaction))
  return saveTransactions(db, [...byId.values()], new Date().toISOString())
}

export async function reconcileWexData() {
  const db = createAdminClient()
  const staleJobCutoff = new Date(Date.now() - 7 * 60_000).toISOString()
  const [{ count: customers }, { count: cards }, { count: transactions }, { count: unmatchedCards }, transactionState, deadJobs, staleJobs, openAlerts] = await Promise.all([
    db.from('customers').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
    db.from('fuel_cards').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
    db.from('fuel_transactions').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
    db.from('fuel_cards').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs').is('customer_id', null),
    db.from('wex_sync_state').select('last_succeeded_at').eq('provider', 'wex_efs').eq('resource', 'transactions').maybeSingle(),
    db.from('wex_sync_jobs').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs').eq('status', 'dead'),
    db.from('wex_sync_jobs').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs').eq('status', 'running').lt('lease_expires_at', staleJobCutoff),
    db.from('wex_sync_alerts').select('id,code').eq('provider', 'wex_efs').eq('status', 'open'),
  ])
  const lastTransactionSuccess = transactionState.data?.last_succeeded_at
  const conditions = new Map<string, { severity: 'warning' | 'critical', title: string, message: string, details: Record<string, unknown> }>()
  if (!lastTransactionSuccess || Date.now() - Date.parse(lastTransactionSuccess) > 15 * 60_000) {
    conditions.set('transactions_stale', {
      severity: 'critical',
      title: 'WEX transactions are stale',
      message: lastTransactionSuccess ? `The last successful transaction sync was ${lastTransactionSuccess}.` : 'No successful WEX transaction sync has been recorded.',
      details: { lastTransactionSuccess: lastTransactionSuccess ?? null },
    })
  }
  if ((deadJobs.count ?? 0) > 0) {
    conditions.set('dead_jobs', {
      severity: 'critical', title: 'WEX jobs exhausted their retries',
      message: `${deadJobs.count} WEX job${deadJobs.count === 1 ? '' : 's'} require review.`, details: { count: deadJobs.count },
    })
  }
  if ((staleJobs.count ?? 0) > 0) {
    conditions.set('stale_leases', {
      severity: 'warning', title: 'WEX jobs have stale leases',
      message: `${staleJobs.count} WEX job${staleJobs.count === 1 ? '' : 's'} may have been interrupted.`, details: { count: staleJobs.count },
    })
  }
  const existing = new Map((openAlerts.data ?? []).map((alert: any) => [alert.code, alert.id]))
  for (const [code, alert] of conditions) {
    const id = existing.get(code)
    if (id) {
      await db.from('wex_sync_alerts').update({ ...alert, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      await db.from('wex_sync_alerts').insert({ provider: 'wex_efs', code, status: 'open', ...alert })
    }
  }
  const resolvedCodes = [...existing.keys()].filter((code) => ['transactions_stale', 'dead_jobs', 'stale_leases'].includes(code) && !conditions.has(code))
  if (resolvedCodes.length) {
    await db.from('wex_sync_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('code', resolvedCodes).eq('provider', 'wex_efs').eq('status', 'open')
  }
  return {
    customers: customers ?? 0,
    cards: cards ?? 0,
    transactions: transactions ?? 0,
    unmatchedCards: unmatchedCards ?? 0,
    alerts: conditions.size,
  }
}
