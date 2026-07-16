import 'server-only'

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Server database configuration is incomplete.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
