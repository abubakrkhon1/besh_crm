export type ApplicationInvitationState = 'valid' | 'invalid' | 'expired' | 'used' | 'submitted'

type StoredApplicationInvitation = {
  application_id: string | null
  expires_at: string
  used_at: string | null
}

export function getApplicationInvitationState(
  invitation: StoredApplicationInvitation,
  now = new Date(),
): Exclude<ApplicationInvitationState, 'invalid'> {
  // A linked application means the one-time token was consumed successfully.
  // Check it before used_at so the post-submit server refresh shows confirmation.
  if (invitation.application_id) return 'submitted'
  if (invitation.used_at) return 'used'
  if (new Date(invitation.expires_at) <= now) return 'expired'
  return 'valid'
}
