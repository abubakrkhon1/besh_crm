import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const CUSTOMER_ID = '11111111-1111-4111-8111-000000000001'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
if (!url || !serviceKey || !publishableKey) throw new Error('Supabase test configuration is missing.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `portal-rls-${Date.now()}@example.invalid`
const password = `${randomUUID()}-Aa1!`
let authUserId
let customerTemporarilySuspended = false

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Portal RLS Test User', account_type: 'customer_admin' },
  })
  if (createError || !created.user) throw createError ?? new Error('Test Auth user was not created.')
  authUserId = created.user.id

  const { error: profileError } = await admin.from('profiles').update({
    full_name: 'Portal RLS Test User',
    email,
    role: 'customer_admin',
    customer_id: CUSTOMER_ID,
    is_active: true,
  }).eq('auth_user_id', authUserId)
  if (profileError) throw profileError

  const sessionClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInError } = await sessionClient.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  const { data: otherCustomer, error: otherLookupError } = await admin.from('customers').select('id,contact_name').neq('id', CUSTOMER_ID).limit(1).maybeSingle()
  if (otherLookupError) throw otherLookupError

  const [ownCustomer, ownDrivers, ownCards, ownTransactions, allCustomers, otherCustomerRead, rawCustomer, rawCardIdentifiers] = await Promise.all([
    sessionClient.from('customer_portal_customer').select('id').eq('id', CUSTOMER_ID),
    sessionClient.from('customer_portal_drivers').select('id').eq('customer_id', CUSTOMER_ID),
    sessionClient.from('customer_portal_fuel_cards').select('id').eq('customer_id', CUSTOMER_ID),
    sessionClient.from('customer_portal_fuel_transactions').select('id').eq('customer_id', CUSTOMER_ID),
    sessionClient.from('customer_portal_customer').select('id'),
    otherCustomer ? sessionClient.from('customer_portal_customer').select('id').eq('id', otherCustomer.id) : Promise.resolve({ data: [], error: null }),
    sessionClient.from('customers').select('id').eq('id', CUSTOMER_ID),
    sessionClient.from('fuel_cards').select('card_token,card_fingerprint,provider_card_id').eq('customer_id', CUSTOMER_ID),
  ])
  for (const result of [ownCustomer, ownDrivers, ownCards, ownTransactions, allCustomers, otherCustomerRead, rawCustomer, rawCardIdentifiers]) {
    if (result.error) throw result.error
  }

  assert(ownCustomer.data?.length === 1, 'The portal user could not read its assigned customer.')
  assert(ownDrivers.data?.length === 3, 'The portal user did not receive exactly its three fixture drivers.')
  assert(ownCards.data?.length === 3, 'The portal user did not receive exactly its three fixture cards.')
  assert(ownTransactions.data?.length === 4, 'The portal user did not receive exactly its four fixture transactions.')
  assert(allCustomers.data?.length === 1 && allCustomers.data[0].id === CUSTOMER_ID, 'The portal user could enumerate another customer.')
  assert(otherCustomerRead.data?.length === 0, 'The portal user could directly read another customer ID.')
  assert(rawCustomer.data?.length === 0, 'The portal user could read the raw customers table.')
  assert(rawCardIdentifiers.data?.length === 0, 'The portal user could read internal fuel-card identifiers.')

  const { error: suspendError } = await admin.from('customers').update({ status: 'suspended' }).eq('id', CUSTOMER_ID)
  if (suspendError) throw suspendError
  customerTemporarilySuspended = true
  const { data: suspendedRows, error: suspendedReadError } = await sessionClient.from('customer_portal_customer').select('id')
  if (suspendedReadError) throw suspendedReadError
  assert(suspendedRows.length === 0, 'A suspended customer retained portal database access.')

  const { error: restoreError } = await admin.from('customers').update({ status: 'active' }).eq('id', CUSTOMER_ID)
  if (restoreError) throw restoreError
  customerTemporarilySuspended = false

  const originalContactName = otherCustomer?.contact_name ?? null
  if (otherCustomer) {
    await sessionClient.from('customers').update({ contact_name: 'UNAUTHORIZED PORTAL CHANGE' }).eq('id', otherCustomer.id)
    const { data: unchanged, error: unchangedError } = await admin.from('customers').select('contact_name').eq('id', otherCustomer.id).single()
    if (unchangedError) throw unchangedError
    assert(unchanged.contact_name === originalContactName, 'The portal user changed another customer.')
  }

  console.log(JSON.stringify({
    passed: true,
    ownTenant: { customers: ownCustomer.data.length, drivers: ownDrivers.data.length, cards: ownCards.data.length, transactions: ownTransactions.data.length },
    crossTenantCustomersVisible: otherCustomerRead.data.length,
    rawCrmRowsVisible: rawCustomer.data.length,
    internalCardRowsVisible: rawCardIdentifiers.data.length,
    suspendedCustomerRowsVisible: suspendedRows.length,
    crossTenantUpdateBlocked: true,
  }, null, 2))
} finally {
  if (customerTemporarilySuspended) await admin.from('customers').update({ status: 'active' }).eq('id', CUSTOMER_ID)
  if (authUserId) await admin.auth.admin.deleteUser(authUserId)
}
