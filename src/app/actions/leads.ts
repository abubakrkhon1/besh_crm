'use server'

import { revalidatePath } from 'next/cache'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'
import { Lead, Profile } from '@/types/database.types'

export type LeadWithRepresentative = Lead & {
  representative?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export async function getLeads(representativeId?: string): Promise<LeadWithRepresentative[]> {
  const { error } = await requireRoles(CRM_ROLES)
  if (error) return []

  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('*, representative:profiles!leads_assigned_to_profile_id_fkey(id, full_name, email)')
    .order('created_at', { ascending: false })

  if (representativeId) query = query.eq('assigned_to_profile_id', representativeId)

  const { data, error: queryError } = await query
  if (queryError) {
    console.error('getLeads:', queryError)
    return []
  }

  return data as unknown as LeadWithRepresentative[]
}

export async function getSalesRepresentatives(): Promise<Profile[]> {
  const { error } = await requireRoles(['owner', 'admin', 'general_manager', 'sales_manager'])
  if (error) return []

  const supabase = await createClient()
  const { data, error: queryError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'sales_representative')
    .eq('is_active', true)
    .order('full_name')

  if (queryError) {
    console.error('getSalesRepresentatives:', queryError)
    return []
  }

  return data as Profile[]
}

export type CreateLeadState = { error?: string; success?: boolean }

export async function createLead(_previousState: CreateLeadState, formData: FormData): Promise<CreateLeadState> {
  const { profile, error } = await requireRoles(['sales_manager', 'sales_representative'])
  if (error || !profile) return { error: 'You do not have permission to add leads.' }

  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()

  if (!firstName || !lastName) return { error: 'Enter the lead’s first and last name.' }
  if (!email && !phone) return { error: 'Enter an email address or phone number.' }

  const supabase = await createClient()
  const { error: insertError } = await supabase.from('leads').insert({
    company_name: String(formData.get('companyName') ?? '').trim() || null,
    contact_first_name: firstName,
    contact_last_name: lastName,
    email: email || null,
    phone: phone || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
    source: 'manual',
    created_by_profile_id: profile.id,
    assigned_to_profile_id: profile.role === 'sales_representative' ? profile.id : null,
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

export async function getGeneralManagerDashboard() {
  const { error } = await requireRoles(['owner', 'admin', 'general_manager'])
  if (error) return null

  const supabase = await createClient()
  const { data, error: queryError } = await supabase.rpc('general_manager_dashboard')
  if (queryError) {
    console.error('getGeneralManagerDashboard:', queryError)
    return null
  }

  return data?.[0] ?? null
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
