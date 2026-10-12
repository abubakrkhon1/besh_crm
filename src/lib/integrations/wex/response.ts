import { WexError } from './errors'

export const MAX_WEX_XML_RESPONSE_BYTES = 15 * 1024 * 1024

function responseTooLarge() {
  return new WexError('WEX response exceeded the safe processing limit.', 'response_too_large')
}

export async function readWexXmlResponse(response: Response, maxBytes = MAX_WEX_XML_RESPONSE_BYTES) {
  const contentLength = response.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength)
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw responseTooLarge()
    }
  }

  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const parts: string[] = []
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw responseTooLarge()
      }
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join('')
  } finally {
    reader.releaseLock()
  }
}
