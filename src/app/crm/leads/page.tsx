import { getLeads, getSalesAgents } from '@/app/actions/leads'
import { LeadsWorkspace } from '@/components/crm/LeadsWorkspace'
import { getCurrentProfile } from '@/lib/supabase/server'

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
  const leads = await getLeads(
    selectedRepresentative,
    isSalesAgent ? undefined : range.rangeStart,
    isSalesAgent ? undefined : range.rangeEnd,
  )

  return (
    <LeadsWorkspace
      leads={leads}
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

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}
