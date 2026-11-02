'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, BriefcaseBusiness, CalendarClock, CalendarDays, Download, RotateCcw, Search, Target, UserRoundCheck, Users } from 'lucide-react'
import { Label, Pie, PieChart } from 'recharts'
import type { LeadWithRepresentative, LeadWorkspaceSummary } from '@/app/actions/leads'
import { DashboardDateFilter } from '@/components/crm/DashboardDateFilter'
import { LeadsTable } from '@/components/crm/LeadsTableShell'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { LeadAccountType, LeadStatus, Profile } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { getLeadFollowUpBucket, type LeadFollowUpBucket } from '@/lib/leads/follow-up'

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  on_the_process: 'On the Process',
  follow_up: 'Follow Up',
  successful: 'Successful',
  deal_lost: 'Deal Lost',
}

const accountTypeLabels: Record<LeadAccountType, string> = {
  prepaid_account: 'Prepaid Account',
  deposit: 'Deposit',
  credit_line: 'Credit Line',
}

const statusOrder: LeadStatus[] = ['new', 'on_the_process', 'follow_up', 'successful', 'deal_lost']

const chartConfig = {
  leads: { label: 'Leads' },
  new: { label: 'New', color: 'var(--chart-1)' },
  on_the_process: { label: 'On the Process', color: 'var(--chart-3)' },
  follow_up: { label: 'Follow Up', color: 'var(--chart-4)' },
  successful: { label: 'Successful', color: 'var(--chart-2)' },
  deal_lost: { label: 'Deal Lost', color: 'var(--destructive)' },
} satisfies ChartConfig

type LeadsWorkspaceProps = {
  leads: LeadWithRepresentative[]
  totalLeads: number
  page: number
  pageSize: number
  initialQuery: string
  initialStatus: 'all' | LeadStatus
  initialSource: string
  initialAccountType: 'all' | LeadAccountType
  initialFollowUp: FollowUpFilter
  summary: LeadWorkspaceSummary | null
  representatives: Profile[]
  selectedRepresentativeId?: string
  canFilterRepresentatives: boolean
  canAddLead: boolean
  canAssignLeads: boolean
  canManageWorkPlan: boolean
  isSalesAgent: boolean
  referenceTime: string
  openNewLead: boolean
  from: string
  to: string
}

export function LeadsWorkspace({
  leads,
  totalLeads,
  page,
  pageSize,
  initialQuery,
  initialStatus,
  initialSource,
  initialAccountType,
  initialFollowUp,
  summary,
  representatives,
  selectedRepresentativeId,
  canFilterRepresentatives,
  canAddLead,
  canAssignLeads,
  canManageWorkPlan,
  isSalesAgent,
  referenceTime,
  openNewLead,
  from,
  to,
}: LeadsWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState<'all' | LeadStatus>(initialStatus)
  const [source, setSource] = useState(initialSource)
  const [accountType, setAccountType] = useState<'all' | LeadAccountType>(initialAccountType)
  const [followUp, setFollowUp] = useState<FollowUpFilter>(initialFollowUp)
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const now = hydrated ? Date.parse(referenceTime) : null

  const pageCounts = useMemo(() => Object.fromEntries(
    statusOrder.map((leadStatus) => [leadStatus, leads.filter((lead) => lead.status === leadStatus).length]),
  ) as Record<LeadStatus, number>, [leads])
  const counts = summary?.status_counts ?? pageCounts

  const sources = useMemo(() => [...new Set([
    ...leads.map((lead) => lead.source),
    ...(source === 'all' ? [] : [source]),
  ])].sort(), [leads, source])
  const pageFollowUpCounts = useMemo(() => {
    const counts: Record<Exclude<FollowUpFilter, 'all'>, number> = {
      overdue: 0,
      today: 0,
      upcoming: 0,
      unscheduled: 0,
    }
    if (now === null) return counts

    for (const lead of leads) {
      const bucket = getLeadFollowUpBucket(lead, now)
      if (bucket) counts[bucket] += 1
    }
    return counts
  }, [leads, now])
  const followUpCounts = summary?.follow_up_counts ?? pageFollowUpCounts
  const filteredLeads = leads

  const selectRepresentative = (representativeId: string) => {
    const next = new URLSearchParams(searchParams)
    if (representativeId === 'all') next.delete('rep')
    else next.set('rep', representativeId)
    next.delete('page')
    router.push(`/crm/leads?${next}`)
  }

  const selectPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    router.push(`/crm/leads?${next}`)
  }

  const selectPageSize = (nextPageSize: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('pageSize', String(nextPageSize))
    next.delete('page')
    router.push(`/crm/leads?${next}`)
  }

  const applyFilter = (name: 'q' | 'status' | 'source' | 'accountType', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') next.delete(name)
    else next.set(name, value)
    next.delete('page')
    router.push(`/crm/leads?${next}`)
  }

  const applyFollowUpFilter = (value: FollowUpFilter) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') {
      next.delete('followUp')
      next.delete('tz')
    } else {
      next.set('followUp', value)
      next.set('tz', String(new Date().getTimezoneOffset()))
    }
    next.delete('page')
    router.push(`/crm/leads?${next}`)
  }

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setSource('all')
    setAccountType('all')
    setFollowUp('all')
    const next = new URLSearchParams(searchParams)
    for (const name of ['q', 'status', 'source', 'accountType', 'followUp', 'tz', 'page']) next.delete(name)
    router.push(`/crm/leads?${next}`)
  }

  const activePipeline = counts.on_the_process + counts.follow_up
  const tableFilterKey = [query, status, source, accountType, followUp, selectedRepresentativeId ?? 'all', from, to].join('|')
  const exportParams = new URLSearchParams(searchParams)
  exportParams.delete('page')
  exportParams.delete('pageSize')
  exportParams.delete('new')
  const exportHref = `/api/leads/export?${exportParams}`

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage leads across your sales team.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          {!isSalesAgent && <DashboardDateFilter from={from} to={to} path="/crm/leads" description="Choose when leads were received." />}
          <Button render={<a href={exportHref} />} variant="outline" size="lg" aria-disabled={!totalLeads} className={!totalLeads ? 'pointer-events-none opacity-50' : undefined}>
            <Download data-icon="inline-start" />
            Export filtered leads
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <main className="flex min-w-0 flex-col gap-4">
          {isSalesAgent ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LeadMetricCard title="My leads" value={totalLeads} detail="Currently assigned to you" icon={<Users />} tone="blue" />
              <LeadMetricCard title="Overdue" value={followUpCounts.overdue} detail={!summary && totalLeads > leads.length ? 'On this page' : 'Follow-ups past due'} icon={<AlertTriangle />} tone="red" />
              <LeadMetricCard title="Due today" value={followUpCounts.today} detail={!summary && totalLeads > leads.length ? 'On this page' : 'Remaining today'} icon={<CalendarClock />} tone="orange" />
              <LeadMetricCard title="Upcoming" value={followUpCounts.upcoming} detail={!summary && totalLeads > leads.length ? 'On this page' : 'Scheduled after today'} icon={<CalendarDays />} tone="green" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LeadMetricCard title="Total leads" value={totalLeads} detail="Received in selected range" icon={<Users />} tone="blue" />
              <LeadMetricCard title="New leads" value={counts.new} detail={!summary && totalLeads > leads.length ? 'On this page' : 'Not worked yet'} icon={<Target />} tone="violet" />
              <LeadMetricCard title="Active pipeline" value={activePipeline} detail={!summary && totalLeads > leads.length ? 'On this page' : 'In process or follow-up'} icon={<BriefcaseBusiness />} tone="orange" />
              <LeadMetricCard title="Successful" value={counts.successful} detail={!summary && totalLeads > leads.length ? 'On this page' : 'Current successful status'} icon={<UserRoundCheck />} tone="green" />
            </div>
          )}

          {canFilterRepresentatives && representatives.length > 0 && (
            <Tabs value={selectedRepresentativeId ?? 'all'} onValueChange={selectRepresentative}>
              <TabsList className="h-auto max-w-full justify-start overflow-x-auto bg-transparent p-0">
                <TabsTrigger value="all">All sales agents</TabsTrigger>
                {representatives.map((representative) => (
                  <TabsTrigger key={representative.id} value={representative.id}>
                    {shortName(representative.full_name ?? representative.email ?? 'Unnamed sales agent')}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <Card size="sm" className="overflow-hidden">
            <CardHeader>
              <CardTitle>Filter leads</CardTitle>
              <CardDescription>{isSalesAgent ? 'Search and organize your assigned lead workload.' : 'Search and narrow the selected received-date cohort.'}</CardDescription>
              <CardAction>
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <RotateCcw data-icon="inline-start" />
                  Clear filters
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className={cn(
                'grid gap-3 px-4 pb-4 md:grid-cols-2',
                isSalesAgent
                  ? 'xl:grid-cols-[minmax(14rem,1.5fr)_repeat(4,minmax(9rem,1fr))]'
                  : 'xl:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(9rem,1fr))]',
              )}>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onBlur={() => applyFilter('q', query.trim())}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyFilter('q', query.trim())
                    }}
                    className="pl-9"
                    placeholder="Search company, contact, email…"
                    aria-label="Search leads"
                  />
                </div>
                <NativeSelect className="w-full" value={status} onChange={(event) => { const value = event.target.value as 'all' | LeadStatus; setStatus(value); applyFilter('status', value) }} aria-label="Filter by status">
                  <NativeSelectOption value="all">All statuses</NativeSelectOption>
                  {statusOrder.map((leadStatus) => <NativeSelectOption key={leadStatus} value={leadStatus}>{statusLabels[leadStatus]}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect className="w-full" value={source} onChange={(event) => { const value = event.target.value; setSource(value); applyFilter('source', value) }} aria-label="Filter by source">
                  <NativeSelectOption value="all">All sources</NativeSelectOption>
                  {sources.map((leadSource) => <NativeSelectOption key={leadSource} value={leadSource}>{formatLabel(leadSource)}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect className="w-full" value={accountType} onChange={(event) => { const value = event.target.value as 'all' | LeadAccountType; setAccountType(value); applyFilter('accountType', value) }} aria-label="Filter by account type">
                  <NativeSelectOption value="all">All account types</NativeSelectOption>
                  {Object.entries(accountTypeLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                </NativeSelect>
                {isSalesAgent && (
                  <NativeSelect className="w-full" value={followUp} onChange={(event) => { const value = event.target.value as FollowUpFilter; setFollowUp(value); applyFollowUpFilter(value) }} aria-label="Filter by follow-up schedule">
                    <NativeSelectOption value="all">All follow-ups</NativeSelectOption>
                    <NativeSelectOption value="overdue">Overdue ({followUpCounts.overdue})</NativeSelectOption>
                    <NativeSelectOption value="today">Due today ({followUpCounts.today})</NativeSelectOption>
                    <NativeSelectOption value="upcoming">Upcoming ({followUpCounts.upcoming})</NativeSelectOption>
                    <NativeSelectOption value="unscheduled">Not scheduled ({followUpCounts.unscheduled})</NativeSelectOption>
                  </NativeSelect>
                )}
              </div>
              <LeadsTable
                leads={filteredLeads}
                showRepresentative={canFilterRepresentatives}
                embedded
                paginationKey={tableFilterKey}
                representatives={representatives}
                canAssignLeads={canAssignLeads}
                canManageWorkPlan={canManageWorkPlan}
                totalLeads={totalLeads}
                page={page}
                pageSize={pageSize}
                onPageChange={selectPage}
                onPageSizeChange={selectPageSize}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          {canAddLead && <NewLeadDialog defaultOpen={openNewLead} label="Add lead" size="default" />}
          <LeadPipelineCard counts={counts} pageScoped={!summary && totalLeads > leads.length} />
          <LeadsBySourceCard leads={leads} total={summary?.total} rows={summary?.sources} pageScoped={!summary && totalLeads > leads.length} />
          <TopRepresentativesCard leads={leads} rows={summary?.top_representatives} pageScoped={!summary && totalLeads > leads.length} />
        </aside>
      </div>
    </div>
  )
}

type FollowUpFilter = 'all' | LeadFollowUpBucket

const emptySubscribe = () => () => {}

type MetricTone = 'blue' | 'violet' | 'orange' | 'green' | 'red'

const metricToneStyles: Record<MetricTone, string> = {
  blue: 'bg-chart-1/10 text-chart-1',
  violet: 'bg-chart-3/10 text-chart-3',
  orange: 'bg-chart-4/10 text-chart-4',
  green: 'bg-success/10 text-success',
  red: 'bg-destructive/10 text-destructive',
}

function LeadMetricCard({ title, value, detail, icon, tone }: { title: string; value: number; detail: string; icon: React.ReactNode; tone: MetricTone }) {
  return (
    <Card size="sm" className="min-w-0 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] px-4">
        <CardTitle className="truncate text-[13px]">{title}</CardTitle>
        <CardAction className={cn('flex size-9 items-center justify-center rounded-lg [&_svg]:size-5', metricToneStyles[tone])}>{icon}</CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value.toLocaleString()}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function LeadPipelineCard({ counts, pageScoped = false }: { counts: Record<LeadStatus, number>; pageScoped?: boolean }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const data = statusOrder.map((status) => ({ status, leads: counts[status], fill: `var(--color-${status})` }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead pipeline</CardTitle>
        <CardDescription>{pageScoped ? 'Status breakdown for the currently loaded page.' : 'Current status of leads received in this range.'}</CardDescription>
        <CardAction><Badge variant="secondary">{pageScoped ? 'Current page' : 'Selected range'}</Badge></CardAction>
      </CardHeader>
      <CardContent>
        {total ? (
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
            <ChartContainer config={chartConfig} className="h-36 w-full aspect-auto">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
                <Pie data={data} dataKey="leads" nameKey="status" innerRadius={38} outerRadius={57} strokeWidth={3}>
                  <Label content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 3} className="fill-foreground text-lg font-bold">{total.toLocaleString()}</tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 13} className="fill-muted-foreground text-[9px]">Total leads</tspan>
                      </text>
                    )
                  }} />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex min-w-0 flex-col gap-2">
              {data.map((item) => (
                <div key={item.status} className="flex min-w-0 items-center gap-1.5 text-[11px]">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 leading-tight font-medium">{statusLabels[item.status]}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.leads} ({Math.round((item.leads / total) * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="py-12 text-center text-sm text-muted-foreground">No leads were received in this range.</p>}
      </CardContent>
    </Card>
  )
}

function LeadsBySourceCard({ leads, total, rows: aggregateRows, pageScoped = false }: { leads: LeadWithRepresentative[]; total?: number; rows?: Array<{ source: string; count: number }>; pageScoped?: boolean }) {
  const rows = aggregateRows ?? [...new Set(leads.map((lead) => lead.source))]
    .map((source) => ({ source, count: leads.filter((lead) => lead.source === source).length }))
    .sort((a, b) => b.count - a.count)
  const largest = rows[0]?.count ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads by source</CardTitle>
        <CardDescription>{pageScoped ? 'Sources represented on the current page.' : 'Where leads in this range originated.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length ? rows.slice(0, 6).map((row) => (
          <div key={row.source} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium">{formatLabel(row.source)}</span>
              <span className="tabular-nums text-muted-foreground">{row.count} ({Math.round((row.count / (total ?? leads.length)) * 100)}%)</span>
            </div>
            <Progress value={largest ? (row.count / largest) * 100 : 0} aria-label={`${formatLabel(row.source)}: ${row.count} leads`} />
          </div>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">No source data in this range.</p>}
      </CardContent>
    </Card>
  )
}

function TopRepresentativesCard({ leads, rows: aggregateRows, pageScoped = false }: { leads: LeadWithRepresentative[]; rows?: Array<{ id: string | null; name: string; count: number }>; pageScoped?: boolean }) {
  const successfulLeads = leads.filter((lead) => lead.status === 'successful')
  const rows = aggregateRows ?? [...new Set(successfulLeads.map((lead) => lead.assigned_to_profile_id ?? 'unassigned'))]
    .map((representativeId) => {
      const representativeLeads = successfulLeads.filter((lead) => (lead.assigned_to_profile_id ?? 'unassigned') === representativeId)
      const representative = representativeLeads[0]?.representative
      return { id: representativeId, name: representative?.full_name ?? representative?.email ?? 'Unassigned', count: representativeLeads.length }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const largest = rows[0]?.count ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sales agents by successful leads</CardTitle>
        <CardDescription>{pageScoped ? 'Successful leads on the current page.' : 'Current successful status in this range.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length ? rows.map((row, index) => (
          <div key={row.id ?? row.name} className="grid grid-cols-[1rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.name}</p>
              <Progress value={largest ? (row.count / largest) * 100 : 0} className="mt-1.5" aria-label={`${row.name}: ${row.count} successful leads`} />
            </div>
            <span className="text-right font-semibold tabular-nums">{row.count}</span>
          </div>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">No successful leads in this range.</p>}
      </CardContent>
    </Card>
  )
}

function shortName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)?.[0]}.` : value
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
