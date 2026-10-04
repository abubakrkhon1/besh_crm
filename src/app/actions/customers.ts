'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { updateCustomerSchema, type UpdateCustomerField } from '@/lib/validation/customers'

export type UpdateCustomerResult = {
  ok: boolean
  message: string
  fieldErrors?: Partial<Record<UpdateCustomerField, string[]>>
}

export async function updateCustomer(input: unknown): Promise<UpdateCustomerResult> {
  const parsed = updateCustomerSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Review the highlighted customer fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { error: accessError } = await requireAdmin()
  if (accessError) return { ok: false, message: 'Owner, administrator, or general manager access is required.' }

  const db = await createClient()
  const values = parsed.data
  const { data, error } = await db.from('customers').update({
    company_name: values.companyName,
    contact_name: values.contactName,
    email: values.email,
    phone: values.phone,
    status: values.status,
    credit_limit: values.creditLimit,
    notes: values.notes,
    closed_at: values.status === 'closed' ? new Date().toISOString() : null,
  }).eq('id', values.customerId).select('id').maybeSingle()

  if (error || !data) {
    console.error('Customer update failed.', { customerId: values.customerId, code: error?.code })
    return { ok: false, message: 'The customer could not be updated.' }
  }

  revalidatePath('/crm/customers')
  revalidatePath(`/crm/customers/${values.customerId}`)
  revalidatePath('/portal/dashboard')
  return { ok: true, message: 'Customer updated.' }
}
