import 'server-only'

import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const APPLICATION_PORTAL_COOKIE = 'besh_application_portal'

export function hashPortalToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function getApplicationPortalSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(APPLICATION_PORTAL_COOKIE)?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data } = await admin.from('application_portal_sessions')
    .select('id, application_id, expires_at')
    .eq('session_token_hash', hashPortalToken(token))
    .gt('expires_at', now)
    .is('revoked_at', null)
    .maybeSingle()

  if (!data) return null
  await admin.from('application_portal_sessions').update({ last_accessed_at: now }).eq('id', data.id)
  return data
}
