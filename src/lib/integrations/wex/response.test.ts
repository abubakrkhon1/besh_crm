import { describe, expect, it, vi } from 'vitest'
import { readWexXmlResponse } from './response'

describe('bounded WEX response reading', () => {
  it('rejects an oversized declared body before reading it', async () => {
    const cancel = vi.fn(async () => undefined)
    const response = {
      headers: new Headers({ 'content-length': '101' }),
      body: { cancel },
    } as unknown as Response

    await expect(readWexXmlResponse(response, 100)).rejects.toMatchObject({
      kind: 'response_too_large',
      retryable: false,
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('cancels a chunked body immediately when its bytes exceed the limit', async () => {
    const chunks = [new Uint8Array(60), new Uint8Array(50), new Uint8Array(50)]
    let pulls = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[pulls++]
        if (chunk) controller.enqueue(chunk)
        else controller.close()
      },
      cancel() { cancelled = true },
    })

    await expect(readWexXmlResponse(new Response(body), 100)).rejects.toMatchObject({
      kind: 'response_too_large',
      retryable: false,
    })
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThan(chunks.length + 1)
  })

  it('preserves UTF-8 characters split across network chunks', async () => {
    const encoded = new TextEncoder().encode('<value>café</value>')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 11))
        controller.enqueue(encoded.slice(11))
        controller.close()
      },
    })

    await expect(readWexXmlResponse(new Response(body), 100)).resolves.toBe('<value>café</value>')
  })
})
