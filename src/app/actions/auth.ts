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

  // Drivers use Besh Mobile. Staff and customer administrators use this web app.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,customer_id')
    .eq('auth_user_id', data.user.id)
    .eq('is_active', true)
    .single()

  const crmRoles = ['owner', 'admin', 'general_manager', 'sales_manager', 'sales_agent']
  const isCustomerAdmin = profile?.role === 'customer_admin' && Boolean(profile.customer_id)
  if (profileError || !profile || (!crmRoles.includes(profile.role) && !isCustomerAdmin)) {
    await supabase.auth.signOut()
    console.warn('Login denied for an account without an active web role.')
    return { error: 'Access denied. This account does not have BESH web access.' }
  }

  revalidatePath('/', 'layout')
  redirect(isCustomerAdmin ? '/portal/dashboard' : '/crm/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
