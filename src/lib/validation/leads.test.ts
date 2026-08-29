import { describe, expect, it } from 'vitest'
import { addLeadNoteSchema, assignLeadSchema, createLeadSchema, updateLeadSchema, updateLeadWorkPlanSchema } from './leads'

const validLead = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  companyName: 'Analytical Engines',
  email: 'ada@example.com',
  phone: '',
  fleetSize: '12',
  preferredNetwork: 'Pilot Flying J',
  estimatedMonthlyGallons: '8500',
  accountType: 'credit_line',
  source: 'Referral',
  notes: 'Follow up next week.',
}

describe('createLeadSchema', () => {
  it('trims and converts valid lead fields', () => {
    const parsed = createLeadSchema.parse({ ...validLead, firstName: ' Ada ', source: ' Referral ' })

    expect(parsed.firstName).toBe('Ada')
    expect(parsed.fleetSize).toBe(12)
    expect(parsed.estimatedMonthlyGallons).toBe(8500)
    expect(parsed.accountType).toBe('credit_line')
    expect(parsed.source).toBe('Referral')
  })

  it('normalizes empty optional fields', () => {
    const parsed = createLeadSchema.parse({
      ...validLead,
      companyName: '',
      fleetSize: '',
      preferredNetwork: '',
      estimatedMonthlyGallons: '',
      source: '',
      notes: '',
    })

    expect(parsed.companyName).toBeNull()
    expect(parsed.fleetSize).toBeNull()
    expect(parsed.estimatedMonthlyGallons).toBeNull()
    expect(parsed.source).toBe('manual')
    expect(parsed.notes).toBeNull()
  })

  it('requires either an email address or a phone number', () => {
    const result = createLeadSchema.safeParse({ ...validLead, email: '', phone: '' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.email).toContain('Enter an email address or phone number.')
  })

  it('rejects invalid email addresses', () => {
    const result = createLeadSchema.safeParse({ ...validLead, email: 'not-an-email' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.email).toContain('Enter a valid email address.')
  })

  it.each(['-1', '1.5', 'twelve'])('rejects invalid fleet size %s', (fleetSize) => {
    const result = createLeadSchema.safeParse({ ...validLead, fleetSize })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.fleetSize).toBeDefined()
  })

  it('rejects an unsupported account type', () => {
    const result = createLeadSchema.safeParse({ ...validLead, accountType: 'cash' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.accountType).toContain('Select an account type.')
  })
})

describe('updateLeadSchema', () => {
  const validUpdate = {
    ...validLead,
    leadId: '3f71edbb-ffc9-4498-9ec2-a94fb8db9af8',
    status: 'follow_up',
  }

  it('accepts a valid lead update', () => {
    const parsed = updateLeadSchema.parse(validUpdate)

    expect(parsed.status).toBe('follow_up')
    expect(parsed.fleetSize).toBe(12)
  })

  it('rejects an unsupported status', () => {
    const result = updateLeadSchema.safeParse({ ...validUpdate, status: 'contacted' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.status).toContain('Select a lead status.')
  })
})

describe('assignLeadSchema', () => {
  const leadId = '3f71edbb-ffc9-4498-9ec2-a94fb8db9af8'
  const agentProfileId = '3373624b-061a-4fdc-a4b3-81673d7c24bb'

  it('accepts a lead and sales agent identifier', () => {
    expect(assignLeadSchema.parse({ leadId, agentProfileId })).toEqual({ leadId, agentProfileId })
  })

  it('normalizes an empty sales agent to unassigned', () => {
    expect(assignLeadSchema.parse({ leadId, agentProfileId: '  ' }).agentProfileId).toBeNull()
  })

  it('rejects malformed identifiers', () => {
    expect(assignLeadSchema.safeParse({ leadId: 'lead-1', agentProfileId }).success).toBe(false)
    expect(assignLeadSchema.safeParse({ leadId, agentProfileId: 'agent-1' }).success).toBe(false)
  })
})

describe('updateLeadWorkPlanSchema', () => {
  const leadId = '3f71edbb-ffc9-4498-9ec2-a94fb8db9af8'

  it('normalizes a browser-local follow-up to UTC', () => {
    expect(updateLeadWorkPlanSchema.parse({
      leadId,
      priority: 'high',
      nextFollowUpAt: '2026-08-28T09:30',
      timezoneOffsetMinutes: '240',
    })).toEqual({
      leadId,
      priority: 'high',
      nextFollowUpAt: '2026-08-28T13:30:00.000Z',
    })
  })

  it('allows a follow-up to be cleared', () => {
    expect(updateLeadWorkPlanSchema.parse({
      leadId,
      priority: 'normal',
      nextFollowUpAt: '',
      timezoneOffsetMinutes: '240',
    }).nextFollowUpAt).toBeNull()
  })

  it('rejects invalid priorities, dates, and timezone offsets', () => {
    expect(updateLeadWorkPlanSchema.safeParse({ leadId, priority: 'critical', nextFollowUpAt: '', timezoneOffsetMinutes: '240' }).success).toBe(false)
    expect(updateLeadWorkPlanSchema.safeParse({ leadId, priority: 'high', nextFollowUpAt: '2026-02-30T09:30', timezoneOffsetMinutes: '240' }).success).toBe(false)
    expect(updateLeadWorkPlanSchema.safeParse({ leadId, priority: 'high', nextFollowUpAt: '', timezoneOffsetMinutes: '900' }).success).toBe(false)
  })
})

describe('addLeadNoteSchema', () => {
  const leadId = '3f71edbb-ffc9-4498-9ec2-a94fb8db9af8'

  it('trims a valid timeline note', () => {
    expect(addLeadNoteSchema.parse({ leadId, note: '  Called and left a voicemail.  ' }).note)
      .toBe('Called and left a voicemail.')
  })

  it('rejects empty and oversized notes', () => {
    expect(addLeadNoteSchema.safeParse({ leadId, note: '  ' }).success).toBe(false)
    expect(addLeadNoteSchema.safeParse({ leadId, note: 'x'.repeat(2_001) }).success).toBe(false)
  })
})
