import 'server-only'

import { createHmac } from 'node:crypto'
import { createAdminClient } from '../../supabase/admin'
import { calculateAccountCreditKpis } from './account-kpis'
import { accumulateCustomerSpend, roundCurrency, type CustomerSpendTotals } from './customer-kpis'
import { getAccountTransactionsV3, getCardSummariesV2, getCarrierInfo, getChildTransactionsNewV3, getContracts, getCreditLimits, loginToWex } from './client'
import type { WexSyncResult } from './types'

const batches = <T,>(items: T[], size = 250) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
const normalizedCardNumber = (value: string) => value.replace(/\D/g, '') || value.trim()
const WEX_TRANSACTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const KPI_PAGE_SIZE = 1_000

async function refreshCustomerSpendKpis(
  db: ReturnType<typeof createAdminClient>,
  customerIds: string[],
  synchronizedAt: string,
) {
  if (!customerIds.length) return

  const monthStart = new Date(synchronizedAt)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const totals: CustomerSpendTotals = new Map(customerIds.map((customerId) => [customerId, { monthlySpend: 0, lifetimeSpend: 0 }]))

  for (let offset = 0; ; offset += KPI_PAGE_SIZE) {
    const { data, error } = await db
      .from('fuel_transactions')
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
    const { error } = await db
      .from('customers')
      .update({
        monthly_spend: roundCurrency(spend.monthlySpend),
        lifetime_spend: roundCurrency(spend.lifetimeSpend),
        last_synced_at: synchronizedAt,
      })
      .eq('id', customerId)
    if (error) throw new Error('Customer spend KPIs could not be updated.')
  }
}

export function transactionWindows(begin: Date, end: Date) {
  const windows: Array<{ begin: Date, end: Date }> = []
  let cursor = begin.getTime()
  while (cursor <= end.getTime()) {
    const windowEnd = Math.min(cursor + WEX_TRANSACTION_WINDOW_MS - 1, end.getTime())
    windows.push({ begin: new Date(cursor), end: new Date(windowEnd) })
    cursor = windowEnd + 1
  }
  return windows
}

export async function syncWexFuelCards(runId: string): Promise<WexSyncResult> {
  const db = createAdminClient()
  const progress = async (stage: string, details: Record<string, unknown> = {}) => {
    console.info('[WEX sync] Progress.', { stage, runId, ...details })
    const { error } = await db.from('fuel_card_sync_runs').update({ metadata: { stage, ...details, updatedAt: new Date().toISOString() } }).eq('id', runId)
    if (error) console.error('[WEX sync] Progress audit update failed.', { stage: 'progress_audit', runId, code: error.code })
  }
  const secret = process.env.WEX_CARD_FINGERPRINT_SECRET
  if (!secret) throw new Error('WEX card fingerprint configuration is missing.')
  console.info('[WEX sync] Authenticating through configured proxy.', { stage: 'wex_login', runId })
  const clientId = await loginToWex()
  await progress('authenticated')
  console.info('[WEX sync] Authentication succeeded.', { stage: 'wex_login_complete', runId })
  const end = new Date()
  const begin = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const windows = transactionWindows(begin, end)
  console.info('[WEX sync] Fetching cards and transactions.', { stage: 'wex_provider_fetch', runId, transactionWindowDays: 30, transactionRequests: windows.length })
  const [cards, carrier, contracts] = await Promise.all([getCardSummariesV2(clientId), getCarrierInfo(clientId), getContracts(clientId)])
  const creditLimits = await Promise.all(contracts.map((contract) => getCreditLimits(clientId, contract.contractId)))
  await progress('account_data_fetched', { cardsReceived: cards.length, carrierRecords: 1, contractsReceived: contracts.length })
  const transactionMap = new Map<string, Awaited<ReturnType<typeof getChildTransactionsNewV3>>[number]>()
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index]
    console.info('[WEX sync] Fetching transaction window.', { stage: 'wex_transaction_window', runId, request: index + 1, totalRequests: windows.length })
    const [accountTransactions, childTransactions] = await Promise.all([
      getAccountTransactionsV3(clientId, window.begin, window.end),
      getChildTransactionsNewV3(clientId, window.begin, window.end),
    ])
    ;[...accountTransactions, ...childTransactions].forEach((transaction) => transactionMap.set(transaction.transactionId, transaction))
    await progress('transactions_window_fetched', { request: index + 1, totalRequests: windows.length, transactionsReceived: transactionMap.size })
  }
  const transactions = [...transactionMap.values()]
  console.info('[WEX sync] Provider data received.', { stage: 'wex_provider_fetch_complete', runId, cardsReceived: cards.length, transactionsReceived: transactions.length })
  const fingerprints = cards.map((card) => createHmac('sha256', secret).update(normalizedCardNumber(card.cardNumber)).digest('hex'))
  const transactionFingerprints = transactions.map((transaction) => createHmac('sha256', secret).update(normalizedCardNumber(transaction.cardNumber)).digest('hex'))
  // A WEX carrier is the provider's customer/account identity. Create only one
  // CRM customer per carrier ID; companyXRef is a secondary explicit key.
  const { data: currentCustomers, error: customerReadError } = await db
    .from('customers')
    .select('id,wex_carrier_id,wex_company_xref,wex_external_driver_id')
  if (customerReadError) throw new Error('Existing customers could not be loaded for WEX matching.')
  let customerByCarrier = new Map((currentCustomers ?? []).filter((c: any) => c.wex_carrier_id).map((c: any) => [c.wex_carrier_id, c.id]))
  let customerByXref = new Map((currentCustomers ?? []).filter((c: any) => c.wex_company_xref).map((c: any) => [c.wex_company_xref, c.id]))
  const customerByDriver = new Map((currentCustomers ?? []).filter((c: any) => c.wex_external_driver_id).map((c: any) => [c.wex_external_driver_id, c.id]))
  const carrierRecords = new Map<string, { carrierId: string, companyXRef: string | null }>()
  carrierRecords.set(carrier.carrierId, { carrierId: carrier.carrierId, companyXRef: carrier.name })
  transactions.forEach((transaction) => {
    if (!carrierRecords.has(transaction.carrierId)) carrierRecords.set(transaction.carrierId, { carrierId: transaction.carrierId, companyXRef: transaction.companyXRef })
  })
  const newCustomers = [...carrierRecords.values()].filter((carrier) => !customerByCarrier.has(carrier.carrierId) && !(carrier.companyXRef && customerByXref.has(carrier.companyXRef))).map((carrier) => ({
    type: 'company', status: 'active', provider: 'wex_efs', wex_carrier_id: carrier.carrierId,
    wex_company_xref: carrier.companyXRef,
    company_name: carrier.companyXRef || `WEX Carrier ${carrier.carrierId}`,
    last_synced_at: new Date().toISOString(),
  }))
  for (const batch of batches(newCustomers)) {
    const { error } = await db.from('customers').insert(batch)
    if (error && error.code !== '23505') throw new Error('WEX customers could not be saved.')
  }
  const { data: refreshedCustomers, error: refreshError } = await db.from('customers').select('id,wex_carrier_id,wex_company_xref')
  if (refreshError) throw new Error('Synchronized customers could not be reloaded.')
  customerByCarrier = new Map((refreshedCustomers ?? []).filter((c: any) => c.wex_carrier_id).map((c: any) => [c.wex_carrier_id, c.id]))
  customerByXref = new Map((refreshedCustomers ?? []).filter((c: any) => c.wex_company_xref).map((c: any) => [c.wex_company_xref, c.id]))
  await progress('customers_saved', { customersReceived: carrierRecords.size, customersCreated: newCustomers.length })

  const carrierByCardFingerprint = new Map<string, string | null>()
  transactions.forEach((transaction, index) => {
    const fingerprint = transactionFingerprints[index]
    if (!carrierByCardFingerprint.has(fingerprint)) carrierByCardFingerprint.set(fingerprint, transaction.carrierId)
    else if (carrierByCardFingerprint.get(fingerprint) !== transaction.carrierId) carrierByCardFingerprint.set(fingerprint, null)
  })

  const [{ data: existing }, { data: mappings }] = await Promise.all([
    db.from('fuel_cards').select('id,card_fingerprint').eq('provider', 'wex_efs').in('card_fingerprint', fingerprints),
    db.from('fuel_card_customer_mappings').select('fuel_card_id,customer_id,is_confirmed'),
  ])
  const existingMap = new Map((existing ?? []).map((x: any) => [x.card_fingerprint, x.id]))
  const confirmedMap = new Map((mappings ?? []).filter((x: any) => x.is_confirmed).map((x: any) => [x.fuel_card_id, x.customer_id]))
  const now = new Date().toISOString()
  const soleCarrierCustomerId = carrierRecords.size === 1 ? customerByCarrier.get(carrier.carrierId) : null
  const rows = cards.map((card, index) => {
    const fingerprint = fingerprints[index]
    const existingId = existingMap.get(fingerprint)
    const transactionCarrier = carrierByCardFingerprint.get(fingerprint)
    const customerId = (existingId && confirmedMap.get(existingId))
      || (transactionCarrier && customerByCarrier.get(transactionCarrier))
      || (card.companyXRef && customerByXref.get(card.companyXRef))
      || (card.driverId && customerByDriver.get(card.driverId))
      || soleCarrierCustomerId
      || null
    return {
      provider: 'wex_efs', card_fingerprint: fingerprint, card_last4: normalizedCardNumber(card.cardNumber).slice(-4), customer_id: customerId,
      policy_number: card.policyNumber, company_xref: card.companyXRef, unit_number: card.unitNumber,
      external_driver_id: card.driverId, driver_name: card.driverName, override_code: card.override,
      is_overridden: card.beingOverridden, status: card.status, payroll_status: card.payrollStatus,
      payroll_use: card.payrollUse, gps_id: card.gpsid, vin: card.vin, zone_id: card.zid,
      info_source: card.infosrc, policy_subfleet: card.policySubfleet, card_subfleet: card.cardSubfleet,
      last_synced_at: now,
    }
  })
  for (const batch of batches(rows)) {
    const { error } = await db.from('fuel_cards').upsert(batch, { onConflict: 'provider,card_fingerprint' })
    if (error) throw new Error('Fuel card synchronization could not be saved.')
  }
  await progress('cards_saved', { cardsSaved: rows.length, cardsUnmatched: rows.filter((row) => !row.customer_id).length })
  const { data: savedCards, error: savedCardsError } = await db.from('fuel_cards').select('id,card_fingerprint,customer_id').eq('provider', 'wex_efs').in('card_fingerprint', [...new Set([...fingerprints, ...transactionFingerprints])])
  if (savedCardsError) throw new Error('Synchronized cards could not be loaded for transaction matching.')
  const cardByFingerprint = new Map((savedCards ?? []).map((card: any) => [card.card_fingerprint, card]))
  const transactionRows = transactions.flatMap((transaction, index) => {
    const card: any = cardByFingerprint.get(transactionFingerprints[index])
    const customerId = card?.customer_id || customerByCarrier.get(transaction.carrierId) || (transaction.companyXRef && customerByXref.get(transaction.companyXRef))
    if (!customerId) return []
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
      transaction_date: transaction.transactionDate, last_synced_at: now,
    }]
  })
  for (const batch of batches(transactionRows)) {
    const { error } = await db.from('fuel_transactions').upsert(batch, { onConflict: 'provider,provider_transaction_id' })
    if (error) throw new Error('WEX transactions could not be saved.')
  }
  await progress('transactions_saved', { transactionsSaved: transactionRows.length })
  const synchronizedCustomerIds = [...new Set([
    ...[...carrierRecords.keys()].map((carrierId) => customerByCarrier.get(carrierId)),
    ...transactionRows.map((transaction) => transaction.customer_id),
  ].filter((customerId): customerId is string => Boolean(customerId)))]
  await refreshCustomerSpendKpis(db, synchronizedCustomerIds, now)
  await progress('customer_kpis_refreshed', { customersUpdated: synchronizedCustomerIds.length })
  const primaryCustomerId = customerByCarrier.get(carrier.carrierId)
  if (primaryCustomerId && creditLimits.length) {
    const creditKpis = calculateAccountCreditKpis(creditLimits)
    const { error } = await db.from('customers').update({
      credit_limit: creditKpis.creditLimit,
      current_balance: creditKpis.currentBalance,
      last_synced_at: now,
    }).eq('id', primaryCustomerId)
    if (error) throw new Error('Customer account credit KPIs could not be updated.')
  }
  await progress('customer_credit_refreshed', { customersUpdated: primaryCustomerId && creditLimits.length ? 1 : 0, contractsProcessed: creditLimits.length })
  console.info('[WEX sync] Supabase writes completed.', {
    stage: 'database_write_complete', runId, customers: carrierRecords.size,
    cards: rows.length, transactions: transactionRows.length,
  })
  const result = { received: rows.length, created: rows.filter((r) => !existingMap.has(r.card_fingerprint)).length, updated: rows.filter((r) => existingMap.has(r.card_fingerprint)).length, unmatched: rows.filter((r) => !r.customer_id).length, customers: carrierRecords.size, transactions: transactionRows.length }
  const [{ count: storedCustomers }, { count: storedCards }, { count: storedTransactions }] = await Promise.all([
    db.from('customers').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
    db.from('fuel_cards').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
    db.from('fuel_transactions').select('id', { head: true, count: 'exact' }).eq('provider', 'wex_efs'),
  ])
  await db.from('fuel_card_sync_runs').update({ status: 'succeeded', completed_at: now, cards_received: result.received, cards_created: result.created, cards_updated: result.updated, cards_unmatched: result.unmatched, customers_received: result.customers, transactions_received: result.transactions, metadata: { stage: 'completed', storedCustomers, storedCards, storedTransactions } }).eq('id', runId)
  console.info('[WEX sync] Supabase verification completed.', { stage: 'database_verified', runId, storedCustomers, storedCards, storedTransactions })
  return result
}
