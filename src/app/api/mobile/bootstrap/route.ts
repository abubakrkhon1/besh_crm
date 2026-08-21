import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function unauthorized(message = 'Authentication is required.') {
  return NextResponse.json({ ok: false, error: message }, {
    status: 401,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return unauthorized()
  const accessToken = authorization.slice(7).trim()
  if (!accessToken || accessToken.length > 4_096) return unauthorized()

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  if (authError || !authData.user) return unauthorized('Session is invalid or expired.')

  const { data: driver, error: driverError } = await admin.from('drivers')
    .select('id,customer_id,first_name,last_name,display_name,email,phone,license_number,license_state,status,onboarding_status,provider,external_driver_id,last_synced_at,customers(id,company_name,contact_name,status)')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()
  if (driverError) {
    console.error('Mobile driver lookup failed.', { code: driverError.code })
    return NextResponse.json({ ok: false, error: 'Driver account could not be loaded.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!driver || driver.onboarding_status !== 'active' || driver.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'Driver mobile access is not active.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const [cardsResult, transactionsResult] = await Promise.all([
    admin.from('fuel_cards')
      .select('id,card_last4,status,unit_number,policy_number,daily_limit,weekly_limit,monthly_limit,gallon_limit,last_synced_at')
      .eq('driver_id', driver.id)
      .order('status', { ascending: true }),
    admin.from('fuel_transactions')
      .select('id,provider_transaction_id,transaction_date,status,merchant_name,merchant_address,merchant_city,merchant_state,merchant_zip,gallons,amount,savings,provider_transaction_type,fuel_cards(card_last4)')
      .eq('driver_id', driver.id)
      .order('transaction_date', { ascending: false })
      .limit(50),
  ])
  if (cardsResult.error || transactionsResult.error) {
    console.error('Mobile driver data lookup failed.', {
      cardsCode: cardsResult.error?.code,
      transactionsCode: transactionsResult.error?.code,
    })
    return NextResponse.json({ ok: false, error: 'Driver data could not be loaded.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  const customer = Array.isArray(driver.customers) ? driver.customers[0] : driver.customers
  return NextResponse.json({
    ok: true,
    driver: {
      id: driver.id,
      displayName: driver.display_name || `${driver.first_name} ${driver.last_name}`.trim(),
      email: driver.email,
      phone: driver.phone,
      licenseNumber: driver.license_number,
      licenseState: driver.license_state,
      externalDriverId: driver.external_driver_id,
      lastSynchronizedAt: driver.last_synced_at,
    },
    customer: customer ? {
      id: customer.id,
      companyName: customer.company_name,
      contactName: customer.contact_name,
      status: customer.status,
    } : null,
    cards: cardsResult.data ?? [],
    recentTransactions: transactionsResult.data ?? [],
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
