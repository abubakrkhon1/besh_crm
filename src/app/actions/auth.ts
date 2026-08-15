'use server'

import { createClient } from '@/lib/supabase/server'
import { getLoginFieldErrors, loginSchema, type LoginResult } from '@/lib/validation/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function login(formData: FormData): Promise<LoginResult> {
  const parsedCredentials = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsedCredentials.success) {
    return { fieldErrors: getLoginFieldErrors(parsedCredentials.error) }
  }

  const { email, password } = parsedCredentials.data
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: 'Invalid email or password.' }
  }

  // Drivers use Besh Mobile. Only CRM roles may enter this application.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', data.user.id)
    .eq('is_active', true)
    .single()

  const crmRoles = ['owner', 'admin', 'general_manager', 'sales_manager', 'sales_agent']
  if (profileError || !profile || !crmRoles.includes(profile.role)) {
    await supabase.auth.signOut()
    console.warn('Login denied for an account without an active CRM role.')
    return { error: 'Access denied. This account does not have Fuel CRM access.' }
  }

  revalidatePath('/', 'layout')
  redirect('/crm/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
