import { describe, expect, it } from 'vitest'
import { formatDateTime } from './date-time'

describe('formatDateTime', () => {
  it('converts a UTC timestamp to New York daylight time', () => {
    expect(formatDateTime('2026-08-21T20:37:00Z', { timeZone: 'America/New_York' }))
      .toBe('Aug 21, 2026, 4:37 PM')
  })

  it('uses daylight-saving rules instead of a fixed offset', () => {
    expect(formatDateTime('2026-12-21T20:37:00Z', { timeZone: 'America/New_York' }))
      .toBe('Dec 21, 2026, 3:37 PM')
  })
})
