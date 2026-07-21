import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Profile, SalesRole, UserRole } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  )
}

/**
 * Reusable server-side check for administrative privileges.
 * Validates the session and ensures the user's profile role is 'admin'.
 */
export async function requireAdmin() {
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    console.error('requireAdmin: No authenticated user session found.', authError)
    return { error: 'Unauthorized: No active session.', user: null }
  }

  const user = authData.user
  // console.log('--- DEBUG: requireAdmin ---')
  // console.log('1. Auth User ID:', user.id)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  // console.log('2. Profile Error:', profileError)
  // console.log('3. Profile Row:', profile)

  const isAdminResult = ['owner', 'admin', 'general_manager'].includes(profile?.role ?? '')
  // console.log('4. is_admin Result:', isAdminResult)
  // console.log('---------------------------')

  if (profileError || !isAdminResult) {
    console.error(`requireAdmin: Role does not have full CRM access. Found role: ${profile?.role}`)
    return { error: 'Forbidden: Full CRM access required.', user: null }
  }

  return { error: null, user }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .single()

  if (error) {
    console.error('getCurrentProfile:', error)
    return null
  }

  return data as Profile
}

export async function requireRoles(roles: readonly UserRole[]) {
  const profile = await getCurrentProfile()

  if (!profile) return { error: 'Unauthorized', profile: null }
  if (!roles.includes(profile.role)) return { error: 'Forbidden', profile: null }

  return { error: null, profile }
}

export const CRM_ROLES: readonly SalesRole[] = [
  'owner',
  'admin',
  'general_manager',
  'sales_manager',
  'sales_representative',
]
