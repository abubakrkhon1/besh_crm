'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BriefcaseBusiness, Download, RotateCcw, Search, Target, UserRoundCheck, Users } from 'lucide-react'
import { Label, Pie, PieChart } from 'recharts'
import type { LeadWithRepresentative } from '@/app/actions/leads'
import { DashboardDateFilter } from '@/components/crm/DashboardDateFilter'
import { LeadsTable } from '@/components/crm/LeadsTable'
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
  representatives: Profile[]
  selectedRepresentativeId?: string
  canFilterRepresentatives: boolean
  canAddLead: boolean
  openNewLead: boolean
  from: string
  to: string
}

export function LeadsWorkspace({
  leads,
  representatives,
  selectedRepresentativeId,
  canFilterRepresentatives,
  canAddLead,
  openNewLead,
  from,
  to,
}: LeadsWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | LeadStatus>('all')
  const [source, setSource] = useState('all')
  const [accountType, setAccountType] = useState<'all' | LeadAccountType>('all')

  const counts = useMemo(() => Object.fromEntries(
    statusOrder.map((leadStatus) => [leadStatus, leads.filter((lead) => lead.status === leadStatus).length]),
  ) as Record<LeadStatus, number>, [leads])

  const sources = useMemo(() => [...new Set(leads.map((lead) => lead.source))].sort(), [leads])
  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return leads.filter((lead) => {
      const matchesQuery = !normalizedQuery || [
        lead.company_name,
        lead.contact_first_name,
        lead.contact_last_name,
        lead.email,
        lead.phone,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))

      return matchesQuery
        && (status === 'all' || lead.status === status)
        && (source === 'all' || lead.source === source)
        && (accountType === 'all' || lead.account_type === accountType)
    })
  }, [accountType, leads, query, source, status])

  const selectRepresentative = (representativeId: string) => {
    const next = new URLSearchParams(searchParams)
    if (representativeId === 'all') next.delete('rep')
    else next.set('rep', representativeId)
    router.push(`/crm/leads?${next}`)
  }

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setSource('all')
    setAccountType('all')
  }

  const activePipeline = counts.on_the_process + counts.follow_up
  const tableFilterKey = [query, status, source, accountType, selectedRepresentativeId ?? 'all', from, to].join('|')

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage leads across your sales team.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardDateFilter from={from} to={to} path="/crm/leads" description="Choose when leads were received." />
          <Button type="button" variant="outline" size="lg" onClick={() => exportLeads(filteredLeads)} disabled={!filteredLeads.length}>
            <Download data-icon="inline-start" />
            Export leads
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <main className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <LeadMetricCard title="Total leads" value={leads.length} detail="Received in selected range" icon={<Users />} tone="blue" />
            <LeadMetricCard title="New leads" value={counts.new} detail="Not worked yet" icon={<Target />} tone="violet" />
            <LeadMetricCard title="Active pipeline" value={activePipeline} detail="In process or follow-up" icon={<BriefcaseBusiness />} tone="orange" />
            <LeadMetricCard title="Successful" value={counts.successful} detail="Current successful status" icon={<UserRoundCheck />} tone="green" />
          </div>

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
              <CardDescription>Search and narrow the selected received-date cohort.</CardDescription>
              <CardAction>
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <RotateCcw data-icon="inline-start" />
                  Clear filters
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(9rem,1fr))]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search company, contact, email…" aria-label="Search leads" />
                </div>
                <NativeSelect className="w-full" value={status} onChange={(event) => setStatus(event.target.value as 'all' | LeadStatus)} aria-label="Filter by status">
                  <NativeSelectOption value="all">All statuses</NativeSelectOption>
                  {statusOrder.map((leadStatus) => <NativeSelectOption key={leadStatus} value={leadStatus}>{statusLabels[leadStatus]}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect className="w-full" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Filter by source">
                  <NativeSelectOption value="all">All sources</NativeSelectOption>
                  {sources.map((leadSource) => <NativeSelectOption key={leadSource} value={leadSource}>{formatLabel(leadSource)}</NativeSelectOption>)}
                </NativeSelect>
                <NativeSelect className="w-full" value={accountType} onChange={(event) => setAccountType(event.target.value as 'all' | LeadAccountType)} aria-label="Filter by account type">
                  <NativeSelectOption value="all">All account types</NativeSelectOption>
                  {Object.entries(accountTypeLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <LeadsTable
                leads={filteredLeads}
                showRepresentative={canFilterRepresentatives}
                embedded
                paginationKey={tableFilterKey}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          {canAddLead && <NewLeadDialog defaultOpen={openNewLead} label="Add lead" size="default" />}
          <LeadPipelineCard counts={counts} />
          <LeadsBySourceCard leads={leads} />
          <TopRepresentativesCard leads={leads} />
        </aside>
      </div>
    </div>
  )
}

type MetricTone = 'blue' | 'violet' | 'orange' | 'green'

const metricToneStyles: Record<MetricTone, string> = {
  blue: 'bg-chart-1/10 text-chart-1',
  violet: 'bg-chart-3/10 text-chart-3',
  orange: 'bg-chart-4/10 text-chart-4',
  green: 'bg-success/10 text-success',
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

function LeadPipelineCard({ counts }: { counts: Record<LeadStatus, number> }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const data = statusOrder.map((status) => ({ status, leads: counts[status], fill: `var(--color-${status})` }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead pipeline</CardTitle>
        <CardDescription>Current status of leads received in this range.</CardDescription>
        <CardAction><Badge variant="secondary">Selected range</Badge></CardAction>
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

function LeadsBySourceCard({ leads }: { leads: LeadWithRepresentative[] }) {
  const rows = [...new Set(leads.map((lead) => lead.source))]
    .map((source) => ({ source, count: leads.filter((lead) => lead.source === source).length }))
    .sort((a, b) => b.count - a.count)
  const largest = rows[0]?.count ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads by source</CardTitle>
        <CardDescription>Where leads in this range originated.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length ? rows.slice(0, 6).map((row) => (
          <div key={row.source} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium">{formatLabel(row.source)}</span>
              <span className="tabular-nums text-muted-foreground">{row.count} ({Math.round((row.count / leads.length) * 100)}%)</span>
            </div>
            <Progress value={largest ? (row.count / largest) * 100 : 0} aria-label={`${formatLabel(row.source)}: ${row.count} leads`} />
          </div>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">No source data in this range.</p>}
      </CardContent>
    </Card>
  )
}

function TopRepresentativesCard({ leads }: { leads: LeadWithRepresentative[] }) {
  const successfulLeads = leads.filter((lead) => lead.status === 'successful')
  const rows = [...new Set(successfulLeads.map((lead) => lead.assigned_to_profile_id ?? 'unassigned'))]
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
        <CardDescription>Current successful status in this range.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length ? rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[1rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
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

function exportLeads(leads: LeadWithRepresentative[]) {
  const headers = ['Company', 'Contact', 'Email', 'Phone', 'Fleet', 'Account Type', 'Source', 'Status', 'Sales Agent', 'Received', 'Estimated Gallons']
  const rows = leads.map((lead) => [
    lead.company_name ?? '',
    `${lead.contact_first_name} ${lead.contact_last_name}`.trim(),
    lead.email ?? '',
    lead.phone ?? '',
    lead.fleet_size ?? '',
    accountTypeLabels[lead.account_type],
    formatLabel(lead.source),
    statusLabels[lead.status],
    lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned',
    lead.created_at,
    lead.estimated_monthly_gallons ?? '',
  ])
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function shortName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)?.[0]}.` : value
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
