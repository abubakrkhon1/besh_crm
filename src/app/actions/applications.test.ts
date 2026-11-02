import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireRoles: vi.fn(),
  revalidatePath: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/application-access', () => ({
  APPLICATION_SAFE_SELECT: 'id,status',
  withoutSensitiveApplicationFields: vi.fn(),
}))
vi.mock('@/lib/validation/applications', async () => vi.importActual('../../lib/validation/applications'))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  requireRoles: mocks.requireRoles,
}))

import { getApplicationPage, updateApplicationStatus } from './applications'

const applicationId = 'a27c4036-8de5-44a3-b0cd-5cd6ca3d63db'

function client(updateResult: { error: { code?: string; message: string } | null }) {
  const query = {
    update: vi.fn(),
    eq: vi.fn().mockResolvedValue(updateResult),
  }
  query.update.mockReturnValue(query)
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: '8dcf48e5-201f-43cb-a5cc-ac5b28516b87' } } }) },
    from: vi.fn().mockReturnValue(query),
    query,
  }
}

describe('updateApplicationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({ error: null, profile: { role: 'sales_manager' } })
  })

  it('rejects non-decision statuses before opening a database client', async () => {
    await expect(updateApplicationStatus(applicationId, 'under_review')).resolves.toEqual({
      error: 'Invalid application review decision.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('writes an approved decision with reviewer metadata', async () => {
    const db = client({ error: null })
    mocks.createClient.mockResolvedValue(db)

    await expect(updateApplicationStatus(applicationId, 'approved')).resolves.toEqual({ success: true })
    expect(db.query.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      reviewed_by: '8dcf48e5-201f-43cb-a5cc-ac5b28516b87',
      denial_reason: null,
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/crm/applications/${applicationId}`)
  })

  it('returns a conflict when the database rejects a stale or terminal transition', async () => {
    mocks.createClient.mockResolvedValue(client({ error: { code: '23514', message: 'invalid transition' } }))

    await expect(updateApplicationStatus(applicationId, 'denied', 'Credit review failed.')).resolves.toEqual({
      error: 'This application changed after you opened it. Refresh and review its current status.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('getApplicationPage', () => {
  it('returns one filtered page with an exact database count', async () => {
    const rows = [{ id: applicationId, status: 'pending' }]
    const query = {
      select: vi.fn(), order: vi.fn(), eq: vi.fn(), gte: vi.fn(), or: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: rows, count: 61, error: null }),
    }
    query.select.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.gte.mockReturnValue(query)
    query.or.mockReturnValue(query)
    mocks.requireRoles.mockResolvedValue({ error: null, profile: { role: 'sales_manager' } })
    mocks.createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) })

    await expect(getApplicationPage({ page: 2, pageSize: 25, status: 'pending', search: 'Acme' }))
      .resolves.toEqual({ applications: rows, total: 61, page: 2, pageSize: 25 })
    expect(query.range).toHaveBeenCalledWith(25, 49)
    expect(query.eq).toHaveBeenCalledWith('status', 'pending')
    expect(query.or).toHaveBeenCalledWith(expect.stringContaining('company_legal_name.ilike.%Acme%'))
  })
})
