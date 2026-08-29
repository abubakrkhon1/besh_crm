import { describe, expect, it } from 'vitest'
import { formatDateTime, isValidLocalDateTime, localDateTimeToIso } from './date-time'

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

describe('localDateTimeToIso', () => {
  it('converts a daylight-time browser value using its selected-date offset', () => {
    expect(localDateTimeToIso('2026-08-28T09:30', 240)).toBe('2026-08-28T13:30:00.000Z')
  })

  it('converts a standard-time browser value using its selected-date offset', () => {
    expect(localDateTimeToIso('2026-12-28T09:30', 300)).toBe('2026-12-28T14:30:00.000Z')
  })

  it('returns null when the follow-up is intentionally cleared', () => {
    expect(localDateTimeToIso('', 240)).toBeNull()
  })

  it('rejects impossible local dates and invalid offsets', () => {
    expect(isValidLocalDateTime('2026-02-30T09:30')).toBe(false)
    expect(localDateTimeToIso('2026-02-30T09:30', 300)).toBeUndefined()
    expect(localDateTimeToIso('2026-08-28T09:30', 900)).toBeUndefined()
  })
})
