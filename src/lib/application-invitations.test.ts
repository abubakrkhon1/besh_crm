import { describe, expect, it } from 'vitest'
import { getApplicationInvitationState } from './application-invitations'

const now = new Date('2026-09-02T12:00:00.000Z')

describe('getApplicationInvitationState', () => {
  it('reports a successfully linked application as submitted after its token is used', () => {
    expect(getApplicationInvitationState({
      application_id: '5db5cabd-e04d-4a99-9348-a3df80f950b8',
      expires_at: '2026-09-03T12:00:00.000Z',
      used_at: '2026-09-02T11:00:00.000Z',
    }, now)).toBe('submitted')
  })

  it('reports a consumed token without a linked application as used', () => {
    expect(getApplicationInvitationState({
      application_id: null,
      expires_at: '2026-09-03T12:00:00.000Z',
      used_at: '2026-09-02T11:00:00.000Z',
    }, now)).toBe('used')
  })

  it('reports unused invitations according to their expiration', () => {
    expect(getApplicationInvitationState({ application_id: null, expires_at: '2026-09-03T12:00:00.000Z', used_at: null }, now)).toBe('valid')
    expect(getApplicationInvitationState({ application_id: null, expires_at: '2026-09-01T12:00:00.000Z', used_at: null }, now)).toBe('expired')
  })
})
