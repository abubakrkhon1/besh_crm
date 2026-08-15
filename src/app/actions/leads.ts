'use server'

import { revalidatePath } from 'next/cache'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'
import {
  createLeadSchema,
  CreateLeadField,
  updateLeadSchema,
  UpdateLeadField,
} from '@/lib/validation/leads'
import { Lead, Profile } from '@/types/database.types'

export type LeadWithRepresentative = Lead & {
  representative?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export async function getLeads(
  representativeId?: string,
  rangeStart?: string,
  rangeEnd?: string,
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

  const { data, error: queryError } = await query
  if (queryError) {
    console.error('getLeads:', queryError)
    return []
  }

  return data as unknown as LeadWithRepresentative[]
}

export async function getSalesAgents(): Promise<Profile[]> {
  const { error } = await requireRoles(['owner', 'admin', 'general_manager', 'sales_manager'])
  if (error) return []

  const supabase = await createClient()
  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'sales_agent')
    .eq('is_active', true)
    .order('full_name')

  if (queryError) {
    console.error('getSalesAgents:', queryError)
    return []
  }

  return data as Profile[]
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
  const [activeCardsResult, activeCustomersResult, transactionTotals] = await Promise.all([
    supabase.from('fuel_cards').select('id', { count: 'exact', head: true }).ilike('status', 'active'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).ilike('status', 'active'),
    getDashboardTransactionTotals(supabase, rangeStart, rangeEnd),
  ])

  if (activeCardsResult.error || activeCustomersResult.error || transactionTotals.error) {
    console.error('getGeneralManagerDashboard:', {
      activeCards: activeCardsResult.error,
      activeCustomers: activeCustomersResult.error,
      transactions: transactionTotals.error,
    })
    return null
  }

  return {
    active_cards: activeCardsResult.count ?? 0,
    gallons_sold: transactionTotals.gallons,
    active_customers: activeCustomersResult.count ?? 0,
    spending: transactionTotals.spending,
    savings: transactionTotals.savings,
    daily_series: transactionTotals.dailySeries,
    spend_by_state: transactionTotals.spendByState,
    top_locations: transactionTotals.topLocations,
    recent_transactions: transactionTotals.recentTransactions,
  }
}

async function getDashboardTransactionTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rangeStart: string,
  rangeEnd: string,
) {
  const pageSize = 1_000
  let offset = 0
  let gallons = 0
  let spending = 0
  let savings = 0
  const dailyTotals = new Map<string, { gallons: number; spending: number }>()
  const stateTotals = new Map<string, number>()
  const locationTotals = new Map<string, { gallons: number; spending: number }>()
  const recentTransactions: Array<{
    id: string
    transaction_date: string
    merchant_name: string | null
    merchant_state: string | null
    fuel_card_id: string | null
    gallons: number | null
    amount: number
    savings: number
  }> = []

  while (true) {
    const { data, error } = await supabase
      .from('fuel_transactions')
      .select('id,fuel_card_id,gallons,amount,savings,transaction_date,merchant_name,merchant_state')
      .eq('status', 'posted')
      .gte('transaction_date', rangeStart)
      .lt('transaction_date', rangeEnd)
      .order('transaction_date')
      .order('id')
      .range(offset, offset + pageSize - 1)

    if (error) {
      return {
        gallons: 0,
        spending: 0,
        savings: 0,
        dailySeries: [],
        spendByState: [],
        topLocations: [],
        recentTransactions: [],
        error,
      }
    }

    for (const transaction of data ?? []) {
      const transactionGallons = Number(transaction.gallons ?? 0)
      const transactionSpending = Number(transaction.amount ?? 0)
      const transactionSavings = Number(transaction.savings ?? 0)
      const day = transaction.transaction_date.slice(0, 10)
      const state = transaction.merchant_state?.trim().toUpperCase() || 'Other'
      const location = transaction.merchant_name?.trim() || 'Unknown location'

      gallons += transactionGallons
      spending += transactionSpending
      savings += transactionSavings

      const daily = dailyTotals.get(day) ?? { gallons: 0, spending: 0 }
      daily.gallons += transactionGallons
      daily.spending += transactionSpending
      dailyTotals.set(day, daily)

      stateTotals.set(state, (stateTotals.get(state) ?? 0) + transactionSpending)

      const locationTotal = locationTotals.get(location) ?? { gallons: 0, spending: 0 }
      locationTotal.gallons += transactionGallons
      locationTotal.spending += transactionSpending
      locationTotals.set(location, locationTotal)

      recentTransactions.push({
        id: transaction.id,
        transaction_date: transaction.transaction_date,
        merchant_name: transaction.merchant_name,
        merchant_state: transaction.merchant_state,
        fuel_card_id: transaction.fuel_card_id,
        gallons: transaction.gallons,
        amount: transaction.amount,
        savings: transaction.savings,
      })
      if (recentTransactions.length > 5) recentTransactions.shift()
    }

    if ((data?.length ?? 0) < pageSize) break
    offset += pageSize
  }

  const dailySeries = [...dailyTotals.entries()].map(([date, totals]) => ({ date, ...totals }))
  const spendByState = [...stateTotals.entries()]
    .map(([state, amount]) => ({ state, amount }))
    .sort((a, b) => b.amount - a.amount)
  const topLocations = [...locationTotals.entries()]
    .map(([name, totals]) => ({ name, ...totals }))
    .sort((a, b) => b.gallons - a.gallons)
    .slice(0, 5)
  const orderedRecentTransactions = recentTransactions.reverse()
  const recentFuelCardIds = [...new Set(
    orderedRecentTransactions
      .map((transaction) => transaction.fuel_card_id)
      .filter((fuelCardId): fuelCardId is string => Boolean(fuelCardId)),
  )]
  const { data: recentFuelCards, error: recentFuelCardsError } = recentFuelCardIds.length
    ? await supabase.from('fuel_cards').select('id,card_last4').in('id', recentFuelCardIds)
    : { data: [], error: null }

  if (recentFuelCardsError) console.error('getDashboardTransactionTotals fuel cards:', recentFuelCardsError)

  const fuelCardsById = new Map(
    (recentFuelCards ?? []).map((fuelCard) => [fuelCard.id, { card_last4: fuelCard.card_last4 }]),
  )
  const recentTransactionsWithCards = orderedRecentTransactions.map(({ fuel_card_id, ...transaction }) => ({
    ...transaction,
    fuel_card: fuel_card_id ? fuelCardsById.get(fuel_card_id) ?? null : null,
  }))

  return {
    gallons,
    spending,
    savings,
    dailySeries,
    spendByState,
    topLocations,
    recentTransactions: recentTransactionsWithCards,
    error: null,
  }
}

export async function getSalesManagerDashboard() {
  const { error } = await requireRoles(['sales_manager'])
  if (error) return null

  const supabase = await createClient()
  const { data, error: queryError } = await supabase.rpc('sales_manager_dashboard')
  if (queryError) {
    console.error('getSalesManagerDashboard:', queryError)
    return null
  }

  return data?.[0] ?? null
}
