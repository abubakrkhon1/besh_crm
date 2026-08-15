import { describe, expect, it } from 'vitest'
import { createLeadSchema, updateLeadSchema } from './leads'

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
