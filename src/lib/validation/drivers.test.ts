import { describe, expect, it } from 'vitest'
import { driverActivationSchema, driverInvitationSchema } from './drivers'

const token = 'a'.repeat(43)

describe('driverInvitationSchema', () => {
  it('normalizes a valid invitation email', () => {
    const result = driverInvitationSchema.parse({ driverId: '11111111-1111-4111-8111-111111111111', email: ' Driver@Example.com ' })
    expect(result.email).toBe('driver@example.com')
  })

  it('rejects malformed driver identity and email values', () => {
    expect(driverInvitationSchema.safeParse({ driverId: 'driver-1', email: 'not-email' }).success).toBe(false)
  })
})

describe('driverActivationSchema', () => {
  it('accepts a long passphrase and matching confirmation', () => {
    expect(driverActivationSchema.safeParse({ token, password: 'correct horse battery staple', confirmPassword: 'correct horse battery staple' }).success).toBe(true)
  })

  it('rejects short, common, mismatched, and malformed-token submissions', () => {
    expect(driverActivationSchema.safeParse({ token, password: 'short', confirmPassword: 'short' }).success).toBe(false)
    expect(driverActivationSchema.safeParse({ token, password: 'password1234', confirmPassword: 'password1234' }).success).toBe(false)
    expect(driverActivationSchema.safeParse({ token, password: 'correct horse battery staple', confirmPassword: 'different password value' }).success).toBe(false)
    expect(driverActivationSchema.safeParse({ token: 'bad-token', password: 'correct horse battery staple', confirmPassword: 'correct horse battery staple' }).success).toBe(false)
  })
})
