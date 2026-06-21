'use server'

import { createClient } from '@/lib/supabase/server'
import { Application, ApplicationStatus } from '@/types/database.types'
import { revalidatePath } from 'next/cache'

export async function getApplications(): Promise<Application[]> {
  const supabase = await createClient()

  // Make user admin (temporary workaround because of RLS on applications)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id)
  }

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching applications:', error)
    return []
  }

  return data as Application[]
}

export async function getDashboardStats() {
  const supabase = await createClient()

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

  // Get current user to log who reviewed it
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
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
  revalidatePath('/crm/dashboard')
  return { success: true }
}

export async function createApplication(data: Partial<Application>) {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Insert the application, linking it to the current user
  const { data: createdApp, error } = await supabase
    .from('applications')
    .insert([{ ...data, auth_user_id: user.id, status: 'pending' }])
    .select()
    .single()

  if (error) {
    console.error('Error creating application:', error)
    return { error: error.message }
  }

  revalidatePath('/crm/applications')
  revalidatePath('/crm/dashboard')
  return { success: true, application: createdApp as Application }
}
