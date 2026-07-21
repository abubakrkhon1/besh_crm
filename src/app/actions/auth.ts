'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: error?.message || 'Login failed' }
  }

  // Drivers use Besh Mobile. Only CRM roles may enter this application.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', data.user.id)
    .single()

  const crmRoles = ['owner', 'admin', 'general_manager', 'sales_manager', 'sales_representative']
  if (profileError || !profile || !crmRoles.includes(profile.role)) {
    await supabase.auth.signOut()
    console.error('Login denied. Profile error:', profileError, 'Role:', profile?.role)
    return { error: 'Access denied. This account does not have Fuel CRM access.' }
  }

  revalidatePath('/', 'layout')
  redirect('/crm/dashboard')
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createClient()

  // For this CRM, we allow signup but default to 'admin' using the same
  // trigger structure, or we can just let Supabase auth handle it.
  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
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
