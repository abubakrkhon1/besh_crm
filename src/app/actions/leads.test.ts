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

import { addLeadNote, assignLead, getLeadActivities, updateLeadWorkPlan } from './leads'

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
    await expect(getLeadActivities('not-a-lead')).resolves.toEqual([])
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('loads the latest authorized activity events', async () => {
    const activities = [{ id: 'activity-1', lead_id: leadId, activity_type: 'note_added' }]
    const activityQuery = query({ data: activities, error: null })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(activityQuery) })

    await expect(getLeadActivities(leadId)).resolves.toEqual(activities)
    expect(activityQuery.eq).toHaveBeenCalledWith('lead_id', leadId)
    expect(activityQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(activityQuery.limit).toHaveBeenCalledWith(100)
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
