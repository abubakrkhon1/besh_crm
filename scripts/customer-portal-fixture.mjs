import { createClient } from '@supabase/supabase-js'

const CUSTOMER_ID = '11111111-1111-4111-8111-000000000001'
const TEST_CONTACT_EMAIL = process.env.PORTAL_TEST_EMAIL?.trim().toLowerCase() || 'portal-test@example.com'
const DRIVER_IDS = [
  '11111111-1111-4111-8111-000000000101',
  '11111111-1111-4111-8111-000000000102',
  '11111111-1111-4111-8111-000000000103',
]
const CARD_IDS = [
  '11111111-1111-4111-8111-000000000201',
  '11111111-1111-4111-8111-000000000202',
  '11111111-1111-4111-8111-000000000203',
]
const TRANSACTION_IDS = [
  '11111111-1111-4111-8111-000000000301',
  '11111111-1111-4111-8111-000000000302',
  '11111111-1111-4111-8111-000000000303',
  '11111111-1111-4111-8111-000000000304',
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY
if (!url || !serviceKey) throw new Error('Supabase server configuration is missing.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const mode = process.argv[2] ?? 'seed'

function fail(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`)
}

async function seed() {
  const now = new Date()
  const daysAgo = (days, hour) => {
    const value = new Date(now)
    value.setUTCDate(value.getUTCDate() - days)
    value.setUTCHours(hour, 15, 0, 0)
    return value.toISOString()
  }

  const customerResult = await admin.from('customers').upsert({
    id: CUSTOMER_ID,
    type: 'company',
    company_name: 'BESH Portal Test Company',
    contact_name: 'Taylor Test',
    email: TEST_CONTACT_EMAIL,
    phone: '+1 555 010 4400',
    status: 'active',
    current_balance: 842.37,
    monthly_spend: 2731.84,
    lifetime_spend: 18420.55,
    credit_limit: 15000,
    notes: 'Synthetic customer fixture for customer-portal testing.',
    wex_carrier_id: 'PORTAL-TEST-CARRIER-001',
    wex_company_xref: 'PORTAL-TEST-CO',
    provider: 'portal_test',
    last_synced_at: now.toISOString(),
  }, { onConflict: 'id' })
  fail('Customer seed failed', customerResult.error)

  const driversResult = await admin.from('drivers').upsert([
    { id: DRIVER_IDS[0], customer_id: CUSTOMER_ID, first_name: 'Alex', last_name: 'Rivera', display_name: 'Alex Rivera', email: null, phone: '+1 555 010 4401', status: 'active', provider: 'portal_test', external_driver_id: 'TEST-DRV-101', provider_status: 'ACTIVE', onboarding_status: 'unclaimed', last_synced_at: now.toISOString() },
    { id: DRIVER_IDS[1], customer_id: CUSTOMER_ID, first_name: 'Morgan', last_name: 'Lee', display_name: 'Morgan Lee', email: null, phone: '+1 555 010 4402', status: 'active', provider: 'portal_test', external_driver_id: 'TEST-DRV-102', provider_status: 'ACTIVE', onboarding_status: 'unclaimed', last_synced_at: now.toISOString() },
    { id: DRIVER_IDS[2], customer_id: CUSTOMER_ID, first_name: 'Jordan', last_name: 'Patel', display_name: 'Jordan Patel', email: null, phone: '+1 555 010 4403', status: 'active', provider: 'portal_test', external_driver_id: 'TEST-DRV-103', provider_status: 'ACTIVE', onboarding_status: 'unclaimed', last_synced_at: now.toISOString() },
  ], { onConflict: 'id' })
  fail('Driver seed failed', driversResult.error)

  const cardsResult = await admin.from('fuel_cards').upsert([
    { id: CARD_IDS[0], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[0], card_last4: '1101', provider: 'wex_efs', provider_card_id: 'PORTAL-TEST-CARD-201', card_fingerprint: 'portal-test-card-fingerprint-201', status: 'ACTIVE', daily_limit: 500, weekly_limit: 2000, monthly_limit: 6000, gallon_limit: 150, daily_transaction_limit: 4, weekly_transaction_limit: 20, monthly_transaction_limit: 80, driver_name: 'Alex Rivera', external_driver_id: 'TEST-DRV-101', unit_number: 'TEST-TRUCK-01', policy_number: '9001', company_xref: 'PORTAL-TEST-CO', last_synced_at: now.toISOString() },
    { id: CARD_IDS[1], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[1], card_last4: '2202', provider: 'wex_efs', provider_card_id: 'PORTAL-TEST-CARD-202', card_fingerprint: 'portal-test-card-fingerprint-202', status: 'INACTIVE', daily_limit: 350, weekly_limit: 1500, monthly_limit: 4500, gallon_limit: 120, daily_transaction_limit: 3, weekly_transaction_limit: 15, monthly_transaction_limit: 60, driver_name: 'Morgan Lee', external_driver_id: 'TEST-DRV-102', unit_number: 'TEST-TRUCK-02', policy_number: '9001', company_xref: 'PORTAL-TEST-CO', last_synced_at: now.toISOString() },
    { id: CARD_IDS[2], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[2], card_last4: '3303', provider: 'wex_efs', provider_card_id: 'PORTAL-TEST-CARD-203', card_fingerprint: 'portal-test-card-fingerprint-203', status: 'ACTIVE', daily_limit: 750, weekly_limit: 3000, monthly_limit: 9000, gallon_limit: 200, daily_transaction_limit: 6, weekly_transaction_limit: 30, monthly_transaction_limit: 100, driver_name: 'Jordan Patel', external_driver_id: 'TEST-DRV-103', unit_number: 'TEST-TRUCK-03', policy_number: '9002', company_xref: 'PORTAL-TEST-CO', last_synced_at: now.toISOString() },
  ], { onConflict: 'id' })
  fail('Fuel-card seed failed', cardsResult.error)

  const transactionsResult = await admin.from('fuel_transactions').upsert([
    { id: TRANSACTION_IDS[0], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[0], fuel_card_id: CARD_IDS[0], type: 'fuel_purchase', status: 'posted', merchant_name: 'Pilot Test Station', merchant_address: '100 Test Highway', merchant_city: 'Dallas', merchant_state: 'TX', merchant_zip: '75201', gallons: 62.4, amount: 221.73, savings: 18.72, transaction_date: daysAgo(1, 14), provider: 'portal_test', provider_transaction_id: 'PORTAL-TEST-TXN-301', provider_transaction_type: 'FUEL', wex_carrier_id: 'PORTAL-TEST-CARRIER-001', company_xref: 'PORTAL-TEST-CO' },
    { id: TRANSACTION_IDS[1], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[1], fuel_card_id: CARD_IDS[1], type: 'fuel_purchase', status: 'posted', merchant_name: 'Love’s Test Travel Stop', merchant_address: '200 Fixture Road', merchant_city: 'Tulsa', merchant_state: 'OK', merchant_zip: '74103', gallons: 48.1, amount: 169.79, savings: 14.43, transaction_date: daysAgo(3, 9), provider: 'portal_test', provider_transaction_id: 'PORTAL-TEST-TXN-302', provider_transaction_type: 'FUEL', wex_carrier_id: 'PORTAL-TEST-CARRIER-001', company_xref: 'PORTAL-TEST-CO' },
    { id: TRANSACTION_IDS[2], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[2], fuel_card_id: CARD_IDS[2], type: 'fuel_purchase', status: 'posted', merchant_name: 'TA Test Center', merchant_address: '300 Demo Avenue', merchant_city: 'Memphis', merchant_state: 'TN', merchant_zip: '38103', gallons: 71.8, amount: 258.12, savings: 21.54, transaction_date: daysAgo(5, 18), provider: 'portal_test', provider_transaction_id: 'PORTAL-TEST-TXN-303', provider_transaction_type: 'FUEL', wex_carrier_id: 'PORTAL-TEST-CARRIER-001', company_xref: 'PORTAL-TEST-CO' },
    { id: TRANSACTION_IDS[3], customer_id: CUSTOMER_ID, driver_id: DRIVER_IDS[0], fuel_card_id: CARD_IDS[0], type: 'fuel_purchase', status: 'posted', merchant_name: 'Flying J Test Plaza', merchant_address: '400 Sample Street', merchant_city: 'Atlanta', merchant_state: 'GA', merchant_zip: '30303', gallons: 55.2, amount: 196.51, savings: 16.56, transaction_date: daysAgo(8, 11), provider: 'portal_test', provider_transaction_id: 'PORTAL-TEST-TXN-304', provider_transaction_type: 'FUEL', wex_carrier_id: 'PORTAL-TEST-CARRIER-001', company_xref: 'PORTAL-TEST-CO' },
  ], { onConflict: 'id' })
  fail('Transaction seed failed', transactionsResult.error)

  const [customer, drivers, cards, transactions] = await Promise.all([
    admin.from('customers').select('id,company_name,status').eq('id', CUSTOMER_ID).single(),
    admin.from('drivers').select('id', { count: 'exact', head: true }).eq('customer_id', CUSTOMER_ID),
    admin.from('fuel_cards').select('id', { count: 'exact', head: true }).eq('customer_id', CUSTOMER_ID),
    admin.from('fuel_transactions').select('id', { count: 'exact', head: true }).eq('customer_id', CUSTOMER_ID),
  ])
  fail('Fixture verification failed', customer.error ?? drivers.error ?? cards.error ?? transactions.error)
  console.log(JSON.stringify({ mode: 'seed', customer: customer.data, contactEmail: TEST_CONTACT_EMAIL, drivers: drivers.count, cards: cards.count, transactions: transactions.count }, null, 2))
}

async function cleanup() {
  const { data: profiles, error: profileError } = await admin.from('profiles').select('auth_user_id').eq('customer_id', CUSTOMER_ID)
  fail('Portal-account lookup failed', profileError)
  for (const profile of profiles ?? []) {
    const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id)
    fail('Portal-account cleanup failed', error)
  }
  const { error } = await admin.from('customers').delete().eq('id', CUSTOMER_ID)
  fail('Fixture cleanup failed', error)
  console.log(JSON.stringify({ mode: 'cleanup', customerId: CUSTOMER_ID, deletedPortalUsers: profiles?.length ?? 0 }, null, 2))
}

if (mode === 'seed') await seed()
else if (mode === 'cleanup') await cleanup()
else throw new Error('Use "seed" or "cleanup".')
