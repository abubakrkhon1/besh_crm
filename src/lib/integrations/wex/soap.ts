import 'server-only'

import { XMLParser } from 'fast-xml-parser'
import { WexError } from './errors'
import { normalizedWexCardSchema, normalizedWexContractSchema, normalizedWexCreditLimitsSchema, normalizedWexTransactionSchema } from './schemas'
import type { WexAllowedOrderType, WexCard, WexCardOrder, WexCardRefreshingLimits, WexCardV2, WexCarrier, WexContract, WexCreditLimits, WexReplacementCardOrder, WexRequestStatus, WexTransaction } from './types'

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true })
export const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!))
export const envelope = (body: string) => `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://com.tch.cards.service"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`

function bodyOf(xml: string) {
  let parsed: any
  try { parsed = parser.parse(xml) } catch { throw new WexError('WEX returned malformed XML.', 'validation') }
  const body = parsed?.Envelope?.Body
  const fault = body?.Fault
  if (fault) {
    const rawMessage = String(fault.faultstring ?? fault.Reason?.Text ?? 'WEX SOAP fault.')
    const retryable = /^ERROR running command\b/i.test(rawMessage)
      || /temporar|timed?\s*out|unavailable|internal\s+server/i.test(rawMessage)
    // Fault text is useful for diagnosing namespaces and business errors, but WEX
    // may echo identifiers. Redact long tokens before the error reaches logs.
    const safeMessage = (retryable ? 'WEX reported a temporary processing error.' : rawMessage)
      .replace(/https?:\/\/[^\s<]+/gi, '[redacted-url]')
      .replace(/\b[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
      .slice(0, 500)
    throw new WexError(safeMessage, 'soap_fault', retryable)
  }
  return body
}

export function assertNoSoapFault(xml: string) {
  bodyOf(xml)
}

export function parseStringMutationResponse(xml: string, operation: 'setCardPin') {
  const result = valueOf(bodyOf(xml)?.[`${operation}Response`]?.result)
  if (!result) throw new WexError('WEX returned no confirmation.', 'validation')
  if (/error|invalid|fail|denied/i.test(result)) throw new WexError(safeProviderMessage(result), 'provider_rejected')
  return result
}

function valueOf(value: unknown): string | null {
  if (value == null || typeof value === 'object') return null
  const text = String(value).trim()
  return text || null
}

const numberOf = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const nullableNumberOf = (value: unknown) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const valuesOf = (value: unknown): any[] => value == null ? [] : Array.isArray(value) ? value : [value]
const booleanOf = (value: unknown) => String(value).toLowerCase() === 'true' || String(value).toUpperCase() === 'Y'
const safeProviderMessage = (value: string) => value
  .replace(/https?:\/\/[^\s<]+/gi, '[redacted-url]')
  .replace(/\b\d{6,}\b/g, '[redacted]')
  .replace(/\b[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
  .slice(0, 500)

function requestStatusOf(value: any): WexRequestStatus {
  const status = {
    errorCode: numberOf(value?.errorCode, -1),
    description: valueOf(value?.description) ? safeProviderMessage(String(value.description)) : null,
  }
  if (status.errorCode !== 0) {
    throw new WexError(status.description || `WEX rejected the request with code ${status.errorCode}.`, 'provider_rejected')
  }
  return status
}

function parseTransactionTax(row: any) {
  return {
    description: valueOf(row.taxDescription), amount: numberOf(row.amount),
    taxClass: valueOf(row.taxClass), taxCode: valueOf(row.taxCode),
    exempt: String(row.exemptFlag).toLowerCase() === 'true' || String(row.exemptFlag).toUpperCase() === 'Y',
  }
}

export function parseLogin(xml: string) {
  const result = valueOf(bodyOf(xml)?.loginResponse?.result)
  if (!result) throw new WexError('WEX authentication failed.', 'authentication')
  if (/not\s+allowed|denied|invalid|failed|unauthorized/i.test(result)) {
    throw new WexError('WEX rejected the login source or credentials.', 'authentication')
  }
  if (!/^[A-Za-z0-9_-]{16,}$/.test(result)) {
    throw new WexError('WEX returned an invalid login session.', 'authentication')
  }
  return result
}

export function parseCardSummaries(xml: string): WexCard[] {
  const result = bodyOf(xml)?.getCardSummariesV2Response?.result
  const values = result?.value == null ? [] : Array.isArray(result.value) ? result.value : [result.value]
  return values.map((row: any) => normalizedWexCardSchema.parse({
    cardNumber: valueOf(row.cardNumber), policyNumber: valueOf(row.policyNumber), companyXRef: valueOf(row.companyXRef),
    unitNumber: valueOf(row.unitNumber), driverId: valueOf(row.driverId), driverName: valueOf(row.driverName),
    override: valueOf(row.override), beingOverridden: String(row.beingOverridden).toLowerCase() === 'true',
    status: valueOf(row.status) ?? 'UNKNOWN', payrollStatus: valueOf(row.payrollStatus), payrollUse: valueOf(row.payrollUse),
    gpsid: valueOf(row.gpsid), vin: valueOf(row.vin), zid: valueOf(row.zid), infosrc: valueOf(row.infosrc),
    policySubfleet: valueOf(row.policySubfleet), cardSubfleet: valueOf(row.cardSubfleet),
  }))
}

function parseTransactionsResult(result: any): WexTransaction[] {
  const values = result?.value == null ? [] : Array.isArray(result.value) ? result.value : [result.value]
  return values.map((row: any) => {
    const lineItems = valuesOf(row.lineItems).map((item) => ({
      amount: numberOf(item.amount), category: valueOf(item.category),
      discountAmount: numberOf(item.discAmount), fuelType: valueOf(item.fuelType),
      pricePerUnit: nullableNumberOf(item.ppu), productCode: valueOf(item.prodCD),
      quantity: numberOf(item.quantity), retailPricePerUnit: nullableNumberOf(item.retailPPU),
      retailAmount: nullableNumberOf(item.retailAmount), serviceType: valueOf(item.serviceType),
      taxes: valuesOf(item.lineTaxes).map(parseTransactionTax),
    }))
    const gallons = lineItems.reduce((total: number, item) => total + Math.max(0, item.quantity), 0)
    const feesTotal = ['carrierFee', 'nonAreaFee', 'issuerFee', 'suprFee']
      .reduce((total, field) => total + numberOf(row[field]), 0)
    return normalizedWexTransactionSchema.parse({
      transactionId: valueOf(row.transactionId), carrierId: valueOf(row.carrierId),
      companyXRef: valueOf(row.companyXRef), cardNumber: valueOf(row.cardNumber),
      transactionDate: valueOf(row.transactionDate ?? row.posDate),
      amount: numberOf(row.netTotal ?? row.settleAmount), discountAmount: numberOf(row.discAmount),
      merchantName: valueOf(row.locationName), merchantAddress: valueOf(row.locationAddress),
      merchantState: valueOf(row.locationState), gallons: gallons > 0 ? gallons : null,
      transactionType: valueOf(row.transactionType) ?? '0',
      authorizationCode: valueOf(row.authCode), invoiceNumber: valueOf(row.invoice),
      contractId: nullableNumberOf(row.contractId), billingCurrency: valueOf(row.billingCurrency),
      fundedTotal: nullableNumberOf(row.fundedTotal), settledAmount: nullableNumberOf(row.settleAmount),
      preferredTotal: nullableNumberOf(row.prefTotal), feesTotal,
      preDiscountTax: nullableNumberOf(row.preDiscTax), postDiscountTax: nullableNumberOf(row.postDiscTax),
      taxExemptAmount: nullableNumberOf(row.taxExemptAmount), locationId: valueOf(row.locationId),
      merchantCity: valueOf(row.locationCity), merchantZip: valueOf(row.locationZip),
      merchantCountry: valueOf(row.locationCountry), merchantLatitude: valueOf(row.locationLatitude),
      merchantLongitude: valueOf(row.locationLongitude), entryMode: valueOf(row.entryMode),
      handEntered: String(row.handEntered).toLowerCase() === 'true',
      originalTransactionId: valueOf(row.originalTransId), statementId: valueOf(row.statementId),
      promptValues: valuesOf(row.infos).map((info) => ({ type: valueOf(info.type) ?? '', value: valueOf(info.value) ?? '' })),
      lineItems, taxes: valuesOf(row.transTaxes).map(parseTransactionTax),
    })
  })
}

export function parseChildTransactionsV3(xml: string): WexTransaction[] {
  return parseTransactionsResult(bodyOf(xml)?.getChildTransactionsNewV3Response?.result)
}

export function parseAccountTransactionsV3(xml: string): WexTransaction[] {
  return parseTransactionsResult(bodyOf(xml)?.getMCTransExtLocV3Response?.result)
}

export function parseCarrierInfo(xml: string): WexCarrier {
  const result = bodyOf(xml)?.getCarrierInfoResponse?.result
  const carrierId = valueOf(result?.carrierId)
  const name = valueOf(result?.name)
  if (!carrierId || !name) throw new WexError('WEX returned invalid carrier information.', 'validation')
  return { carrierId, name }
}

export function parseContracts(xml: string): WexContract[] {
  const result = bodyOf(xml)?.getContractsResponse?.result
  const values = result?.value == null ? [] : Array.isArray(result.value) ? result.value : [result.value]
  return values.map((row: any) => normalizedWexContractSchema.parse({
    contractId: numberOf(row.contractId), status: valueOf(row.status) ?? 'UNKNOWN',
    description: valueOf(row.description), currency: valueOf(row.currency),
    limitMethod: numberOf(row.limitMethod), masterContract: String(row.masterContract).toLowerCase() === 'true',
  }))
}

export function parseCreditLimits(xml: string): WexCreditLimits {
  const result = bodyOf(xml)?.getCreditLimitsResponse?.result
  if (!result) throw new WexError('WEX returned no credit-limit information.', 'validation')
  return normalizedWexCreditLimitsSchema.parse({
    contractStatus: valueOf(result.contractStatus) ?? 'UNKNOWN',
    transactionLimit: numberOf(result.transLimit), originalLimit: numberOf(result.origLimit),
    creditAvailable: numberOf(result.creditAvailable), dailyLimit: numberOf(result.dailyLimit),
    dailyAvailable: numberOf(result.dailyAvailable), totalAvailable: numberOf(result.totalAvailable),
    maxMoneyCode: numberOf(result.maxMoneyCode), unitOfMeasure: valueOf(result.uom),
  })
}

export function parseCardV2(xml: string): WexCardV2 {
  const result = bodyOf(xml)?.getCardv2Response?.result
  const cardNumber = valueOf(result?.cardNumber)
  const header = result?.header
  if (!cardNumber || !header) throw new WexError('WEX returned incomplete card details.', 'validation')
  return {
    cardNumber,
    header: {
      companyXRef: valueOf(header.companyXRef), handEnter: valueOf(header.handEnter),
      infoSource: valueOf(header.infoSource), limitSource: valueOf(header.limitSource),
      locationOverride: numberOf(header.locationOverride), locationSource: valueOf(header.locationSource),
      overrideAllLocations: booleanOf(header.overrideAllLocations), originalStatus: valueOf(header.originalStatus),
      payrollStatus: valueOf(header.payrollStatus), override: numberOf(header.override),
      policyNumber: numberOf(header.policyNumber), status: valueOf(header.status), timeSource: valueOf(header.timeSource),
      lastUsedDate: valueOf(header.lastUsedDate), lastTransaction: nullableNumberOf(header.lastTransaction),
      payrollUse: valueOf(header.payrollUse), payrollAtm: valueOf(header.payrollAtm),
      payrollChk: valueOf(header.payrollChk), payrollAch: valueOf(header.payrollAch),
      payrollWire: valueOf(header.payrollWire), payrollDebit: valueOf(header.payrollDebit),
    },
    infos: valuesOf(result.infos).map((info) => ({
      infoId: valueOf(info.infoId), lengthCheck: booleanOf(info.lengthCheck), matchValue: valueOf(info.matchValue),
      maximum: numberOf(info.maximum), minimum: numberOf(info.minimum), reportValue: valueOf(info.reportValue),
      numericMatchValue: valueOf(info.numericMatchValue), validationType: valueOf(info.validationType), value: numberOf(info.value),
    })),
    limits: valuesOf(result.limits).map((limit) => ({
      hours: numberOf(limit.hours), limit: numberOf(limit.limit), limitId: valueOf(limit.limitId),
      minHours: numberOf(limit.minHours), autoRollMap: numberOf(limit.autoRollMap), autoRollMax: numberOf(limit.autoRollMax),
    })),
    locationGroups: valuesOf(result.locationGroups).map((value) => numberOf(value)),
    locations: valuesOf(result.locations).map((value) => numberOf(value)),
    timeRestrictions: valuesOf(result.timeRestrictions).map((restriction) => ({
      beginTime: valueOf(restriction.beginTime), day: numberOf(restriction.day), endTime: valueOf(restriction.endTime),
    })),
  }
}

export function parseCardRefreshingLimits(xml: string): WexCardRefreshingLimits {
  const result = bodyOf(xml)?.getCardRefreshingLimitsResponse?.cardRefreshingLimitsData
  if (!result) throw new WexError('WEX returned no card-limit information.', 'validation')
  return {
    refreshingLimitSource: valueOf(result.refreshingLimitSource) ?? '',
    dayCountLimit: nullableNumberOf(result.dayCntLimit), dayAmountLimit: nullableNumberOf(result.dayAmtLimit),
    weekCountLimit: nullableNumberOf(result.weekCntLimit), weekAmountLimit: nullableNumberOf(result.weekAmtLimit),
    monthCountLimit: nullableNumberOf(result.monCntLimit), monthAmountLimit: nullableNumberOf(result.monAmtLimit),
  }
}

export function parseAllowedOrderTypes(xml: string): WexAllowedOrderType[] {
  const response = bodyOf(xml)?.getAllowedOrderTypesResponse?.response
  return valuesOf(response?.value).map((value) => ({
    orderType: numberOf(value.orderType), orderDescription: valueOf(value.orderDesc) ?? 'Card order',
    defaultCardStyle: numberOf(value.defCardStyle), defaultCardStyleDescription: valueOf(value.defCardStyleDesc) ?? 'Default',
    defaultPolicy: numberOf(value.defPolicy),
  }))
}

export function parseMutationResponse(xml: string, operation: 'setCardRefreshingLimits' | 'createAndSubmitOrder' | 'reissueDamagedCard' | 'replaceLostOrStolenCard') {
  const response = bodyOf(xml)?.[`${operation}Response`]
  if (!response) throw new WexError('WEX returned an incomplete operation response.', 'validation')
  const status = requestStatusOf(response.requestStatus)
  return {
    ...status,
    orderId: operation === 'setCardRefreshingLimits' ? null : valueOf(response.orderId),
  }
}

const xmlElement = (name: string, value: unknown) => value == null
  ? `<${name} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>`
  : `<${name}>${escapeXml(String(value))}</${name}>`

export function serializeCardV2(card: WexCardV2) {
  const header = Object.entries({
    companyXRef: card.header.companyXRef, handEnter: card.header.handEnter, infoSource: card.header.infoSource,
    limitSource: card.header.limitSource, locationOverride: card.header.locationOverride,
    locationSource: card.header.locationSource, overrideAllLocations: card.header.overrideAllLocations,
    originalStatus: card.header.originalStatus, payrollStatus: card.header.payrollStatus, override: card.header.override,
    policyNumber: card.header.policyNumber, status: card.header.status, timeSource: card.header.timeSource,
    lastUsedDate: card.header.lastUsedDate, lastTransaction: card.header.lastTransaction, payrollUse: card.header.payrollUse,
    payrollAtm: card.header.payrollAtm, payrollChk: card.header.payrollChk, payrollAch: card.header.payrollAch,
    payrollWire: card.header.payrollWire, payrollDebit: card.header.payrollDebit,
  }).map(([name, value]) => xmlElement(name, value)).join('')
  const infos = card.infos.map((info) => `<infos>${Object.entries(info).map(([name, value]) => xmlElement(name, value)).join('')}</infos>`).join('')
  const limits = card.limits.map((limit) => `<limits>${Object.entries(limit).map(([name, value]) => xmlElement(name, value)).join('')}</limits>`).join('')
  const locationGroups = card.locationGroups.map((value) => xmlElement('locationGroups', value)).join('')
  const locations = card.locations.map((value) => xmlElement('locations', value)).join('')
  const restrictions = card.timeRestrictions.map((restriction) => `<timeRestrictions>${Object.entries(restriction).map(([name, value]) => xmlElement(name, value)).join('')}</timeRestrictions>`).join('')
  return `${xmlElement('cardNumber', card.cardNumber)}<header>${header}</header>${infos}${limits}${locationGroups}${locations}${restrictions}`
}

export function serializeRefreshingLimits(limits: WexCardRefreshingLimits) {
  return [
    xmlElement('refreshingLimitSource', limits.refreshingLimitSource), xmlElement('dayCntLimit', limits.dayCountLimit),
    xmlElement('dayAmtLimit', limits.dayAmountLimit), xmlElement('weekCntLimit', limits.weekCountLimit),
    xmlElement('weekAmtLimit', limits.weekAmountLimit), xmlElement('monCntLimit', limits.monthCountLimit),
    xmlElement('monAmtLimit', limits.monthAmountLimit),
  ].join('')
}

export function serializeCardOrder(order: WexCardOrder) {
  return [
    xmlElement('policyNumber', order.policyNumber), xmlElement('orderType', order.orderType),
    xmlElement('cardStyle', order.cardStyle), xmlElement('orderQty', 1), xmlElement('embossedName', order.embossedName),
    xmlElement('shipToFirst', order.shipToFirst), xmlElement('shipToLast', order.shipToLast),
    xmlElement('shipToAddress1', order.shipToAddress1), xmlElement('shipToAddress2', order.shipToAddress2),
    xmlElement('shipToCity', order.shipToCity), xmlElement('shipToState', order.shipToState),
    xmlElement('shipToZip', order.shipToZip), xmlElement('shipToCountry', order.shipToCountry),
    xmlElement('shippingMethod', order.shippingMethod), xmlElement('rushProcessing', order.rushProcessing),
    xmlElement('cardCarrier', order.cardCarrier),
  ].join('')
}

export function serializeReplacementCardOrder(order: WexReplacementCardOrder) {
  return [
    xmlElement('cardNumber', order.cardNumber), xmlElement('shipToFirst', order.shipToFirst),
    xmlElement('shipToLast', order.shipToLast), xmlElement('shipToAddress1', order.shipToAddress1),
    xmlElement('shipToAddress2', order.shipToAddress2), xmlElement('shipToCity', order.shipToCity),
    xmlElement('shipToState', order.shipToState), xmlElement('shipToZip', order.shipToZip),
    xmlElement('shipToCountry', order.shipToCountry), xmlElement('shippingMethod', order.shippingMethod),
    xmlElement('rushProcessing', order.rushProcessing), xmlElement('reason', order.reason),
  ].join('')
}
