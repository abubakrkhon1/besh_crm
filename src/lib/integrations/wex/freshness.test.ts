import { describe, expect, it } from 'vitest'
import { getWexFreshness, WEX_FRESHNESS_THRESHOLDS_MS } from './freshness'

const now = Date.parse('2026-08-29T12:00:00.000Z')

function minutesAgo(minutes: number) {
  return new Date(now - minutes * 60_000).toISOString()
}

describe('getWexFreshness', () => {
  it('marks transaction data current for fifteen minutes', () => {
    expect(getWexFreshness('transactions', minutesAgo(15), now).status).toBe('current')
    expect(getWexFreshness('transactions', minutesAgo(15.1), now).status).toBe('stale')
  })

  it('allows forty-five minutes for the half-hour account snapshot', () => {
    expect(getWexFreshness('account', minutesAgo(45), now).status).toBe('current')
    expect(getWexFreshness('account', minutesAgo(46), now).status).toBe('stale')
  })

  it('allows twenty-six hours for nightly reconciliation', () => {
    const thresholdMinutes = WEX_FRESHNESS_THRESHOLDS_MS.reconciliation / 60_000
    expect(getWexFreshness('reconciliation', minutesAgo(thresholdMinutes), now).status).toBe('current')
    expect(getWexFreshness('reconciliation', minutesAgo(thresholdMinutes + 1), now).status).toBe('stale')
  })

  it('reports missing or invalid timestamps separately', () => {
    expect(getWexFreshness('transactions', null, now)).toEqual({ status: 'missing', ageMs: null })
    expect(getWexFreshness('transactions', 'not-a-date', now)).toEqual({ status: 'missing', ageMs: null })
  })
})

