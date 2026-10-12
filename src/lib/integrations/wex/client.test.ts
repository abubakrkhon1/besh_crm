import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('undici', () => ({ ProxyAgent: class ProxyAgent {} }))

import { loginToWex } from './client'

describe('WEX client response limits', () => {
  beforeEach(() => {
    vi.stubEnv('WEX_API_USERNAME', 'test-user')
    vi.stubEnv('WEX_API_PASSWORD', 'test-password')
    vi.stubEnv('WEX_SOAP_ENDPOINT_URL', 'https://wex.example.test/soap')
    vi.stubEnv('WEX_HTTP_PROXY', 'http://proxy.example.test:8080')
    vi.stubEnv('WEX_CARD_FINGERPRINT_SECRET', 'a'.repeat(32))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not retry an oversized provider response', async () => {
    const fetchMock = vi.fn(async () => new Response('x', {
      headers: { 'content-length': String(15 * 1024 * 1024 + 1) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loginToWex()).rejects.toMatchObject({
      kind: 'response_too_large',
      retryable: false,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
