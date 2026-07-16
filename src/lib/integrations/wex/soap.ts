import 'server-only'

import { XMLParser } from 'fast-xml-parser'
import { WexError } from './errors'
import { normalizedWexCardSchema, normalizedWexTransactionSchema } from './schemas'
import type { WexCard, WexCarrier, WexTransaction } from './types'

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
    // Fault text is useful for diagnosing namespaces and business errors, but WEX
    // may echo identifiers. Redact long tokens before the error reaches logs.
    const safeMessage = rawMessage
      .replace(/https?:\/\/[^\s<]+/gi, '[redacted-url]')
      .replace(/\b[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
      .slice(0, 500)
    throw new WexError(safeMessage, 'soap_fault')
  }
  return body
}

export function assertNoSoapFault(xml: string) {
  bodyOf(xml)
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
    const lineItems = row.lineItems == null ? [] : Array.isArray(row.lineItems) ? row.lineItems : [row.lineItems]
    const gallons = lineItems.reduce((total: number, item: any) => total + Math.max(0, numberOf(item.quantity)), 0)
    return normalizedWexTransactionSchema.parse({
      transactionId: valueOf(row.transactionId), carrierId: valueOf(row.carrierId),
      companyXRef: valueOf(row.companyXRef), cardNumber: valueOf(row.cardNumber),
      transactionDate: valueOf(row.transactionDate ?? row.posDate),
      amount: numberOf(row.netTotal ?? row.settleAmount), discountAmount: numberOf(row.discAmount),
      merchantName: valueOf(row.locationName), merchantAddress: valueOf(row.locationAddress),
      merchantState: valueOf(row.locationState), gallons: gallons > 0 ? gallons : null,
      transactionType: valueOf(row.transactionType) ?? '0',
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
