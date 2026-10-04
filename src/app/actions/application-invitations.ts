'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApplicationBaseUrl } from '@/lib/app-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/supabase/server'
import { getApplicationInvitationState } from '@/lib/application-invitations'
import { applicationSubmissionSchema, type ApplicationSubmission } from '@/lib/validation/applications'

const APPLICATION_ROLES = ['owner', 'admin', 'general_manager', 'sales_manager'] as const
const emailSchema = z.string().trim().email('Enter a valid email address.').max(320)

type InvitationLookup =
  | { status: 'valid'; email: string; expiresAt: string }
  | { status: 'invalid' | 'expired' | 'used' | 'submitted' }

export type SendInvitationResult = {
  success?: boolean
  error?: string
  warning?: string
  invitationUrl?: string
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!)
}

async function deliverInvitation(email: string, invitationUrl: string, inviterName: string | null) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.APPLICATION_INVITATION_FROM_EMAIL
  if (!apiKey || !from) {
    return { sent: false, error: 'Email delivery is not configured. Set RESEND_API_KEY and APPLICATION_INVITATION_FROM_EMAIL.' }
  }

  const safeUrl = escapeHtml(invitationUrl)
  const safeName = escapeHtml(inviterName || 'The BESH team')
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Complete your BESH fuel card application',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:600px;margin:auto"><h1 style="font-size:22px">You're invited to apply</h1><p>${safeName} invited you to complete a BESH fuel card application.</p><p><a href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Start application</a></p><p style="color:#666;font-size:13px">This private link expires in 7 days and can be used once. If the button does not work, copy this URL:<br>${safeUrl}</p></div>`,
      }),
    })
  } catch (error) {
    console.error('Invitation email request failed:', error)
    return { sent: false, error: 'The invitation was created, but the email provider could not be reached.' }
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('Invitation email delivery failed:', response.status, detail)
    return { sent: false, error: 'The invitation was created, but the email could not be delivered.' }
  }

  return { sent: true }
}

export async function sendApplicationInvitation(emailInput: string): Promise<SendInvitationResult> {
  const parsedEmail = emailSchema.safeParse(emailInput)
  if (!parsedEmail.success) return { error: parsedEmail.error.issues[0]?.message ?? 'Enter a valid email address.' }

  const { error: accessError, profile } = await requireRoles(APPLICATION_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }

  const token = randomBytes(32).toString('base64url')
  let invitationUrl: string
  try {
    invitationUrl = `${getApplicationBaseUrl()}/apply/${token}`
  } catch (error) {
    console.error('Unable to build the public application URL:', error)
    return { error: 'Unable to determine the public CRM URL.' }
  }

  const admin = createAdminClient()
  const { error: insertError } = await admin.from('application_invitations').insert({
    recipient_email: parsedEmail.data.toLowerCase(),
    token_hash: hashToken(token),
    invited_by_profile_id: profile.id,
  })

  if (insertError) {
    console.error('Unable to create application invitation:', insertError)
    return { error: 'Unable to create the invitation.' }
  }

  const delivery = await deliverInvitation(parsedEmail.data, invitationUrl, profile.full_name)
  if (!delivery.sent) return { success: true, warning: delivery.error, invitationUrl }

  return { success: true, invitationUrl }
}

export async function getApplicationInvitation(token: string): Promise<InvitationLookup> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { status: 'invalid' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('application_invitations')
    .select('recipient_email, expires_at, used_at, application_id')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (error || !data) return { status: 'invalid' }
  const status = getApplicationInvitationState(data)
  if (status !== 'valid') return { status }
  return { status: 'valid', email: data.recipient_email, expiresAt: data.expires_at }
}

export async function submitInvitedApplication(token: string, input: ApplicationSubmission) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { error: 'This invitation link is invalid.' }

  const parsed = applicationSubmissionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Please review the form and complete every required field.' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: invitation, error: claimError } = await admin
    .from('application_invitations')
    .update({ used_at: now })
    .eq('token_hash', hashToken(token))
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id, recipient_email')
    .maybeSingle()

  if (claimError || !invitation) return { error: 'This invitation has expired or has already been used.' }
  if (parsed.data.email.toLowerCase() !== invitation.recipient_email.toLowerCase()) {
    await admin.from('application_invitations').update({ used_at: null }).eq('id', invitation.id).is('application_id', null)
    return { error: 'Use the email address that received this invitation.' }
  }

  const { data: application, error: applicationError } = await admin
    .from('applications')
    .insert({ ...parsed.data, email: invitation.recipient_email, auth_user_id: null, status: 'pending', submitted_at: now })
    .select('id')
    .single()

  if (applicationError) {
    console.error('Public application submission failed:', applicationError)
    await admin.from('application_invitations').update({ used_at: null }).eq('id', invitation.id).is('application_id', null)
    return { error: 'We could not submit your application. Please try again.' }
  }

  await admin.from('application_invitations').update({ application_id: application.id }).eq('id', invitation.id)
  revalidatePath('/crm/applications')
  revalidatePath('/crm/dashboard')
  return { success: true }
}
