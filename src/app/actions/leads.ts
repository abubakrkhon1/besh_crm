'use server'

import { revalidatePath } from 'next/cache'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'
import {
  addLeadNoteSchema,
  AddLeadNoteField,
  assignLeadSchema,
  AssignLeadField,
  createLeadSchema,
  CreateLeadField,
  updateLeadWorkPlanSchema,
  UpdateLeadWorkPlanField,
  updateLeadSchema,
  UpdateLeadField,
} from '@/lib/validation/leads'
import { Lead, LeadActivity, Profile } from '@/types/database.types'
import type { LeadFollowUpBucket } from '@/lib/leads/follow-up'

export type LeadWithRepresentative = Lead & {
  representative?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export type LeadPage = {
  leads: LeadWithRepresentative[]
  total: number
  page: number
  pageSize: number
}

export type LeadWorkspaceSummary = {
  total: number
  status_counts: Record<Lead['status'], number>
  follow_up_counts: Record<LeadFollowUpBucket, number>
  sources: Array<{ source: string; count: number }>
  top_representatives: Array<{ id: string | null; name: string; count: number }>
}

type LeadWorkspaceFilters = {
  representativeId?: string
  rangeStart?: string
  rangeEnd?: string
  search?: string
  status?: Lead['status']
  source?: string
  accountType?: Lead['account_type']
  followUp?: LeadFollowUpBucket
  timezoneOffsetMinutes?: number
}

function getFollowUpBoundaries(timezoneOffsetMinutes = 0) {
  const now = new Date()
  const safeOffset = Math.min(840, Math.max(-840, Math.trunc(timezoneOffsetMinutes)))
  const localNow = new Date(now.getTime() - safeOffset * 60_000)
  const nextLocalDay = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1)
  return {
    now: now.toISOString(),
    nextDayStart: new Date(nextLocalDay + safeOffset * 60_000).toISOString(),
  }
}

function sanitizeLeadSearch(search?: string) {
  return search?.trim().replace(/[^\p{L}\p{N}@+\-\s]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100) || undefined
}

export async function getLeadPage({
  representativeId,
  rangeStart,
  rangeEnd,
  page = 1,
  pageSize = 25,
  search,
  status,
  source,
  accountType,
  followUp,
  timezoneOffsetMinutes = 0,
}: LeadWorkspaceFilters & {
  page?: number
  pageSize?: number
}): Promise<LeadPage> {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)))
  const { error } = await requireRoles(CRM_ROLES)
  if (error) return { leads: [], total: 0, page: safePage, pageSize: safePageSize }

  const first = (safePage - 1) * safePageSize
  let query = (await createClient())
    .from('leads')
    .select('*, representative:profiles!leads_assigned_to_profile_id_fkey(id, full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (representativeId) query = query.eq('assigned_to_profile_id', representativeId)
  if (rangeStart) query = query.gte('created_at', rangeStart)
  if (rangeEnd) query = query.lt('created_at', rangeEnd)
  if (status) query = query.eq('status', status)
  if (source) query = query.eq('source', source)
  if (accountType) query = query.eq('account_type', accountType)
  if (followUp) {
    query = query.in('status', ['new', 'on_the_process', 'follow_up'])
    const { now, nextDayStart } = getFollowUpBoundaries(timezoneOffsetMinutes)

    if (followUp === 'unscheduled') query = query.is('next_follow_up_at', null)
    if (followUp === 'overdue') query = query.lt('next_follow_up_at', now)
    if (followUp === 'today') query = query.gte('next_follow_up_at', now).lt('next_follow_up_at', nextDayStart)
    if (followUp === 'upcoming') query = query.gte('next_follow_up_at', nextDayStart)
  }
  const safeSearch = sanitizeLeadSearch(search)
  if (safeSearch) {
    const pattern = `%${safeSearch}%`
    query = query.or(`company_name.ilike.${pattern},contact_first_name.ilike.${pattern},contact_last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
  }

  const { data, count, error: queryError } = await query.range(first, first + safePageSize - 1)
  if (queryError) {
    console.error('getLeadPage:', queryError)
    return { leads: [], total: 0, page: safePage, pageSize: safePageSize }
  }

  return {
    leads: data as unknown as LeadWithRepresentative[],
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  }
}

export async function getLeadWorkspaceSummary(filters: LeadWorkspaceFilters): Promise<LeadWorkspaceSummary | null> {
  const { error } = await requireRoles(CRM_ROLES)
  if (error) return null

  const { now, nextDayStart } = getFollowUpBoundaries(filters.timezoneOffsetMinutes)
  const { data, error: queryError } = await (await createClient()).rpc('lead_workspace_summary', {
    p_representative_id: filters.representativeId,
    p_range_start: filters.rangeStart,
    p_range_end: filters.rangeEnd,
    p_search: sanitizeLeadSearch(filters.search),
    p_status: filters.status,
    p_source: filters.source,
    p_account_type: filters.accountType,
    p_follow_up: filters.followUp,
    p_now: now,
    p_next_day_start: nextDayStart,
  })
  if (queryError) {
    console.error('getLeadWorkspaceSummary:', queryError)
    return null
  }

  return data as LeadWorkspaceSummary
}

export async function getLeads(
  representativeId?: string,
  rangeStart?: string,
  rangeEnd?: string,
  limit?: number,
): Promise<LeadWithRepresentative[]> {
  const { error } = await requireRoles(CRM_ROLES)
  if (error) return []

  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('*, representative:profiles!leads_assigned_to_profile_id_fkey(id, full_name, email)')
    .order('created_at', { ascending: false })

  if (representativeId) query = query.eq('assigned_to_profile_id', representativeId)
  if (rangeStart) query = query.gte('created_at', rangeStart)
  if (rangeEnd) query = query.lt('created_at', rangeEnd)
  if (limit) query = query.limit(Math.min(Math.max(limit, 1), 500))

  const { data, error: queryError } = await query
  if (queryError) {
    console.error('getLeads:', queryError)
    return []
  }

  return data as unknown as LeadWithRepresentative[]
}

export async function getSalesAgents(): Promise<Profile[]> {
  const { profile, error } = await requireRoles(['owner', 'admin', 'general_manager', 'sales_manager'])
  if (error || !profile) return []

  const supabase = await createClient()
  let query = supabase
    .from('profiles')
    .select('id, auth_user_id, full_name, email, role, avatar_url, department, is_active, customer_id, manager_profile_id, created_at, updated_at')
    .eq('role', 'sales_agent')
    .eq('is_active', true)

  if (profile.role === 'sales_manager') query = query.eq('manager_profile_id', profile.id)

  const { data, error: queryError } = await query.order('full_name')

  if (queryError) {
    console.error('getSalesAgents:', queryError)
    return []
  }

  return data as Profile[]
}

export type AssignLeadState = {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<AssignLeadField, string[]>>
}

export async function assignLead(_previousState: AssignLeadState, formData: FormData): Promise<AssignLeadState> {
  const { profile, error } = await requireRoles(['sales_manager'])
  if (error || !profile) return { error: 'You do not have permission to assign leads.' }

  const parsed = assignLeadSchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    agentProfileId: String(formData.get('agentProfileId') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: 'Select a valid sales agent and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = await createClient()
  const { leadId, agentProfileId } = parsed.data

  if (agentProfileId) {
    const { data: agent, error: agentError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', agentProfileId)
      .eq('role', 'sales_agent')
      .eq('manager_profile_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()

    if (agentError || !agent) {
      return { error: 'That sales agent is not an active member of your team.' }
    }
  }

  const { data: lead, error: updateError } = await supabase
    .from('leads')
    .update({ assigned_to_profile_id: agentProfileId })
    .eq('id', leadId)
    .eq('sales_manager_profile_id', profile.id)
    .select('id')
    .maybeSingle()

  if (updateError || !lead) {
    console.error('assignLead:', updateError)
    return { error: 'The lead could not be assigned. Refresh the page and try again.' }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/sales-agents')
  return { success: true }
}

export type UpdateLeadWorkPlanState = {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<UpdateLeadWorkPlanField, string[]>>
}

export async function updateLeadWorkPlan(
  _previousState: UpdateLeadWorkPlanState,
  formData: FormData,
): Promise<UpdateLeadWorkPlanState> {
  const { profile, error } = await requireRoles(CRM_ROLES)
  if (error || !profile) return { error: 'You do not have permission to update this lead.' }

  const parsed = updateLeadWorkPlanSchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    priority: String(formData.get('priority') ?? ''),
    nextFollowUpAt: String(formData.get('nextFollowUpAt') ?? ''),
    timezoneOffsetMinutes: String(formData.get('timezoneOffsetMinutes') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: 'Review the priority and follow-up time.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { data: lead, error: updateError } = await (await createClient())
    .from('leads')
    .update({
      priority: parsed.data.priority,
      next_follow_up_at: parsed.data.nextFollowUpAt,
    })
    .eq('id', parsed.data.leadId)
    .select('id')
    .maybeSingle()

  if (updateError || !lead) {
    console.error('updateLeadWorkPlan:', updateError)
    return { error: 'The lead work plan could not be updated. Refresh the page and try again.' }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/sales-agents')
  return { success: true }
}

export type LeadActivityPage = {
  activities: LeadActivity[]
  nextOffset: number | null
}

export async function getLeadActivities(leadId: string, offset = 0, pageSize = 25): Promise<LeadActivityPage> {
  const { error } = await requireRoles(CRM_ROLES)
  if (error || !zUuid(leadId)) return { activities: [], nextOffset: null }

  const safeOffset = Math.max(0, Math.floor(offset) || 0)
  const safePageSize = Math.min(50, Math.max(10, Math.floor(pageSize) || 25))

  const { data, error: queryError } = await (await createClient())
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(safeOffset, safeOffset + safePageSize)

  if (queryError) {
    console.error('getLeadActivities:', queryError)
    return { activities: [], nextOffset: null }
  }

  const rows = (data ?? []) as LeadActivity[]
  const hasMore = rows.length > safePageSize
  return {
    activities: hasMore ? rows.slice(0, safePageSize) : rows,
    nextOffset: hasMore ? safeOffset + safePageSize : null,
  }
}

export type AddLeadNoteState = {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<AddLeadNoteField, string[]>>
}

export async function addLeadNote(_previousState: AddLeadNoteState, formData: FormData): Promise<AddLeadNoteState> {
  const { profile, error } = await requireRoles(CRM_ROLES)
  if (error || !profile) return { error: 'You do not have permission to add a note to this lead.' }

  const parsed = addLeadNoteSchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    note: String(formData.get('note') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: 'Enter a valid note.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { error: insertError } = await (await createClient()).from('lead_activities').insert({
    lead_id: parsed.data.leadId,
    actor_profile_id: profile.id,
    activity_type: 'note_added',
    description: parsed.data.note,
  })

  if (insertError) {
    console.error('addLeadNote:', insertError)
    return { error: 'The note could not be added. Refresh the page and try again.' }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  return { success: true }
}

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export type CreateLeadState = {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<CreateLeadField, string[]>>
}

export async function createLead(_previousState: CreateLeadState, formData: FormData): Promise<CreateLeadState> {
  const { profile, error } = await requireRoles(['sales_manager', 'sales_agent'])
  if (error || !profile) return { error: 'You do not have permission to add leads.' }

  const parsed = createLeadSchema.safeParse({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    companyName: String(formData.get('companyName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    fleetSize: String(formData.get('fleetSize') ?? ''),
    preferredNetwork: String(formData.get('preferredNetwork') ?? ''),
    estimatedMonthlyGallons: String(formData.get('estimatedMonthlyGallons') ?? ''),
    accountType: String(formData.get('accountType') ?? ''),
    source: String(formData.get('source') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: 'Review the highlighted fields and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const lead = parsed.data

  const supabase = await createClient()
  const { error: insertError } = await supabase.from('leads').insert({
    company_name: lead.companyName,
    contact_first_name: lead.firstName,
    contact_last_name: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    fleet_size: lead.fleetSize,
    preferred_network: lead.preferredNetwork,
    estimated_monthly_gallons: lead.estimatedMonthlyGallons,
    account_type: lead.accountType,
    notes: lead.notes,
    source: lead.source,
    created_by_profile_id: profile.id,
    assigned_to_profile_id: profile.role === 'sales_agent' ? profile.id : null,
    sales_manager_profile_id: profile.role === 'sales_manager' ? profile.id : profile.manager_profile_id,
  })

  if (insertError) {
    console.error('createLead:', insertError)
    return { error: 'The lead could not be saved. Please try again.' }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  return { success: true }
}

export type UpdateLeadState = {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<UpdateLeadField, string[]>>
}

export async function updateLead(_previousState: UpdateLeadState, formData: FormData): Promise<UpdateLeadState> {
  const { profile, error } = await requireRoles(CRM_ROLES)
  if (error || !profile) return { error: 'You do not have permission to edit leads.' }

  const parsed = updateLeadSchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    companyName: String(formData.get('companyName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    fleetSize: String(formData.get('fleetSize') ?? ''),
    preferredNetwork: String(formData.get('preferredNetwork') ?? ''),
    estimatedMonthlyGallons: String(formData.get('estimatedMonthlyGallons') ?? ''),
    accountType: String(formData.get('accountType') ?? ''),
    status: String(formData.get('status') ?? ''),
    source: String(formData.get('source') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  })

  if (!parsed.success) {
    return {
      error: 'Review the highlighted fields and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const lead = parsed.data
  const supabase = await createClient()
  const { data, error: updateError } = await supabase
    .from('leads')
    .update({
      company_name: lead.companyName,
      contact_first_name: lead.firstName,
      contact_last_name: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      fleet_size: lead.fleetSize,
      preferred_network: lead.preferredNetwork,
      estimated_monthly_gallons: lead.estimatedMonthlyGallons,
      account_type: lead.accountType,
      status: lead.status,
      source: lead.source,
      notes: lead.notes,
    })
    .eq('id', lead.leadId)
    .select('id')
    .single()

  if (updateError || !data) {
    console.error('updateLead:', updateError)
    return { error: 'The lead could not be updated. Please try again.' }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  revalidatePath('/crm/sales-agents')
  return { success: true }
}

export async function getGeneralManagerDashboard(rangeStart: string, rangeEnd: string) {
  const { error } = await requireRoles(['owner', 'admin', 'general_manager'])
  if (error) return null

  const start = new Date(rangeStart)
  const end = new Date(rangeEnd)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return null

  const supabase = await createClient()
  const [activeCardsResult, activeCustomersResult, transactionResult] = await Promise.all([
    supabase.from('fuel_cards').select('id', { count: 'exact', head: true }).ilike('status', 'active'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).ilike('status', 'active'),
    supabase.rpc('general_manager_transaction_dashboard', {
      p_range_start: rangeStart,
      p_range_end: rangeEnd,
    }),
  ])

  if (activeCardsResult.error || activeCustomersResult.error || transactionResult.error) {
    console.error('getGeneralManagerDashboard:', {
      activeCards: activeCardsResult.error,
      activeCustomers: activeCustomersResult.error,
      transactions: transactionResult.error,
    })
    return null
  }

  const transactionTotals = transactionResult.data as {
    gallons: number
    spending: number
    savings: number
    daily_series: Array<{ date: string; gallons: number; spending: number }>
    spend_by_state: Array<{ state: string; amount: number }>
    top_locations: Array<{ name: string; gallons: number; spending: number }>
    recent_transactions: Array<{
      id: string
      transaction_date: string
      merchant_name: string | null
      merchant_state: string | null
      gallons: number | null
      amount: number
      savings: number
      fuel_card: { card_last4: string | null } | null
    }>
  }

  return {
    active_cards: activeCardsResult.count ?? 0,
    gallons_sold: transactionTotals.gallons,
    active_customers: activeCustomersResult.count ?? 0,
    spending: transactionTotals.spending,
    savings: transactionTotals.savings,
    daily_series: transactionTotals.daily_series,
    spend_by_state: transactionTotals.spend_by_state,
    top_locations: transactionTotals.top_locations,
    recent_transactions: transactionTotals.recent_transactions,
  }
}

export async function getSalesManagerDashboard(rangeStart?: string, rangeEnd?: string) {
  const { error } = await requireRoles(['sales_manager'])
  if (error) return null

  const supabase = await createClient()
  const { data, error: queryError } = await supabase.rpc('sales_manager_dashboard', {
    range_start: rangeStart,
    range_end: rangeEnd,
  })
  if (queryError) {
    console.error('getSalesManagerDashboard:', queryError)
    return null
  }

  return data?.[0] ?? null
}

export type SalesAgentDashboardSummary = {
  total_leads: number
  new_leads: number
  in_process_leads: number
  follow_up_leads: number
  successful_leads: number
  deal_lost_leads: number
  estimated_monthly_gallons: number
}

export async function getSalesAgentDashboard(): Promise<SalesAgentDashboardSummary | null> {
  const { error } = await requireRoles(['sales_agent'])
  if (error) return null

  const { data, error: queryError } = await (await createClient()).rpc('sales_agent_dashboard')
  if (queryError) {
    console.error('getSalesAgentDashboard:', queryError)
    return null
  }

  return data?.[0] ?? null
}

export type SalesManagerAgentPerformance = {
  profile_id: string | null
  total_leads: number
  accepted_leads: number
  successful_leads: number
  estimated_monthly_gallons: number
  last_activity: string | null
}

export async function getSalesManagerAgentPerformance(
  rangeStart: string,
  rangeEnd: string,
): Promise<SalesManagerAgentPerformance[] | null> {
  const { error } = await requireRoles(['sales_manager'])
  if (error) return null

  const { data, error: queryError } = await (await createClient()).rpc('sales_manager_agent_performance', {
    range_start: rangeStart,
    range_end: rangeEnd,
  })
  if (queryError) {
    console.error('getSalesManagerAgentPerformance:', queryError)
    return null
  }

  return data ?? []
}
