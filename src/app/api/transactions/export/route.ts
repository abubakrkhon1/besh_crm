import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ExportTransaction = {
  provider_transaction_id: string | null
  transaction_date: string
  status: string
  merchant_name: string | null
  merchant_address: string | null
  merchant_state: string | null
  gallons: number | null
  amount: number
  savings: number
  provider_transaction_type: string | null
  customers: unknown
  fuel_cards: unknown
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const from = validDate(params.get('from')) ? params.get('from')! : formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const to = validDate(params.get('to')) ? params.get('to')! : formatDateInput(new Date())
  const rangeStart = new Date(`${from}T00:00:00`).toISOString()
  const rangeEndDate = new Date(`${to}T00:00:00`)
  rangeEndDate.setDate(rangeEndDate.getDate() + 1)
  const db = await createClient()
  let query: any = db
    .from('fuel_transactions')
    .select('provider_transaction_id,transaction_date,status,merchant_name,merchant_address,merchant_state,gallons,amount,savings,provider_transaction_type,customers(company_name,contact_name),fuel_cards(card_last4,driver_name)')
    .eq('provider', 'wex_efs')
    .gte('transaction_date', rangeStart)
    .lt('transaction_date', rangeEndDate.toISOString())

  const status = params.get('status')
  const customer = validUuid(params.get('customer')) ? params.get('customer') : null
  const card = validUuid(params.get('card')) ? params.get('card') : null
  const fuelType = params.get('fuelType')?.trim()
  const search = params.get('q')?.trim().replace(/[%(),]/g, '')
  if (status) query = query.eq('status', status)
  if (customer) query = query.eq('customer_id', customer)
  if (card) query = query.eq('fuel_card_id', card)
  if (fuelType) query = query.eq('provider_transaction_type', fuelType)
  if (search) query = query.or(`provider_transaction_id.ilike.%${search}%,merchant_name.ilike.%${search}%,merchant_state.ilike.%${search}%`)

  const { data, error } = await query.order('transaction_date', { ascending: false }).range(0, 9_999)
  if (error) return NextResponse.json({ error: 'Transactions could not be exported.' }, { status: 500 })

  const headers = ['Date / Time', 'Customer', 'Card', 'Driver', 'Merchant', 'Location', 'Fuel Type', 'Gallons', 'Amount', 'Savings', 'Status', 'WEX ID']
  const rows = ((data ?? []) as ExportTransaction[]).map((transaction) => {
    const customerRelation = oneRelation(transaction.customers)
    const cardRelation = oneRelation(transaction.fuel_cards)
    return [
      transaction.transaction_date,
      customerRelation?.company_name ?? customerRelation?.contact_name ?? '',
      cardRelation?.card_last4 ? `•••• ${cardRelation.card_last4}` : '',
      cardRelation?.driver_name ?? '',
      transaction.merchant_name ?? '',
      [transaction.merchant_address, transaction.merchant_state].filter(Boolean).join(', '),
      transaction.provider_transaction_type ?? '',
      transaction.gallons ?? '',
      transaction.amount,
      transaction.savings,
      transaction.status,
      transaction.provider_transaction_id ?? '',
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${from}-to-${to}.csv"`,
    },
  })
}

function oneRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
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
