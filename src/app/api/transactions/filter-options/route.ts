import { NextRequest, NextResponse } from 'next/server'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { error: accessError } = await requireRoles(CRM_ROLES)
  if (accessError) {
    return NextResponse.json({ error: 'CRM access is required.' }, {
      status: accessError === 'Unauthorized' ? 401 : 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const type = request.nextUrl.searchParams.get('type')
  if (type !== 'customer' && type !== 'card') {
    return NextResponse.json({ error: 'Unsupported lookup type.' }, { status: 400 })
  }
  const search = sanitizeSearch(request.nextUrl.searchParams.get('q'))
  const db = await createClient()

  if (type === 'customer') {
    let query = db.from('customers').select('id,company_name,contact_name').order('company_name').limit(25)
    if (search) query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Customer options are unavailable.' }, { status: 500 })
    return NextResponse.json({ options: (data ?? []).map((item) => ({
      value: item.id,
      label: item.company_name ?? item.contact_name ?? 'Unnamed customer',
    })) }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  }

  let query = db.from('fuel_cards').select('id,card_last4,driver_name').eq('provider', 'wex_efs').order('card_last4').limit(25)
  if (search) query = query.or(`card_last4.ilike.%${search}%,driver_name.ilike.%${search}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Card options are unavailable.' }, { status: 500 })
  return NextResponse.json({ options: (data ?? []).map((item) => ({
    value: item.id,
    label: `•••• ${item.card_last4}${item.driver_name ? ` · ${item.driver_name}` : ''}`,
  })) }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

function sanitizeSearch(value: string | null) {
  return value?.trim().replace(/[^\p{L}\p{N}@+\-\s]/gu, ' ').replace(/\s+/g, ' ').slice(0, 80) || null
}
