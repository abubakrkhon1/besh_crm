import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const isAdminResult = profile?.role === 'admin'
  // console.log('4. is_admin Result:', isAdminResult)
  // console.log('---------------------------')

  if (profileError || !isAdminResult) {
    console.error(`requireAdmin: Role is not admin. Found role: ${profile?.role}`)
    return { error: 'Forbidden: Access denied. Administrator privileges required.', user: null }
  }

  return { error: null, user }
}
