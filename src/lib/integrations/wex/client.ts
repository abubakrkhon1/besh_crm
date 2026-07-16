import 'server-only'

import { ProxyAgent } from 'undici'
import { WexError } from './errors'
import { wexEnvSchema } from './schemas'
import { assertNoSoapFault, envelope, escapeXml, parseAccountTransactionsV3, parseCardSummaries, parseCarrierInfo, parseChildTransactionsV3, parseLogin } from './soap'

function config() {
  const parsed = wexEnvSchema.safeParse(process.env)
  if (!parsed.success) throw new WexError('WEX server configuration is incomplete.', 'configuration')
  return parsed.data
}

async function post(body: string) {
  const env = config()
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(env.WEX_SOAP_ENDPOINT_URL, {
        method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: '""' }, body,
        signal: AbortSignal.timeout(15_000),
        dispatcher: new ProxyAgent(env.WEX_HTTP_PROXY),
      } as RequestInit)
      const text = await response.text()
      // Axis2 commonly returns SOAP faults with HTTP 500. Parse the XML before
      // reducing the failure to an HTTP status so namespace/business faults remain actionable.
      if (text.trim().startsWith('<')) assertNoSoapFault(text)
      if (!response.ok) {
        if ([502, 503, 504].includes(response.status) && attempt < 2) continue
        throw new WexError(`WEX request failed with HTTP ${response.status}.`, 'http')
      }
      return text
    } catch (error) {
      if (error instanceof WexError) throw error
      if (attempt < 2) continue
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
