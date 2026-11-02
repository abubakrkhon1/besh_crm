import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireRoles: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/validation/leads', async () => vi.importActual('../../lib/validation/leads'))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  requireRoles: mocks.requireRoles,
  CRM_ROLES: ['owner', 'admin', 'general_manager', 'sales_manager', 'sales_agent'],
}))

import {
  addLeadNote,
  assignLead,
  getLeadPage,
  getLeadWorkspaceSummary,
  getGeneralManagerDashboard,
  getLeadActivities,
  getSalesAgentDashboard,
  getSalesManagerAgentPerformance,
  updateLeadWorkPlan,
} from './leads'

const manager = {
  id: '9d3fb9d7-cd77-43d7-ad7f-b662250cad4e',
  role: 'sales_manager',
}
const leadId = '3f71edbb-ffc9-4498-9ec2-a94fb8db9af8'
const agentProfileId = '3373624b-061a-4fdc-a4b3-81673d7c24bb'

function assignmentForm(agentId = agentProfileId) {
  const formData = new FormData()
  formData.set('leadId', leadId)
  formData.set('agentProfileId', agentId)
  return formData
}

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    insert: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    range: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  builder.select.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  return builder
}

describe('assignLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
  })

  it('rejects users who are not sales managers', async () => {
    mocks.requireRoles.mockResolvedValue({ error: 'Forbidden', profile: null })

    await expect(assignLead({}, assignmentForm())).resolves.toEqual({
      error: 'You do not have permission to assign leads.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects malformed assignment identifiers before querying the database', async () => {
    const formData = assignmentForm()
    formData.set('leadId', 'not-a-lead')

    const result = await assignLead({}, formData)

    expect(result.error).toBe('Select a valid sales agent and try again.')
    expect(result.fieldErrors?.leadId).toBeDefined()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects an agent who is not an active direct report', async () => {
    const agentQuery = query({ data: null, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(agentQuery) })

    await expect(assignLead({}, assignmentForm())).resolves.toEqual({
      error: 'That sales agent is not an active member of your team.',
    })
    expect(agentQuery.eq).toHaveBeenCalledWith('manager_profile_id', manager.id)
    expect(agentQuery.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('assigns a manager-owned lead to an active direct report', async () => {
    const agentQuery = query({ data: { id: agentProfileId }, error: null })
    const leadQuery = query({ data: { id: leadId }, error: null })
    const from = vi.fn((table: string) => table === 'profiles' ? agentQuery : leadQuery)
    mocks.createClient.mockResolvedValue({ from })

    await expect(assignLead({}, assignmentForm())).resolves.toEqual({ success: true })

    expect(leadQuery.update).toHaveBeenCalledWith({ assigned_to_profile_id: agentProfileId })
    expect(leadQuery.eq).toHaveBeenCalledWith('sales_manager_profile_id', manager.id)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/leads')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/dashboard')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/sales-agents')
  })

  it('allows a manager to return their lead to the unassigned inbox', async () => {
    const leadQuery = query({ data: { id: leadId }, error: null })
    const from = vi.fn().mockReturnValue(leadQuery)
    mocks.createClient.mockResolvedValue({ from })

    await expect(assignLead({}, assignmentForm(''))).resolves.toEqual({ success: true })

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('leads')
    expect(leadQuery.update).toHaveBeenCalledWith({ assigned_to_profile_id: null })
  })
})

describe('addLeadNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
  })

  function noteForm(note = 'Called and left a voicemail.') {
    const formData = new FormData()
    formData.set('leadId', leadId)
    formData.set('note', note)
    return formData
  }

  it('rejects an empty note before querying the database', async () => {
    const result = await addLeadNote({}, noteForm('  '))

    expect(result.error).toBe('Enter a valid note.')
    expect(result.fieldErrors?.note).toBeDefined()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('adds an immutable timeline note as the current profile', async () => {
    const activityQuery = query({ data: null, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(activityQuery) })

    await expect(addLeadNote({}, noteForm())).resolves.toEqual({ success: true })

    expect(activityQuery.insert).toHaveBeenCalledWith({
      lead_id: leadId,
      actor_profile_id: manager.id,
      activity_type: 'note_added',
      description: 'Called and left a voicemail.',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/leads')
  })
})

describe('getLeadActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
  })

  it('returns no data for a malformed lead identifier', async () => {
    await expect(getLeadActivities('not-a-lead')).resolves.toEqual({ activities: [], nextOffset: null })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('loads the latest authorized activity events', async () => {
    const activities = [{ id: 'activity-1', lead_id: leadId, activity_type: 'note_added' }]
    const activityQuery = query({ data: activities, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(activityQuery) })

    await expect(getLeadActivities(leadId)).resolves.toEqual({ activities, nextOffset: null })
    expect(activityQuery.eq).toHaveBeenCalledWith('lead_id', leadId)
    expect(activityQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(activityQuery.order).toHaveBeenCalledWith('id', { ascending: false })
    expect(activityQuery.range).toHaveBeenCalledWith(0, 25)
  })

  it('returns a next offset without exposing the lookahead row', async () => {
    const activities = Array.from({ length: 26 }, (_, index) => ({ id: `activity-${index}` }))
    const activityQuery = query({ data: activities, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(activityQuery) })

    await expect(getLeadActivities(leadId)).resolves.toEqual({ activities: activities.slice(0, 25), nextOffset: 25 })
  })
})

describe('updateLeadWorkPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
  })

  function workPlanForm() {
    const formData = new FormData()
    formData.set('leadId', leadId)
    formData.set('priority', 'urgent')
    formData.set('nextFollowUpAt', '2026-08-28T09:30')
    formData.set('timezoneOffsetMinutes', '240')
    return formData
  }

  it('rejects a user without CRM lead access', async () => {
    mocks.requireRoles.mockResolvedValue({ error: 'Forbidden', profile: null })

    await expect(updateLeadWorkPlan({}, workPlanForm())).resolves.toEqual({
      error: 'You do not have permission to update this lead.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('writes priority and the normalized UTC follow-up timestamp', async () => {
    const leadQuery = query({ data: { id: leadId }, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(leadQuery) })

    await expect(updateLeadWorkPlan({}, workPlanForm())).resolves.toEqual({ success: true })

    expect(leadQuery.update).toHaveBeenCalledWith({
      priority: 'urgent',
      next_follow_up_at: '2026-08-28T13:30:00.000Z',
    })
    expect(leadQuery.eq).toHaveBeenCalledWith('id', leadId)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/leads')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crm/dashboard')
  })
})

describe('lead dashboard aggregates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the sales agent summary without reading individual leads', async () => {
    const summary = { total_leads: 750, successful_leads: 125 }
    const rpc = vi.fn().mockResolvedValue({ data: [summary], error: null })
    mocks.requireRoles.mockResolvedValue({ error: null, profile: { ...manager, role: 'sales_agent' } })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(getSalesAgentDashboard()).resolves.toEqual(summary)
    expect(rpc).toHaveBeenCalledWith('sales_agent_dashboard')
  })

  it('loads exact per-agent performance for the selected period', async () => {
    const rows = [{ profile_id: agentProfileId, total_leads: 600, successful_leads: 80 }]
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null })
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(getSalesManagerAgentPerformance('2026-10-01', '2026-11-01')).resolves.toEqual(rows)
    expect(rpc).toHaveBeenCalledWith('sales_manager_agent_performance', {
      range_start: '2026-10-01',
      range_end: '2026-11-01',
    })
  })
})

describe('getLeadPage', () => {
  it('uses a bounded database range and returns the exact visible count', async () => {
    const rows = [{ id: leadId }]
    const builder = {
      select: vi.fn(),
      order: vi.fn(),
      gte: vi.fn(),
      lt: vi.fn(),
      eq: vi.fn(),
      or: vi.fn(),
      in: vi.fn(),
      is: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: rows, count: 84, error: null }),
    }
    builder.select.mockReturnValue(builder)
    builder.order.mockReturnValue(builder)
    builder.gte.mockReturnValue(builder)
    builder.lt.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.or.mockReturnValue(builder)
    builder.in.mockReturnValue(builder)
    builder.is.mockReturnValue(builder)
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(builder) })

    await expect(getLeadPage({
      rangeStart: '2026-10-01',
      rangeEnd: '2026-11-01',
      page: 3,
      pageSize: 25,
      search: 'Acme',
      status: 'follow_up',
      source: 'referral',
      accountType: 'credit_line',
      followUp: 'unscheduled',
      timezoneOffsetMinutes: 240,
    })).resolves.toEqual({ leads: rows, total: 84, page: 3, pageSize: 25 })
    expect(builder.range).toHaveBeenCalledWith(50, 74)
    expect(builder.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' })
    expect(builder.eq).toHaveBeenCalledWith('status', 'follow_up')
    expect(builder.eq).toHaveBeenCalledWith('source', 'referral')
    expect(builder.eq).toHaveBeenCalledWith('account_type', 'credit_line')
    expect(builder.or).toHaveBeenCalledWith(expect.stringContaining('company_name.ilike.%Acme%'))
    expect(builder.in).toHaveBeenCalledWith('status', ['new', 'on_the_process', 'follow_up'])
    expect(builder.is).toHaveBeenCalledWith('next_follow_up_at', null)
  })
})

describe('getLeadWorkspaceSummary', () => {
  it('requests one exact aggregate over the active filters', async () => {
    const summary = {
      total: 84,
      status_counts: { new: 20, on_the_process: 10, follow_up: 10, successful: 40, deal_lost: 4 },
      sources: [{ source: 'referral', count: 50 }],
      top_representatives: [],
    }
    const rpc = vi.fn().mockResolvedValue({ data: summary, error: null })
    mocks.requireRoles.mockResolvedValue({ error: null, profile: manager })
    mocks.createClient.mockResolvedValue({ rpc })

    await expect(getLeadWorkspaceSummary({
      representativeId: agentProfileId,
      status: 'successful',
      search: 'Acme',
      timezoneOffsetMinutes: 240,
    })).resolves.toEqual(summary)
    expect(rpc).toHaveBeenCalledWith('lead_workspace_summary', expect.objectContaining({
      p_representative_id: agentProfileId,
      p_status: 'successful',
      p_search: 'Acme',
    }))
  })
})

describe('getGeneralManagerDashboard', () => {
  it('loads transaction aggregates from one database RPC', async () => {
    const counts = [12, 8]
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ count: counts.shift(), error: null }),
      })),
    }))
    const aggregates = {
      gallons: 1200,
      spending: 4200,
      savings: 300,
      daily_series: [],
      spend_by_state: [],
      top_locations: [],
      recent_transactions: [],
    }
    const rpc = vi.fn().mockResolvedValue({ data: aggregates, error: null })
    mocks.requireRoles.mockResolvedValue({ error: null, profile: { role: 'general_manager' } })
    mocks.createClient.mockResolvedValue({ from, rpc })

    await expect(getGeneralManagerDashboard('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'))
      .resolves.toEqual(expect.objectContaining({ gallons_sold: 1200, spending: 4200, savings: 300 }))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('general_manager_transaction_dashboard', {
      p_range_start: '2026-10-01T00:00:00.000Z',
      p_range_end: '2026-11-01T00:00:00.000Z',
    })
  })
})
