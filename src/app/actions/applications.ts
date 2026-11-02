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
import {
  applicationReviewSchema,
  applicationSubmissionSchema,
  type ApplicationSubmission,
} from '@/lib/validation/applications'
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

export type ApplicationPage = {
  applications: ApplicationSafe[]
  total: number
  page: number
  pageSize: number
}

export type ApplicationSummary = {
  pending: number
  underReview: number
  needsDocuments: number
  approved: number
  denied: number
  approvedThisMonth: number
}

export async function getApplicationPage({
  page = 1,
  pageSize = 25,
  search,
  status,
  dateFilter = 'all',
}: {
  page?: number
  pageSize?: number
  search?: string
  status?: ApplicationStatus
  dateFilter?: 'all' | 'this_month' | 'last_30_days'
}): Promise<ApplicationPage> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)))
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) return { applications: [], total: 0, page: safePage, pageSize: safePageSize }

  const first = (safePage - 1) * safePageSize
  let query = createAdminClient()
    .from('applications')
    .select(APPLICATION_SAFE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (status) query = query.eq('status', status)
  const rangeStart = applicationDateRangeStart(dateFilter)
  if (rangeStart) query = query.gte('created_at', rangeStart)
  const safeSearch = sanitizeApplicationSearch(search)
  if (safeSearch) {
    const pattern = `%${safeSearch}%`
    query = query.or(`company_legal_name.ilike.${pattern},doing_business_as.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
  }

  const { data, count, error } = await query.range(first, first + safePageSize - 1)
  if (error) {
    console.error('getApplicationPage:', error)
    return { applications: [], total: 0, page: safePage, pageSize: safePageSize }
  }

  return { applications: data as unknown as ApplicationSafe[], total: count ?? 0, page: safePage, pageSize: safePageSize }
}

export async function getApplicationSummary(): Promise<ApplicationSummary> {
  const empty = { pending: 0, underReview: 0, needsDocuments: 0, approved: 0, denied: 0, approvedThisMonth: 0 }
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) return empty

  const admin = createAdminClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const statuses: ApplicationStatus[] = ['pending', 'under_review', 'needs_documents', 'approved', 'denied']
  const [approvedThisMonth, ...statusResults] = await Promise.all([
    admin.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('reviewed_at', monthStart.toISOString()),
    ...statuses.map((status) => admin.from('applications').select('id', { count: 'exact', head: true }).eq('status', status)),
  ])
  if (approvedThisMonth.error || statusResults.some((result) => result.error)) {
    console.error('getApplicationSummary:', approvedThisMonth.error ?? statusResults.find((result) => result.error)?.error)
    return empty
  }

  const counts = Object.fromEntries(statuses.map((status, index) => [status, statusResults[index].count ?? 0]))
  return {
    pending: counts.pending,
    underReview: counts.under_review,
    needsDocuments: counts.needs_documents,
    approved: counts.approved,
    denied: counts.denied,
    approvedThisMonth: approvedThisMonth.count ?? 0,
  }
}

function applicationDateRangeStart(dateFilter: 'all' | 'this_month' | 'last_30_days') {
  if (dateFilter === 'all') return null
  const now = new Date()
  if (dateFilter === 'this_month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString()
}

function sanitizeApplicationSearch(search?: string) {
  return search?.trim().replace(/[^\p{L}\p{N}@+\-\s]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100) || undefined
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
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) return { error: accessError }

  const parsed = applicationReviewSchema.safeParse({ id, status, denialReason })
  if (!parsed.success) return { error: 'Invalid application review decision.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const updateData: any = {
    status: parsed.data.status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id
  }

  if (parsed.data.status === 'denied' && parsed.data.denialReason) {
    updateData.denial_reason = parsed.data.denialReason
  } else if (parsed.data.status !== 'denied') {
    updateData.denial_reason = null
  }

  const { error } = await supabase
    .from('applications')
    .update(updateData)
    .eq('id', id)

  if (error) {
    if (error.code === '23514') {
      return { error: 'This application changed after you opened it. Refresh and review its current status.' }
    }
    console.error(`Error updating application to ${parsed.data.status}:`, error)
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
