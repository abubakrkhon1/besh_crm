import { NextRequest, NextResponse } from 'next/server'
import { createCsv } from '@/lib/csv'
import { createClient, CRM_ROLES, requireRoles } from '@/lib/supabase/server'

const EXPORT_BATCH_SIZE = 1_000

type ExportTransaction = {
  id: string; provider_transaction_id: string | null; transaction_date: string; status: string
  merchant_name: string | null; merchant_address: string | null; merchant_state: string | null
  gallons: number | null; amount: number; savings: number; provider_transaction_type: string | null
  customers?: unknown; fuel_cards?: unknown; drivers?: unknown
  customer_company_name?: string | null; customer_contact_name?: string | null
  card_last4?: string | null; card_driver_name?: string | null
  driver_first_name?: string | null; driver_last_name?: string | null
}

type ExportFilters = {
  rangeStart: string; rangeEnd: string; status: string | null; customer: string | null
  card: string | null; fuelType: string | null; search: string | null
}

export async function GET(request: NextRequest) {
  const { error: accessError } = await requireRoles(CRM_ROLES)
  if (accessError) {
    return NextResponse.json({ error: 'CRM access is required.' }, {
      status: accessError === 'Unauthorized' ? 401 : 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const filters = parseFilters(request.nextUrl.searchParams)
  const encoder = new TextEncoder()
  const db = await createClient()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${createCsv([[
        'Date / Time', 'Customer', 'Card', 'Driver', 'Merchant', 'Location',
        'Fuel Type', 'Gallons', 'Amount', 'Savings', 'Status', 'WEX ID',
      ]])}\n`))

      let cursorDate: string | null = null
      let cursorId: string | null = null
      while (true) {
        const result = filters.search
          ? await db.rpc('export_fuel_transaction_search_page', {
              p_query: filters.search, p_provider: 'wex_efs',
              p_range_start: filters.rangeStart, p_range_end: filters.rangeEnd,
              p_status: filters.status, p_customer_id: filters.customer,
              p_card_id: filters.card, p_fuel_type: filters.fuelType,
              p_cursor_date: cursorDate, p_cursor_id: cursorId, p_limit: EXPORT_BATCH_SIZE,
            })
          : await buildDirectQuery(db, filters, cursorDate, cursorId)

        if (result.error) {
          console.error('transaction export:', result.error)
          controller.error(new Error('Transactions could not be exported.'))
          return
        }

        const transactions = (result.data ?? []) as ExportTransaction[]
        if (!transactions.length) break
        controller.enqueue(encoder.encode(`${createCsv(transactions.map(toCsvRow))}\n`))
        const last = transactions.at(-1)!
        cursorDate = last.transaction_date
        cursorId = last.id
        if (transactions.length < EXPORT_BATCH_SIZE) break
      }
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${filters.rangeStart.slice(0, 10)}-to-${new Date(Date.parse(filters.rangeEnd) - 1).toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}

function buildDirectQuery(db: Awaited<ReturnType<typeof createClient>>, filters: ExportFilters, cursorDate: string | null, cursorId: string | null) {
  let query: any = db.from('fuel_transactions')
    .select('id,provider_transaction_id,transaction_date,status,merchant_name,merchant_address,merchant_state,gallons,amount,savings,provider_transaction_type,customers(company_name,contact_name),fuel_cards(card_last4,driver_name),drivers(first_name,last_name)')
    .eq('provider', 'wex_efs').gte('transaction_date', filters.rangeStart).lt('transaction_date', filters.rangeEnd)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.customer) query = query.eq('customer_id', filters.customer)
  if (filters.card) query = query.eq('fuel_card_id', filters.card)
  if (filters.fuelType) query = query.eq('provider_transaction_type', filters.fuelType)
  if (cursorDate && cursorId) query = query.or(`transaction_date.lt.${cursorDate},and(transaction_date.eq.${cursorDate},id.lt.${cursorId})`)
  return query.order('transaction_date', { ascending: false }).order('id', { ascending: false }).limit(EXPORT_BATCH_SIZE)
}

function toCsvRow(transaction: ExportTransaction) {
  const customer = oneRelation(transaction.customers)
  const card = oneRelation(transaction.fuel_cards)
  const driver = oneRelation(transaction.drivers)
  const companyName = transaction.customer_company_name ?? customer?.company_name
  const contactName = transaction.customer_contact_name ?? customer?.contact_name
  const cardLast4 = transaction.card_last4 ?? card?.card_last4
  const cardDriver = transaction.card_driver_name ?? card?.driver_name
  const driverName = cardDriver ?? [transaction.driver_first_name ?? driver?.first_name, transaction.driver_last_name ?? driver?.last_name].filter(Boolean).join(' ')
  return [transaction.transaction_date, companyName ?? contactName ?? '', cardLast4 ? `•••• ${cardLast4}` : '', driverName ?? '',
    transaction.merchant_name ?? '', [transaction.merchant_address, transaction.merchant_state].filter(Boolean).join(', '),
    transaction.provider_transaction_type ?? '', transaction.gallons ?? '', transaction.amount, transaction.savings,
    transaction.status, transaction.provider_transaction_id ?? '']
}

function parseFilters(params: URLSearchParams): ExportFilters {
  const now = new Date()
  const from = validDate(params.get('from')) ? params.get('from')! : formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  const to = validDate(params.get('to')) ? params.get('to')! : formatDateInput(now)
  const rangeEnd = new Date(`${to}T00:00:00`)
  rangeEnd.setDate(rangeEnd.getDate() + 1)
  return {
    rangeStart: new Date(`${from}T00:00:00`).toISOString(), rangeEnd: rangeEnd.toISOString(),
    status: params.get('status')?.trim().slice(0, 30) || null,
    customer: validUuid(params.get('customer')) ? params.get('customer') : null,
    card: validUuid(params.get('card')) ? params.get('card') : null,
    fuelType: params.get('fuelType')?.trim().slice(0, 50) || null,
    search: params.get('q')?.trim().slice(0, 100).replace(/[%(),_]/g, '') || null,
  }
}

function oneRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function validUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`)))
}

function formatDateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}
