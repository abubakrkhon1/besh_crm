import { describe, expect, it } from 'vitest'
import { WexError } from './errors'
import { classifyWexJobError, retryDelaySeconds } from './job-policy'

describe('WEX durable job policy', () => {
  it('applies bounded jitter to the retry schedule', () => {
    expect(retryDelaySeconds(1, () => 0)).toBe(60)
    expect(retryDelaySeconds(2, () => 0)).toBe(300)
    expect(retryDelaySeconds(3, () => 0.999)).toBeGreaterThanOrEqual(900)
    expect(retryDelaySeconds(20, () => 0)).toBe(1_800)
  })

  it('preserves provider retryability', () => {
    expect(classifyWexJobError(new WexError('Temporary network failure', 'network', true))).toMatchObject({
      code: 'network',
      retryable: true,
    })
    expect(classifyWexJobError(new WexError('Bad configuration', 'configuration'))).toMatchObject({
      code: 'configuration',
      retryable: false,
    })
  })

  it('redacts long numeric identifiers from stored errors', () => {
    expect(classifyWexJobError(new Error('Card 1234567890123456 failed')).message).toBe('Card [redacted] failed')
  })
})
