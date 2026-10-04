import 'server-only'

import { ProxyAgent } from 'undici'
import { WexError } from './errors'
import { wexEnvSchema } from './schemas'
import { assertNoSoapFault, envelope, escapeXml, parseAccountTransactionsV3, parseAllowedOrderTypes, parseCardRefreshingLimits, parseCardSummaries, parseCardV2, parseCarrierInfo, parseChildTransactionsV3, parseContracts, parseCreditLimits, parseLogin, parseMutationResponse, serializeCardOrder, serializeCardV2, serializeRefreshingLimits, serializeReplacementCardOrder } from './soap'
import type { WexCardOrder, WexCardRefreshingLimits, WexCardV2, WexReplacementCardOrder } from './types'

const MAX_WEX_XML_RESPONSE_BYTES = 15 * 1024 * 1024

function config() {
  const parsed = wexEnvSchema.safeParse(process.env)
  if (!parsed.success) throw new WexError('WEX server configuration is incomplete.', 'configuration')
  return parsed.data
}

async function post(body: string, options: { retry?: boolean } = {}) {
  const env = config()
  const attempts = options.retry === false ? 1 : 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(env.WEX_SOAP_ENDPOINT_URL, {
        method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: '""' }, body,
        signal: AbortSignal.timeout(15_000),
        dispatcher: new ProxyAgent(env.WEX_HTTP_PROXY),
      } as RequestInit)
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > MAX_WEX_XML_RESPONSE_BYTES) {
        throw new WexError('WEX response exceeded the safe processing limit.', 'response_too_large')
      }
      // Axis2 commonly returns SOAP faults with HTTP 500. Parse the XML before
      // reducing the failure to an HTTP status so namespace/business faults remain actionable.
      if (text.trim().startsWith('<')) assertNoSoapFault(text)
      if (!response.ok) {
        if ([502, 503, 504].includes(response.status) && attempt < attempts - 1) continue
        throw new WexError(`WEX request failed with HTTP ${response.status}.`, 'http', [502, 503, 504].includes(response.status))
      }
      return text
    } catch (error) {
      if (error instanceof WexError) throw error
      if (attempt < attempts - 1) continue
      throw new WexError('WEX is temporarily unreachable.', 'network', true)
    }
  }
  throw new WexError('WEX is temporarily unreachable.', 'network', true)
}

export async function loginToWex() {
  const env = config()
  // Preserve the exact request shape proven against this legacy Axis2 service.
  // Unlike getCardSummariesV2, WEX login expects the operation unprefixed.
  return parseLogin(await post(envelope(`<login><user>${escapeXml(env.WEX_API_USERNAME)}</user><password>${escapeXml(env.WEX_API_PASSWORD)}</password></login>`)))
}

export async function getCardSummariesV2(clientId: string) {
  return parseCardSummaries(await post(envelope(`<ns:getCardSummariesV2><clientId>${escapeXml(clientId)}</clientId><request/></ns:getCardSummariesV2>`)))
}

export async function getChildTransactionsNewV3(clientId: string, begin: Date, end: Date) {
  const body = `<ns:getChildTransactionsNewV3><parentClientId>${escapeXml(clientId)}</parentClientId><begDate>${begin.toISOString()}</begDate><endDate>${end.toISOString()}</endDate></ns:getChildTransactionsNewV3>`
  return parseChildTransactionsV3(await post(envelope(body)))
}

export async function getAccountTransactionsV3(clientId: string, begin: Date, end: Date) {
  const body = `<ns:getMCTransExtLocV3><clientId>${escapeXml(clientId)}</clientId><begDate>${begin.toISOString()}</begDate><endDate>${end.toISOString()}</endDate></ns:getMCTransExtLocV3>`
  return parseAccountTransactionsV3(await post(envelope(body)))
}

export async function getCarrierInfo(clientId: string) {
  return parseCarrierInfo(await post(envelope(`<ns:getCarrierInfo><clientId>${escapeXml(clientId)}</clientId></ns:getCarrierInfo>`)))
}

export async function getContracts(clientId: string) {
  return parseContracts(await post(envelope(`<ns:getContracts><clientId>${escapeXml(clientId)}</clientId></ns:getContracts>`)))
}

export async function getCreditLimits(clientId: string, contractId: number) {
  return parseCreditLimits(await post(envelope(`<ns:getCreditLimits><clientId>${escapeXml(clientId)}</clientId><contractId>${contractId}</contractId></ns:getCreditLimits>`)))
}

export async function getCardV2(clientId: string, cardNumber: string) {
  return parseCardV2(await post(envelope(`<ns:getCardv2><clientId>${escapeXml(clientId)}</clientId><cardNumber>${escapeXml(cardNumber)}</cardNumber></ns:getCardv2>`)))
}

export async function setCardV2(clientId: string, card: WexCardV2) {
  const xml = await post(envelope(`<ns:setCardv2><clientId>${escapeXml(clientId)}</clientId><card>${serializeCardV2(card)}</card></ns:setCardv2>`), { retry: false })
  assertNoSoapFault(xml)
}

export async function getCardRefreshingLimits(clientId: string, cardNumber: string) {
  return parseCardRefreshingLimits(await post(envelope(`<ns:getCardRefreshingLimits><clientId>${escapeXml(clientId)}</clientId><cardNumber>${escapeXml(cardNumber)}</cardNumber></ns:getCardRefreshingLimits>`)))
}

export async function setCardRefreshingLimits(clientId: string, cardNumber: string, limits: WexCardRefreshingLimits) {
  const body = `<ns:setCardRefreshingLimits><clientId>${escapeXml(clientId)}</clientId><cardNumber>${escapeXml(cardNumber)}</cardNumber><cardRefreshingLimitsData>${serializeRefreshingLimits(limits)}</cardRefreshingLimitsData></ns:setCardRefreshingLimits>`
  return parseMutationResponse(await post(envelope(body), { retry: false }), 'setCardRefreshingLimits')
}

export async function getAllowedOrderTypes(clientId: string) {
  return parseAllowedOrderTypes(await post(envelope(`<ns:getAllowedOrderTypes><clientId>${escapeXml(clientId)}</clientId></ns:getAllowedOrderTypes>`)))
}

export async function createAndSubmitCardOrder(clientId: string, order: WexCardOrder) {
  const body = `<ns:createAndSubmitOrder><clientId>${escapeXml(clientId)}</clientId><order>${serializeCardOrder(order)}</order></ns:createAndSubmitOrder>`
  return parseMutationResponse(await post(envelope(body), { retry: false }), 'createAndSubmitOrder')
}

export async function replaceWexCard(clientId: string, order: WexReplacementCardOrder, damaged: boolean) {
  const operation = damaged ? 'reissueDamagedCard' : 'replaceLostOrStolenCard'
  const body = `<ns:${operation}><clientId>${escapeXml(clientId)}</clientId><data>${serializeReplacementCardOrder(order)}</data></ns:${operation}>`
  return parseMutationResponse(await post(envelope(body), { retry: false }), operation)
}
