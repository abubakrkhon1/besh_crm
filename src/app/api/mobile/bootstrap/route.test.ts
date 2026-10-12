import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { GET } from './route'

function query<T>(result: { data: T; error: null }) {
  const builder: Record<string, any> = {}
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(async () => result)
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

describe('mobile bootstrap tenant boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires both driver and customer ownership for cards and transactions', async () => {
    const driver = {
      id: 'driver-a', customer_id: 'customer-a', first_name: 'A', last_name: 'Driver',
      display_name: 'A Driver', email: 'a@example.com', phone: null, license_number: null,
      license_state: null, status: 'active', onboarding_status: 'active', provider: 'wex_efs',
      external_driver_id: 'external-a', last_synced_at: null,
      customers: { id: 'customer-a', company_name: 'A Co', contact_name: 'A', status: 'active' },
    }
    const driverQuery = query({ data: driver, error: null })
    const cardQuery = query({ data: [{ id: 'card-a' }], error: null })
    const transactionQuery = query({ data: [{ id: 'transaction-a' }], error: null })
    const admin = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'auth-a' } }, error: null })) },
      from: vi.fn((table: string) => {
        if (table === 'drivers') return driverQuery
        if (table === 'fuel_cards') return cardQuery
        if (table === 'fuel_transactions') return transactionQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    mocks.createAdminClient.mockReturnValue(admin)

    const response = await GET(new Request('https://crm.example/api/mobile/bootstrap', {
      headers: { authorization: 'Bearer valid-token' },
    }))

    expect(response.status).toBe(200)
    expect(cardQuery.eq.mock.calls).toEqual([
      ['driver_id', 'driver-a'],
      ['customer_id', 'customer-a'],
    ])
    expect(transactionQuery.eq.mock.calls).toEqual([
      ['driver_id', 'driver-a'],
      ['customer_id', 'customer-a'],
    ])
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      customer: { id: 'customer-a' },
      cards: [{ id: 'card-a' }],
      recentTransactions: [{ id: 'transaction-a' }],
    })
  })
})
