'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/supabase/server'
import { getApplicationBaseUrl } from '@/lib/app-url'
import { escapeEmailHtml, sendApplicationEmail } from '@/lib/email/resend'
import {
  driverActivationSchema,
  driverInvitationSchema,
  type DriverActivationState,
} from '@/lib/validation/drivers'

const DRIVER_MANAGER_ROLES = ['owner', 'admin', 'general_manager', 'customer_admin'] as const
const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1_000

export type DriverInvitationActionResult = {
  success?: boolean
  error?: string
  warning?: string
  activationUrl?: string
}

export type PublicDriverInvitation =
  | { status: 'valid'; driverName: string; maskedEmail: string; expiresAt: string }
  | { status: 'invalid' | 'expired' | 'used' | 'revoked' }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'your verified email'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`
}

function driverName(driver: { display_name?: string | null; first_name: string; last_name: string }) {
  return driver.display_name?.trim() || `${driver.first_name} ${driver.last_name}`.trim() || 'Driver'
}

function canManageDriver(profile: { role: string; customer_id: string | null }, customerId: string) {
  return profile.role !== 'customer_admin' || profile.customer_id === customerId
}

function revalidateDriverViews(customerId: string) {
  revalidatePath(`/crm/customers/${customerId}`)
  revalidatePath('/portal/dashboard')
  revalidatePath('/portal/drivers')
}

async function sendDriverInvitationEmail(email: string, name: string, activationUrl: string) {
  const safeName = escapeEmailHtml(name)
  const safeUrl = escapeEmailHtml(activationUrl)
  return sendApplicationEmail({
    to: email,
    subject: 'Activate your BESH Mobile driver account',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:600px;margin:auto"><h1 style="font-size:22px">Activate your driver account</h1><p>Hello ${safeName},</p><p>Your fleet administrator invited you to activate BESH Mobile.</p><p><a href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Activate account</a></p><p style="color:#666;font-size:13px">This private, single-use link expires in 72 hours. BESH will never ask you to send your password by email. If you did not expect this invitation, ignore this message.</p></div>`,
  })
}

export async function sendDriverInvitation(input: unknown): Promise<DriverInvitationActionResult> {
  const parsed = driverInvitationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invitation details are invalid.' }

  const { error: accessError, profile } = await requireRoles(DRIVER_MANAGER_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }

  const admin = createAdminClient()
  const { data: driver, error: driverError } = await admin
    .from('drivers')
    .select('id,customer_id,first_name,last_name,display_name,email,status,onboarding_status,auth_user_id')
    .eq('id', parsed.data.driverId)
    .maybeSingle()

  if (driverError || !driver) return { error: 'Driver could not be found.' }
  if (!canManageDriver(profile, driver.customer_id)) return { error: 'You cannot manage a driver outside your company.' }
  if (driver.status !== 'active' || driver.onboarding_status === 'disabled') return { error: 'Only active drivers can be invited.' }
  if (driver.auth_user_id || driver.onboarding_status === 'active') return { error: 'This driver already has a mobile account.' }

  const { data: conflictingDriver } = await admin
    .from('drivers')
    .select('id,auth_user_id,onboarding_status')
    .ilike('email', parsed.data.email)
    .neq('id', driver.id)
    .or('auth_user_id.not.is.null,onboarding_status.in.(invited,active)')
    .limit(1)
    .maybeSingle()
  if (conflictingDriver) return { error: 'That email is already linked to another driver account.' }

  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS).toISOString()
  let activationUrl: string
  try {
    activationUrl = `${getApplicationBaseUrl()}/driver-activation/${token}`
  } catch (error) {
    console.error('Driver activation URL could not be built.', error)
    return { error: 'The public application URL is not configured.' }
  }

  await admin.from('driver_invitations').update({
    status: 'revoked',
    revoked_at: now.toISOString(),
  }).eq('driver_id', driver.id).in('status', ['pending', 'sent', 'delivery_failed'])

  const { data: invitation, error: insertError } = await admin.from('driver_invitations').insert({
    driver_id: driver.id,
    recipient_email: parsed.data.email,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_by: profile.auth_user_id,
  }).select('id').single()
  if (insertError || !invitation) {
    console.error('Driver invitation could not be created.', { code: insertError?.code })
    return { error: 'Driver invitation could not be created.' }
  }

  const delivery = await sendDriverInvitationEmail(parsed.data.email, driverName(driver), activationUrl)
  const invitationUpdate = delivery.sent
    ? { status: 'sent', sent_at: new Date().toISOString(), delivery_provider_id: delivery.providerMessageId, delivery_error: null }
    : { status: 'delivery_failed', delivery_error: delivery.error }

  const [{ error: invitationUpdateError }, { error: driverUpdateError }] = await Promise.all([
    admin.from('driver_invitations').update(invitationUpdate).eq('id', invitation.id),
    admin.from('drivers').update({
      email: parsed.data.email,
      onboarding_status: 'invited',
      invited_at: new Date().toISOString(),
    }).eq('id', driver.id).is('auth_user_id', null),
  ])

  if (invitationUpdateError || driverUpdateError) {
    console.error('Driver invitation audit update failed.', {
      invitationCode: invitationUpdateError?.code,
      driverCode: driverUpdateError?.code,
    })
    return { error: 'The invitation was created but could not be finalized. Revoke it before retrying.' }
  }

  revalidateDriverViews(driver.customer_id)
  if (!delivery.sent) return { success: true, warning: delivery.error, activationUrl }
  return { success: true, activationUrl }
}

export async function revokeDriverInvitation(driverId: string): Promise<DriverInvitationActionResult> {
  const parsedDriverId = driverInvitationSchema.shape.driverId.safeParse(driverId)
  if (!parsedDriverId.success) return { error: 'Driver ID is invalid.' }

  const { error: accessError, profile } = await requireRoles(DRIVER_MANAGER_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: driver } = await admin.from('drivers').select('id,customer_id,auth_user_id,onboarding_status').eq('id', driverId).maybeSingle()
  if (!driver) return { error: 'Driver could not be found.' }
  if (!canManageDriver(profile, driver.customer_id)) return { error: 'You cannot manage a driver outside your company.' }
  if (driver.auth_user_id || driver.onboarding_status === 'active') return { error: 'An activated account cannot be revoked as an invitation.' }

  const { error } = await admin.from('driver_invitations').update({ status: 'revoked', revoked_at: now })
    .eq('driver_id', driverId).in('status', ['pending', 'sent', 'delivery_failed'])
  if (error) return { error: 'Invitation could not be revoked.' }

  await admin.from('drivers').update({ onboarding_status: 'unclaimed', invited_at: null }).eq('id', driverId).is('auth_user_id', null)
  revalidateDriverViews(driver.customer_id)
  return { success: true }
}

export async function setDriverMobileAccess(driverId: string, enabled: boolean): Promise<DriverInvitationActionResult> {
  const parsedDriverId = driverInvitationSchema.shape.driverId.safeParse(driverId)
  if (!parsedDriverId.success || typeof enabled !== 'boolean') return { error: 'Mobile access request is invalid.' }

  const { error: accessError, profile } = await requireRoles(DRIVER_MANAGER_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }

  const admin = createAdminClient()
  const { data: driver } = await admin.from('drivers')
    .select('id,customer_id,auth_user_id,status,onboarding_status')
    .eq('id', driverId)
    .maybeSingle()
  if (!driver) return { error: 'Driver could not be found.' }
  if (!canManageDriver(profile, driver.customer_id)) return { error: 'You cannot manage a driver outside your company.' }
  if (!driver.auth_user_id) return { error: 'This driver has not activated a mobile account.' }
  if (enabled && driver.status !== 'active') return { error: 'An inactive or suspended driver cannot be enabled.' }

  const now = new Date().toISOString()
  const { error: driverError } = await admin.from('drivers').update({
    onboarding_status: enabled ? 'active' : 'disabled',
    disabled_at: enabled ? null : now,
  }).eq('id', driver.id).eq('auth_user_id', driver.auth_user_id)
  if (driverError) return { error: 'Driver mobile access could not be updated.' }

  const { error: profileError } = await admin.from('profiles').update({ is_active: enabled })
    .eq('auth_user_id', driver.auth_user_id).eq('role', 'driver')
  if (profileError) {
    console.error('Driver profile activation state could not be updated.', { driverId, code: profileError.code })
    if (enabled) {
      await admin.from('drivers').update({ onboarding_status: 'disabled', disabled_at: now }).eq('id', driver.id)
      return { error: 'Mobile access remains disabled because the Auth profile could not be enabled.' }
    }
    // The driver row and RLS policies already deny data access. Report success
    // with a warning so operators know the secondary profile flag needs repair.
    revalidateDriverViews(driver.customer_id)
    return { success: true, warning: 'Access is blocked, but the Auth profile audit flag could not be updated.' }
  }

  revalidateDriverViews(driver.customer_id)
  return { success: true }
}

export async function getPublicDriverInvitation(token: string): Promise<PublicDriverInvitation> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { status: 'invalid' }

  const admin = createAdminClient()
  const { data: invitation, error } = await admin.from('driver_invitations')
    .select('id,recipient_email,status,expires_at,drivers(first_name,last_name,display_name,auth_user_id,onboarding_status,status)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error || !invitation) return { status: 'invalid' }
  if (invitation.status === 'revoked') return { status: 'revoked' }
  if (invitation.status === 'claimed') return { status: 'used' }
  if (!['pending', 'sent', 'delivery_failed'].includes(invitation.status)) return { status: 'invalid' }

  const driverRelation = Array.isArray(invitation.drivers) ? invitation.drivers[0] : invitation.drivers
  if (!driverRelation || driverRelation.auth_user_id || driverRelation.onboarding_status === 'active') return { status: 'used' }
  if (driverRelation.status !== 'active' || driverRelation.onboarding_status === 'disabled') return { status: 'revoked' }
  if (Date.parse(invitation.expires_at) <= Date.now()) {
    await admin.from('driver_invitations').update({ status: 'expired' }).eq('id', invitation.id).in('status', ['pending', 'sent', 'delivery_failed'])
    return { status: 'expired' }
  }

  return {
    status: 'valid',
    driverName: driverName(driverRelation),
    maskedEmail: maskEmail(invitation.recipient_email),
    expiresAt: invitation.expires_at,
  }
}

export async function activateDriverAccount(
  token: string,
  _previousState: DriverActivationState,
  formData: FormData,
): Promise<DriverActivationState> {
  const parsed = driverActivationSchema.safeParse({
    token,
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors
    return {
      error: 'Review the password fields.',
      fieldErrors: {
        password: flattened.password?.[0],
        confirmPassword: flattened.confirmPassword?.[0],
      },
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: invitation, error: invitationError } = await admin.from('driver_invitations')
    .select('id,driver_id,recipient_email,status,expires_at,drivers(id,first_name,last_name,display_name,status,onboarding_status,auth_user_id)')
    .eq('token_hash', hashToken(parsed.data.token))
    .in('status', ['pending', 'sent', 'delivery_failed'])
    .gt('expires_at', now)
    .maybeSingle()
  if (invitationError || !invitation) return { error: 'This activation link is invalid, expired, or already used.' }

  const driver = Array.isArray(invitation.drivers) ? invitation.drivers[0] : invitation.drivers
  if (!driver || driver.auth_user_id || driver.onboarding_status === 'active') return { error: 'This driver account has already been activated.' }
  if (driver.status !== 'active' || driver.onboarding_status === 'disabled') return { error: 'This driver is not eligible for mobile access.' }

  const { data: authData, error: createUserError } = await admin.auth.admin.createUser({
    email: invitation.recipient_email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: driverName(driver), account_type: 'driver' },
  })
  if (createUserError || !authData.user) {
    console.warn('Driver Auth user could not be created.', { code: createUserError?.code })
    return { error: 'An account may already use this email. Try signing in or resetting the password.' }
  }

  const authUserId = authData.user.id
  // handle_new_user creates this row as part of Auth user creation. Update that
  // exact row instead of upserting on auth_user_id: the latter is redundant and
  // fails on schemas where the identity column has no inferable unique index.
  const { data: linkedProfile, error: profileError } = await admin.from('profiles').update({
    full_name: driverName(driver),
    email: invitation.recipient_email,
    role: 'driver',
    is_active: true,
  }).eq('id', authUserId).eq('auth_user_id', authUserId).select('id').maybeSingle()

  const { data: linkedDriver, error: linkError } = profileError || !linkedProfile
    ? { data: null, error: profileError ?? { code: 'PROFILE_NOT_CREATED' } }
    : await admin.from('drivers').update({
      auth_user_id: authUserId,
      email: invitation.recipient_email,
      onboarding_status: 'active',
      claimed_at: now,
      disabled_at: null,
    }).eq('id', driver.id).is('auth_user_id', null).eq('onboarding_status', 'invited').select('id').maybeSingle()

  if (linkError || !linkedDriver) {
    console.error('Driver account linking failed; compensating Auth user creation.', { code: linkError?.code })
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId)
    if (cleanupError) console.error('Orphaned driver Auth user cleanup failed.', { authUserId, code: cleanupError.code })
    return { error: 'The account could not be linked. No password was saved; try this invitation again.' }
  }

  const { error: claimAuditError } = await admin.from('driver_invitations').update({
    status: 'claimed',
    claimed_at: now,
    claimed_by_auth_user_id: authUserId,
  }).eq('id', invitation.id).in('status', ['pending', 'sent', 'delivery_failed'])
  if (claimAuditError) console.error('Driver invitation claim audit failed.', { invitationId: invitation.id, code: claimAuditError.code })

  await admin.from('driver_invitations').update({ status: 'revoked', revoked_at: now })
    .eq('driver_id', driver.id).neq('id', invitation.id).in('status', ['pending', 'sent', 'delivery_failed'])

  return { success: true }
}
