import type { Lead } from '@/types/database.types'

export type LeadFollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'unscheduled'

export function getLeadFollowUpBucket(
  lead: Pick<Lead, 'status' | 'next_follow_up_at'>,
  now: number,
): LeadFollowUpBucket | null {
  if (lead.status === 'successful' || lead.status === 'deal_lost') return null
  if (!lead.next_follow_up_at) return 'unscheduled'

  const followUpAt = new Date(lead.next_follow_up_at).getTime()
  if (!Number.isFinite(followUpAt)) return 'unscheduled'
  if (followUpAt < now) return 'overdue'

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  return followUpAt <= endOfToday.getTime() ? 'today' : 'upcoming'
}
