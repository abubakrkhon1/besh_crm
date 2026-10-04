'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, requireRoles } from '@/lib/supabase/server'
import { ApplicationStatus } from '@/types/database.types'
import {
  APPLICATION_SAFE_SELECT,
  type ApplicationForReview,
  type ApplicationSafe,
  withoutSensitiveApplicationFields,
} from '@/lib/application-access'
import { applicationSubmissionSchema, type ApplicationSubmission } from '@/lib/validation/applications'
import { revalidatePath } from 'next/cache'

const APPLICATION_ROLES = ['owner', 'admin', 'general_manager', 'sales_manager'] as const

export async function getApplications(): Promise<ApplicationSafe[]> {
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) {
    return []
  }

  const { data, error } = await createAdminClient()
    .from('applications')
    .select(APPLICATION_SAFE_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching applications:', error)
    return []
  }

  return data as unknown as ApplicationSafe[]
}

export async function getApplication(id: string): Promise<ApplicationForReview | null> {
  const { error: accessError, profile } = await requireRoles(APPLICATION_ROLES)
  if (accessError || !profile) {
    return null
  }

  const canReviewSensitiveFields = ['owner', 'admin', 'general_manager'].includes(profile.role)
  const { data, error } = await createAdminClient()
    .from('applications')
    .select(canReviewSensitiveFields ? '*' : APPLICATION_SAFE_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching application:', error)
    return null
  }

  if (canReviewSensitiveFields) return data as unknown as ApplicationForReview
  return withoutSensitiveApplicationFields(data as unknown as ApplicationSafe)
}

export async function getDashboardStats() {
  const supabase = await createClient()

  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) {
    return { total: 0, pending: 0, approved: 0, denied: 0 }
  }

  const { data, error } = await supabase
    .from('applications')
    .select('status')

  if (error) {
    console.error('Error fetching stats:', error)
    return {
      total: 0,
      pending: 0,
      approved: 0,
      denied: 0,
    }
  }

  return {
    total: data.length,
    pending: data.filter((a) => a.status === 'pending').length,
    approved: data.filter((a) => a.status === 'approved').length,
    denied: data.filter((a) => a.status === 'denied').length,
  }
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus, denialReason?: string) {
  const supabase = await createClient()

  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  const { data: { user } } = await supabase.auth.getUser()
  if (accessError || !user) {
    return { error: accessError || 'Unauthorized' }
  }

  const updateData: any = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id
  }

  if (status === 'denied' && denialReason) {
    updateData.denial_reason = denialReason
  } else if (status !== 'denied') {
    updateData.denial_reason = null // Clear reason if status changes from denied
  }

  const { error } = await supabase
    .from('applications')
    .update(updateData)
    .eq('id', id)

  if (error) {
    console.error(`Error updating application to ${status}:`, error)
    return { error: error.message }
  }

  revalidatePath('/crm/applications')
  revalidatePath(`/crm/applications/${id}`)
  revalidatePath('/crm/dashboard')
  return { success: true }
}

export async function reviewApplicationAction(id: string, status: ApplicationStatus, formData: FormData) {
  const denialReason = status === 'denied' ? String(formData.get('denialReason') ?? '').trim() || undefined : undefined
  await updateApplicationStatus(id, status, denialReason)
}

export async function createApplication(data: ApplicationSubmission) {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: applicantProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profileError || !applicantProfile?.is_active) return { error: 'Account access is unavailable.' }
  if (applicantProfile.role !== 'driver') {
    return { error: 'CRM and company portal accounts cannot submit customer applications.' }
  }

  const parsed = applicationSubmissionSchema.safeParse(data)
  if (!parsed.success) {
    return { error: 'Please review the form and complete every required field.' }
  }

  // Insert the application, linking it to the current user
  const { data: createdApp, error } = await supabase
    .from('applications')
    .insert([{ ...parsed.data, auth_user_id: user.id, status: 'pending' }])
    .select(APPLICATION_SAFE_SELECT)
    .single()

  if (error) {
    console.error('Error creating application:', error)
    return { error: error.message }
  }

  revalidatePath('/crm/applications')
  revalidatePath('/crm/dashboard')
  return { success: true, application: createdApp as unknown as ApplicationSafe }
}
