'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireRoles } from '@/lib/supabase/server'
import { assignSalesAgentToManagerSchema } from '@/lib/validation/sales-agents'
import type { Profile } from '@/types/database.types'

export type AssignableSalesAgent = Pick<Profile, 'id' | 'full_name' | 'email' | 'department'>

export async function getAvailableSalesAgents(): Promise<AssignableSalesAgent[]> {
  const { error } = await requireRoles(['sales_manager'])
  if (error) return []

  const { data, error: queryError } = await (await createClient())
    .rpc('available_sales_agents_for_current_manager')

  if (queryError) {
    console.error('getAvailableSalesAgents:', queryError)
    return []
  }

  return (data ?? []) as unknown as AssignableSalesAgent[]
}

export async function assignSalesAgentToCurrentManager(input: unknown) {
  const { error } = await requireRoles(['sales_manager'])
  if (error) return { ok: false as const, message: 'You do not have permission to manage sales agents.' }

  const parsed = assignSalesAgentToManagerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Select a valid sales agent.' }

  const { error: assignmentError } = await (await createClient()).rpc(
    'assign_sales_agent_to_current_manager',
    { agent_profile_id: parsed.data.agentProfileId },
  )

  if (assignmentError) {
    console.error('assignSalesAgentToCurrentManager:', assignmentError)
    return {
      ok: false as const,
      message: 'That sales agent is no longer available. Refresh the page and try again.',
    }
  }

  revalidatePath('/crm/sales-agents')
  revalidatePath('/crm/leads')
  revalidatePath('/crm/dashboard')
  return { ok: true as const, message: 'Sales agent added to your team.' }
}

