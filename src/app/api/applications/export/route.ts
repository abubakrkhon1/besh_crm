import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/supabase/server'
import { createCsv } from '@/lib/csv'
import type { ApplicationStatus } from '@/types/database.types'

const APPLICATION_ROLES = ['owner', 'admin', 'general_manager', 'sales_manager'] as const
const EXPORT_BATCH_SIZE = 1_000
const EXPORT_COLUMNS = 'id,company_legal_name,doing_business_as,first_name,last_name,email,business_phone,total_trucks,total_drivers,industry,account_type,projected_spend,status,submitted_at,created_at'

type ExportApplication = {
  id: string
  company_legal_name: string
  doing_business_as: string | null
  first_name: string
  last_name: string
  email: string
  business_phone: string
  total_trucks: number
  total_drivers: number
  industry: string
  account_type: string
  projected_spend: number
  status: ApplicationStatus
  submitted_at: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) {
    return NextResponse.json({ error: 'Application review access is required.' }, {
      status: accessError === 'Unauthorized' ? 401 : 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const params = request.nextUrl.searchParams
  const encoder = new TextEncoder()
  const admin = createAdminClient()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${createCsv([[
        'Company', 'DBA', 'Contact', 'Email', 'Phone', 'Trucks', 'Drivers', 'Industry',
        'Account Type', 'Projected Spend', 'Status', 'Submitted',
      ]])}\n`))

      let cursorDate: string | null = null
      let cursorId: string | null = null
      while (true) {
        let query: any = admin
          .from('applications')
          .select(EXPORT_COLUMNS)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
        query = applyFilters(query, params)
        if (cursorDate && cursorId) query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`)

        const { data, error } = await query.limit(EXPORT_BATCH_SIZE)
        if (error) {
          console.error('application export:', error)
          controller.error(new Error('Applications could not be exported.'))
          return
        }

        const applications = (data ?? []) as ExportApplication[]
        if (!applications.length) break
        controller.enqueue(encoder.encode(`${createCsv(applications.map((application) => [
          application.company_legal_name,
          application.doing_business_as ?? '',
          `${application.first_name} ${application.last_name}`.trim(),
          application.email,
          application.business_phone,
          application.total_trucks,
          application.total_drivers,
          application.industry,
          label(application.account_type),
          application.projected_spend,
          label(application.status),
          application.submitted_at ?? application.created_at,
        ]))}\n`))
        const last = applications.at(-1)!
        cursorDate = last.created_at
        cursorId = last.id
        if (applications.length < EXPORT_BATCH_SIZE) break
      }

      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}

function applyFilters(query: any, params: URLSearchParams) {
  const status = validValue(params.get('status'), ['pending', 'under_review', 'needs_documents', 'approved', 'denied'] as const)
  const dateFilter = validValue(params.get('date'), ['this_month', 'last_30_days'] as const)
  const search = sanitizeSearch(params.get('q'))
  if (status) query = query.eq('status', status)
  const rangeStart = dateRangeStart(dateFilter)
  if (rangeStart) query = query.gte('created_at', rangeStart)
  if (search) {
    const pattern = `%${search}%`
    query = query.or(`company_legal_name.ilike.${pattern},doing_business_as.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
  }
  return query
}

function dateRangeStart(filter: 'this_month' | 'last_30_days' | null) {
  if (!filter) return null
  const now = new Date()
  if (filter === 'this_month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString()
}

function sanitizeSearch(value: string | null) {
  return value?.trim().replace(/[^\p{L}\p{N}@+\-\s]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100) || null
}

function validValue<const T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? value as T : null
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
