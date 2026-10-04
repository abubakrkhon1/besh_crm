'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getApplicationBaseUrl } from '@/lib/app-url'
import { requireRoles } from '@/lib/supabase/server'

const PORTAL_PROVISIONING_ROLES = ['owner', 'general_manager'] as const
const portalInvitationSchema = z.object({
  customerId: z.string().uuid(),
})

export type CustomerPortalInvitationResult = { ok: boolean; message: string }

async function portalRedirectUrl() {
  return `${getApplicationBaseUrl()}/reset-password`
}

export async function inviteCustomerPortalAdmin(input: unknown): Promise<CustomerPortalInvitationResult> {
  const parsed = portalInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter valid invitation details.' }
  const { error: accessError } = await requireRoles(PORTAL_PROVISIONING_ROLES)
  if (accessError) return { ok: false, message: 'Owner or general manager access is required to invite a company.' }

  const admin = createAdminClient()
  const { data: customer } = await admin.from('customers')
    .select('id,company_name,contact_name,email,status')
    .eq('id', parsed.data.customerId)
    .maybeSingle()
  if (!customer || customer.status !== 'active') return { ok: false, message: 'Only active customers can receive portal access.' }
  const emailResult = z.string().trim().email().max(254).safeParse(customer.email)
  if (!emailResult.success) return { ok: false, message: 'Add a valid email to the customer profile before sending a portal invitation.' }
  const email = emailResult.data.toLowerCase()
  const fullName = customer.contact_name?.trim() || `${customer.company_name?.trim() || 'Company'} administrator`

  const { data: existingProfiles, error: existingProfileError } = await admin.from('profiles')
    .select('id,role,customer_id')
    .ilike('email', email)
    .limit(1)
  if (existingProfileError) return { ok: false, message: 'Existing account access could not be checked.' }
  const existingProfile = existingProfiles?.[0]
  if (existingProfile) return { ok: false, message: 'That email already belongs to a BESH account.' }

  let redirectTo: string
  try {
    redirectTo = await portalRedirectUrl()
  } catch {
    return { ok: false, message: 'The public application URL is not configured.' }
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, account_type: 'customer_admin' },
    redirectTo,
  })
  if (error || !data.user) {
    console.warn('Customer portal invitation failed.', { code: error?.code })
    return { ok: false, message: 'The customer portal invitation could not be sent.' }
  }

  const { data: updatedProfile, error: profileError } = await admin.from('profiles').update({
    full_name: fullName,
    email,
    role: 'customer_admin',
    customer_id: parsed.data.customerId,
    is_active: true,
  }).eq('auth_user_id', data.user.id).select('id').maybeSingle()

  if (profileError || !updatedProfile) {
    console.error('Customer portal profile linking failed.', { authUserId: data.user.id, code: profileError?.code })
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, message: 'The portal account could not be linked. No account was kept.' }
  }

  revalidatePath(`/crm/customers/${parsed.data.customerId}`)
  return { ok: true, message: 'Customer portal invitation sent.' }
}

export async function resendCustomerPortalSetup(input: unknown): Promise<CustomerPortalInvitationResult> {
  const parsed = portalInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Customer ID is invalid.' }
  const { error: accessError } = await requireRoles(PORTAL_PROVISIONING_ROLES)
  if (accessError) return { ok: false, message: 'Owner or general manager access is required to resend portal setup.' }

  const admin = createAdminClient()
  const { data: customer } = await admin.from('customers').select('status').eq('id', parsed.data.customerId).maybeSingle()
  if (!customer || customer.status !== 'active') return { ok: false, message: 'Only active customers can receive portal setup links.' }

  const { data: portalProfile, error: profileError } = await admin.from('profiles')
    .select('email,is_active')
    .eq('customer_id', parsed.data.customerId)
    .eq('role', 'customer_admin')
    .limit(1)
    .maybeSingle()
  if (profileError || !portalProfile?.email) return { ok: false, message: 'This customer does not have a portal administrator with an email address.' }

  let redirectTo: string
  try {
    redirectTo = await portalRedirectUrl()
  } catch {
    return { ok: false, message: 'The public application URL is not configured.' }
  }

  const { error } = await admin.auth.resetPasswordForEmail(portalProfile.email, { redirectTo })
  if (error) {
    console.warn('Customer portal setup resend failed.', { customerId: parsed.data.customerId, code: error.code })
    return { ok: false, message: 'A new portal setup link could not be sent.' }
  }

  return { ok: true, message: 'A new portal setup link was sent.' }
}
