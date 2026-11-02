import { getLeadPage, getLeadWorkspaceSummary, getSalesAgents } from '@/app/actions/leads'
import { LeadsWorkspace } from '@/components/crm/LeadsWorkspace'
import { getCurrentProfile } from '@/lib/supabase/server'
import type { LeadAccountType, LeadStatus } from '@/types/database.types'
import type { LeadFollowUpBucket } from '@/lib/leads/follow-up'

type LeadsSearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function LeadsPage({ searchParams }: { searchParams: LeadsSearchParams }) {
  const profile = await getCurrentProfile()
  const params = await searchParams
  const rep = getStringParam(params.rep)
  const range = getLeadsDateRange(params)
  const canFilterRepresentatives = profile?.role !== 'sales_agent'
  const representatives = canFilterRepresentatives ? await getSalesAgents() : []
  const validRepresentativeId = representatives.some((representative) => representative.id === rep) ? rep : undefined
  const selectedRepresentative = canFilterRepresentatives ? validRepresentativeId : profile?.id
  const isSalesAgent = profile?.role === 'sales_agent'
  const status = getEnumParam(params.status, ['new', 'on_the_process', 'follow_up', 'successful', 'deal_lost'] as const)
  const accountType = getEnumParam(params.accountType, ['prepaid_account', 'deposit', 'credit_line'] as const)
  const source = getStringParam(params.source)?.slice(0, 100)
  const query = getStringParam(params.q)?.slice(0, 100)
  const followUp = getEnumParam(params.followUp, ['overdue', 'today', 'upcoming', 'unscheduled'] as const)
  const timezoneOffsetMinutes = getTimezoneOffset(params.tz)
  const leadFilters = {
    representativeId: selectedRepresentative,
    rangeStart: isSalesAgent ? undefined : range.rangeStart,
    rangeEnd: isSalesAgent ? undefined : range.rangeEnd,
    search: query,
    status: status as LeadStatus | undefined,
    source,
    accountType: accountType as LeadAccountType | undefined,
    followUp: followUp as LeadFollowUpBucket | undefined,
    timezoneOffsetMinutes,
  }
  const [leadPage, summary] = await Promise.all([
    getLeadPage({
      ...leadFilters,
      page: getPositiveInteger(params.page, 1),
      pageSize: getPageSize(params.pageSize),
    }),
    getLeadWorkspaceSummary(leadFilters),
  ])

  return (
    <LeadsWorkspace
      leads={leadPage.leads}
      totalLeads={leadPage.total}
      page={leadPage.page}
      pageSize={leadPage.pageSize}
      initialQuery={query ?? ''}
      initialStatus={status ?? 'all'}
      initialSource={source ?? 'all'}
      initialAccountType={accountType ?? 'all'}
      initialFollowUp={followUp ?? 'all'}
      summary={summary}
      representatives={representatives}
      selectedRepresentativeId={validRepresentativeId}
      canFilterRepresentatives={canFilterRepresentatives}
      canAddLead={profile?.role === 'sales_manager' || profile?.role === 'sales_agent'}
      canAssignLeads={profile?.role === 'sales_manager'}
      canManageWorkPlan={Boolean(profile)}
      isSalesAgent={isSalesAgent}
      referenceTime={new Date().toISOString()}
      openNewLead={getStringParam(params.new) === '1'}
      from={range.from}
      to={range.to}
    />
  )
}

function getLeadsDateRange(params: Awaited<LeadsSearchParams>) {
  const now = new Date()
  const thirtyDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))
  const defaultRange = {
    from: thirtyDaysAgo.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
  const from = getStringParam(params.from) ?? defaultRange.from
  const to = getStringParam(params.to) ?? defaultRange.to
  const validRange = isDateInputValue(from) && isDateInputValue(to) && from <= to ? { from, to } : defaultRange
  const inclusiveEnd = new Date(`${validRange.to}T00:00:00.000Z`)
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1)

  return {
    ...validRange,
    rangeStart: new Date(`${validRange.from}T00:00:00.000Z`).toISOString(),
    rangeEnd: inclusiveEnd.toISOString(),
  }
}

function getStringParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

function getPositiveInteger(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(getStringParam(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function getPageSize(value: string | string[] | undefined) {
  const parsed = getPositiveInteger(value, 25)
  return [10, 25, 50, 100].includes(parsed) ? parsed : 25
}

function getEnumParam<const T extends readonly string[]>(value: string | string[] | undefined, values: T): T[number] | undefined {
  const parsed = getStringParam(value)
  return parsed && values.includes(parsed) ? parsed as T[number] : undefined
}

function getTimezoneOffset(value: string | string[] | undefined) {
  const parsed = Number(getStringParam(value))
  return Number.isInteger(parsed) && parsed >= -840 && parsed <= 840 ? parsed : 0
}

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}
