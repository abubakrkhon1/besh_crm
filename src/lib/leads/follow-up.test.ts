import { describe, expect, it } from 'vitest'
import type { LeadStatus } from '@/types/database.types'
import { getLeadFollowUpBucket } from './follow-up'

const now = new Date(2026, 7, 28, 12, 0).getTime()

function lead(nextFollowUpAt: string | null, status: LeadStatus = 'follow_up') {
  return { next_follow_up_at: nextFollowUpAt, status }
}

describe('getLeadFollowUpBucket', () => {
  it('separates overdue, remaining-today, and upcoming follow-ups', () => {
    expect(getLeadFollowUpBucket(lead(new Date(2026, 7, 28, 11, 0).toISOString()), now)).toBe('overdue')
    expect(getLeadFollowUpBucket(lead(new Date(2026, 7, 28, 15, 0).toISOString()), now)).toBe('today')
    expect(getLeadFollowUpBucket(lead(new Date(2026, 7, 29, 9, 0).toISOString()), now)).toBe('upcoming')
  })

  it('identifies open leads without a follow-up', () => {
    expect(getLeadFollowUpBucket(lead(null), now)).toBe('unscheduled')
  })

  it.each<LeadStatus>(['successful', 'deal_lost'])('excludes closed %s leads', (status) => {
    expect(getLeadFollowUpBucket(lead(new Date(2026, 7, 28, 11, 0).toISOString(), status), now)).toBeNull()
  })
})
