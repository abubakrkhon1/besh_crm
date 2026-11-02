import { NextRequest, NextResponse } from 'next/server'
import { createCsv } from '@/lib/csv'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'
import type { Lead } from '@/types/database.types'

const EXPORT_BATCH_SIZE = 1_000
const OPEN_STATUSES = ['new', 'on_the_process', 'follow_up']

type ExportLead = Lead & {
  id: string
  representative: { full_name: string | null; email: string | null } | null
}

export async function GET(request: NextRequest) {
  const { error: accessError } = await requireRoles(CRM_ROLES)
  if (accessError) {
    return NextResponse.json({ error: 'CRM access is required.' }, {
      status: accessError === 'Unauthorized' ? 401 : 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const params = request.nextUrl.searchParams
  const encoder = new TextEncoder()
  const db = await createClient()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${createCsv([[
        'Company', 'Contact', 'Email', 'Phone', 'Fleet', 'Account Type', 'Source', 'Priority',
        'Status', 'Sales Agent', 'Next Follow-up', 'Received', 'Estimated Gallons',
      ]])}\n`))

      let cursorDate: string | null = null
      let cursorId: string | null = null
      while (true) {
        let query: any = db
          .from('leads')
          .select('id,company_name,contact_first_name,contact_last_name,email,phone,fleet_size,account_type,source,priority,status,next_follow_up_at,created_at,estimated_monthly_gallons,representative:profiles!leads_assigned_to_profile_id_fkey(full_name,email)')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })

        query = applyFilters(query, params)
        if (cursorDate && cursorId) query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`)
        const { data, error } = await query.limit(EXPORT_BATCH_SIZE)
        if (error) {
          console.error('lead export:', error)
          controller.error(new Error('Leads could not be exported.'))
          return
        }

        const leads = (data ?? []) as unknown as ExportLead[]
        if (!leads.length) break
        const rows = leads.map((lead) => [
          lead.company_name ?? '',
          `${lead.contact_first_name} ${lead.contact_last_name}`.trim(),
          lead.email ?? '',
          lead.phone ?? '',
          lead.fleet_size ?? '',
          formatLabel(lead.account_type),
          formatLabel(lead.source),
          formatLabel(lead.priority),
          formatLabel(lead.status),
          lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned',
          lead.next_follow_up_at ?? '',
          lead.created_at,
          lead.estimated_monthly_gallons ?? '',
        ])
        controller.enqueue(encoder.encode(`${createCsv(rows)}\n`))
        const last = leads.at(-1)!
        cursorDate = last.created_at
        cursorId = last.id
        if (leads.length < EXPORT_BATCH_SIZE) break
      }

      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}

function applyFilters(query: any, params: URLSearchParams) {
  const representativeId = validUuid(params.get('rep')) ? params.get('rep') : null
  const from = validDate(params.get('from')) ? `${params.get('from')}T00:00:00.000Z` : null
  const toDate = validDate(params.get('to')) ? new Date(`${params.get('to')}T00:00:00.000Z`) : null
  if (toDate) toDate.setUTCDate(toDate.getUTCDate() + 1)
  const status = validValue(params.get('status'), ['new', 'on_the_process', 'follow_up', 'successful', 'deal_lost'])
  const accountType = validValue(params.get('accountType'), ['prepaid_account', 'deposit', 'credit_line'])
  const source = params.get('source')?.slice(0, 100)
  const search = sanitizeSearch(params.get('q'))
  const followUp = validValue(params.get('followUp'), ['overdue', 'today', 'upcoming', 'unscheduled'])

  if (representativeId) query = query.eq('assigned_to_profile_id', representativeId)
  if (from) query = query.gte('created_at', from)
  if (toDate) query = query.lt('created_at', toDate.toISOString())
  if (status) query = query.eq('status', status)
  if (accountType) query = query.eq('account_type', accountType)
  if (source) query = query.eq('source', source)
  if (search) {
    const pattern = `%${search}%`
    query = query.or(`company_name.ilike.${pattern},contact_first_name.ilike.${pattern},contact_last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
  }
  if (followUp) {
    const { now, nextDayStart } = followUpBoundaries(Number(params.get('tz')))
    query = query.in('status', OPEN_STATUSES)
    if (followUp === 'unscheduled') query = query.is('next_follow_up_at', null)
    if (followUp === 'overdue') query = query.lt('next_follow_up_at', now)
    if (followUp === 'today') query = query.gte('next_follow_up_at', now).lt('next_follow_up_at', nextDayStart)
    if (followUp === 'upcoming') query = query.gte('next_follow_up_at', nextDayStart)
  }
  return query
}

function followUpBoundaries(offset: number) {
  const now = new Date()
  const safeOffset = Number.isInteger(offset) ? Math.min(840, Math.max(-840, offset)) : 0
  const localNow = new Date(now.getTime() - safeOffset * 60_000)
  const nextLocalDay = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1)
  return { now: now.toISOString(), nextDayStart: new Date(nextLocalDay + safeOffset * 60_000).toISOString() }
}

function sanitizeSearch(value: string | null) {
  return value?.trim().replace(/[^\p{L}\p{N}@+\-\s]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100) || null
}

function validValue<const T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? value as T : null
}

function validUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value)
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
