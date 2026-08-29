import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireRoles: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/validation/sales-agents', async () => vi.importActual('../../lib/validation/sales-agents'))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  requireRoles: mocks.requireRoles,
}))

import { assignSalesAgentToCurrentManager, getAvailableSalesAgents } from './sales-agents'

const agentProfileId = '3373624b-061a-4fdc-a4b3-81673d7c24bb'

describe('sales manager team assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({
      error: null,
      profile: { id: '9d3fb9d7-cd77-43d7-ad7f-b662250cad4e', role: 'sales_manager' },
    })
  })

  it('lists only the agents returned by the protected database function', async () => {
    const agents = [{ id: agentProfileId, full_name: 'Avery Agent', email: 'avery@example.com', department: 'Sales' }]
    const rpc = vi.fn().mockResolvedValue({ data: agents, error: null })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(getAvailableSalesAgents()).resolves.toEqual(agents)
    expect(rpc).toHaveBeenCalledWith('available_sales_agents_for_current_manager')
  })

  it('rejects malformed agent identifiers before calling the database', async () => {
    const result = await assignSalesAgentToCurrentManager({ agentProfileId: 'not-an-agent' })

    expect(result).toEqual({ ok: false, message: 'Select a valid sales agent.' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects users who are not sales managers', async () => {
    mocks.requireRoles.mockResolvedValue({ error: 'Forbidden', profile: null })

    await expect(assignSalesAgentToCurrentManager({ agentProfileId })).resolves.toEqual({
      ok: false,
      message: 'You do not have permission to manage sales agents.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('atomically assigns an available agent and refreshes manager pages', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(assignSalesAgentToCurrentManager({ agentProfileId })).resolves.toEqual({
      ok: true,
      message: 'Sales agent added to your team.',
    })
    expect(rpc).toHaveBeenCalledWith('assign_sales_agent_to_current_manager', {
      agent_profile_id: agentProfileId,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/sales-agents')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/leads')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/dashboard')
  })

  it('reports a race when another manager claimed the agent first', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23514' } })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(assignSalesAgentToCurrentManager({ agentProfileId })).resolves.toEqual({
      ok: false,
      message: 'That sales agent is no longer available. Refresh the page and try again.',
    })
  })
})
